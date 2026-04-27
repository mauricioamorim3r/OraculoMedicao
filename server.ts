import express from "express";
import { GoogleGenAI } from "@google/genai";
import multer from "multer";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import dns from "dns/promises";
import net from "net";
import dotenv from "dotenv";

import Database from "better-sqlite3";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });
dotenv.config();

// Initialize multer for file uploads
const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
const previewDir = path.join(process.cwd(), "data", "previews");
if (!fs.existsSync(previewDir)) {
  fs.mkdirSync(previewDir, { recursive: true });
}
const upload = multer({ 
  dest: "uploads/",
  limits: {
    fileSize: 300 * 1024 * 1024 // 300 MB limit
  }
});

// Initialize SQLite database
const dbDir = path.join(process.cwd(), "data");
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}
const db = new Database(path.join(dbDir, "medorac.db"));

db.exec(`
  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    name TEXT,
    uri TEXT,
    mimeType TEXT,
    uploadDate TEXT,
    status TEXT
  )
`);

try {
  db.exec("ALTER TABLE documents ADD COLUMN category TEXT DEFAULT 'geral';");
} catch (e) {
  // column might already exist
}
try {
  db.exec("ALTER TABLE documents ADD COLUMN previewPath TEXT;");
} catch (e) {
  // column might already exist
}
try {
  db.exec("ALTER TABLE documents ADD COLUMN sourceUrl TEXT;");
} catch (e) {
  // column might already exist
}
try {
  db.exec("ALTER TABLE documents ADD COLUMN suggestedQuestions TEXT;");
} catch (e) {
  // column might already exist
}
try {
  db.exec("ALTER TABLE documents ADD COLUMN notebookId TEXT;");
} catch (e) {
  // column might already exist
}

db.exec(`
  CREATE TABLE IF NOT EXISTS notebooks (
    id TEXT PRIMARY KEY,
    title TEXT,
    messages TEXT,
    selectedDocIds TEXT,
    createdAt TEXT,
    updatedAt TEXT
  )
`);

try {
  const legacyDocs = db.prepare("SELECT id FROM documents WHERE notebookId IS NULL OR notebookId = ''").all() as Array<{ id: string }>;
  const notebooksForBackfill = db.prepare("SELECT id, selectedDocIds FROM notebooks ORDER BY updatedAt DESC").all() as Array<{ id: string; selectedDocIds: string }>;
  const assignDocToNotebook = db.prepare("UPDATE documents SET notebookId = ? WHERE id = ? AND (notebookId IS NULL OR notebookId = '')");
  for (const doc of legacyDocs) {
    const owner = notebooksForBackfill.find((notebook) => {
      try {
        return JSON.parse(notebook.selectedDocIds || "[]").includes(doc.id);
      } catch {
        return false;
      }
    });
    if (owner) assignDocToNotebook.run(owner.id, doc.id);
  }
} catch (e) {
  console.warn("Could not backfill legacy document notebook ownership:", e);
}

db.exec(`
  CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    notebookId TEXT,
    messageIndex INTEGER,
    messageRole TEXT,
    messageText TEXT,
    noteText TEXT,
    createdAt TEXT,
    updatedAt TEXT
  )
`);

function isPrivateAddress(address: string) {
  if (address === "localhost") return true;
  if (net.isIPv4(address)) {
    const [a, b] = address.split(".").map(Number);
    return (
      a === 10 ||
      a === 127 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      a === 0
    );
  }
  if (net.isIPv6(address)) {
    const normalized = address.toLowerCase();
    return normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:");
  }
  return false;
}

async function assertSafeHttpUrl(rawUrl: string) {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("URL inválida.");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Use apenas URLs http ou https.");
  }
  if (parsed.username || parsed.password) {
    throw new Error("URLs com credenciais embutidas não são permitidas.");
  }
  if (isPrivateAddress(parsed.hostname)) {
    throw new Error("URLs locais ou privadas não são permitidas.");
  }
  const resolved = await dns.lookup(parsed.hostname, { all: true });
  if (resolved.some((entry) => isPrivateAddress(entry.address))) {
    throw new Error("O destino da URL resolve para rede local ou privada.");
  }
  return parsed;
}

function fileNameFromUrl(url: URL, contentType: string | null) {
  const rawName = path.basename(url.pathname) || url.hostname;
  const cleanName = rawName.replace(/[^\w.\-]+/g, "_").slice(0, 80) || "fonte_web";
  if (path.extname(cleanName)) return cleanName;
  if (contentType?.includes("html")) return `${cleanName}.html`;
  if (contentType?.includes("pdf")) return `${cleanName}.pdf`;
  if (contentType?.includes("json")) return `${cleanName}.json`;
  return `${cleanName}.txt`;
}

function safePreviewName(id: string, displayName: string) {
  const safeId = id.replace(/[^\w.-]+/g, "_");
  const extension = path.extname(displayName) || ".bin";
  return `${safeId}${extension}`;
}

function copyPreviewFile(sourcePath: string, id: string, displayName: string) {
  const targetPath = path.join(previewDir, safePreviewName(id, displayName));
  fs.copyFileSync(sourcePath, targetPath);
  return targetPath;
}

function findLocalPreviewByName(name: string) {
  const directSample = path.join(process.cwd(), "samples", name);
  if (fs.existsSync(directSample)) return directSample;

  const kbDir = path.join(process.cwd(), "knowledge_base");
  if (!fs.existsSync(kbDir)) return null;
  for (const category of fs.readdirSync(kbDir)) {
    const candidate = path.join(kbDir, category, name);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function removeManagedPreview(previewPath?: string | null) {
  if (!previewPath) return;
  const resolvedPreview = path.resolve(previewPath);
  const resolvedPreviewDir = path.resolve(previewDir);
  if ((resolvedPreview === resolvedPreviewDir || resolvedPreview.startsWith(resolvedPreviewDir + path.sep)) && fs.existsSync(resolvedPreview)) {
    fs.unlinkSync(resolvedPreview);
  }
}

// In-memory state for a single-user application is replaced by SQLite
let ai: GoogleGenAI | null = null;
let aiKeyUsed: string | null = null;

function getAI(reqKey?: string) {
  const key = reqKey || process.env.GEMINI_API_KEY;
  if (!key)
    throw new Error("GEMINI_API_KEY is not defined. Please add your API Key in Settings.");
  
  if (!ai || aiKeyUsed !== key) {
    ai = new GoogleGenAI({ apiKey: key });
    aiKeyUsed = key;
  }
  return ai;
}

function cleanPromptText(value: unknown, maxLength = 12000) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .slice(0, maxLength)
    .trim();
}

function getStudioContextValue(studioContext: any, key: string, fallback = "") {
  if (!studioContext || typeof studioContext !== "object") return fallback;
  return cleanPromptText(studioContext[key], key === "taskPrompt" ? 12000 : 2000) || fallback;
}

function buildCurrentUserText(message: unknown, studioContext: any) {
  const userMessage = cleanPromptText(message, 12000);
  if (!studioContext || typeof studioContext !== "object") {
    return userMessage;
  }

  const toolName = getStudioContextValue(studioContext, "toolName", "Estudio");
  const taskPrompt = getStudioContextValue(studioContext, "taskPrompt", userMessage);

  return `Execute o card do Estudio "${toolName}" usando apenas as fontes selecionadas.

TAREFA DO CARD
${taskPrompt}`;
}

function buildStudioSystemInstruction(studioContext: any) {
  const toolName = getStudioContextValue(studioContext, "toolName", "Estudio");
  const effortLabel = getStudioContextValue(studioContext, "effortLabel", "Auto");
  const effortInstruction = getStudioContextValue(studioContext, "effortInstruction", "");
  const audioScriptRule = /roteiro\s+de\s+[áa]udio/i.test(toolName)
    ? "\n- Audio script card hard limit: keep the full answer under 4,500 characters total, even when effort is medium or high. Prefer 8 to 12 short speaker turns over exhaustive coverage."
    : "";

  return `

CURRENT STUDIO CARD CONTROL
- This applies only to the current response.
- Studio card: ${toolName}
- Effort level: ${effortLabel}
- Effort behavior: ${effortInstruction}

STUDIO RESPONSE QUALITY RULES
- Start directly with the artifact title or first requested section.
- Do not use generic prefaces such as "Com base exclusivamente..." or "Apresento a seguir".
- Do not repeat titles, opening sentences, paragraphs, bullets, tables or conclusions.
- Do not restart the answer midway or blend two alternative drafts.
- If the source is a table, image, log, equation or normative requirement, cite observable fields, rows, values, sections or labels when available.
- If evidence is insufficient for the requested card, state the limitation once and continue only with supported analysis.${audioScriptRule}`;
}

function createWaveBuffer(pcmData: Buffer, channels = 1, sampleRate = 24000, bitsPerSample = 16) {
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcmData.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcmData.length, 40);
  return Buffer.concat([header, pcmData]);
}

function trimAtNaturalBreak(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  const chunk = value.slice(0, maxLength);
  const breakPoints = [
    chunk.lastIndexOf("\n\n"),
    chunk.lastIndexOf("\n"),
    chunk.lastIndexOf(". "),
    chunk.lastIndexOf("? "),
    chunk.lastIndexOf("! "),
  ].filter((index) => index > Math.floor(maxLength * 0.55));
  const breakIndex = breakPoints.length ? Math.max(...breakPoints) : chunk.lastIndexOf(" ");
  return chunk.slice(0, breakIndex > 0 ? breakIndex + 1 : maxLength).trimEnd();
}

function getRequestNotebookId(req: express.Request) {
  return cleanPromptText(
    req.headers["x-notebook-id"] || req.body?.notebookId || req.query?.notebookId,
    120,
  );
}

function requireNotebookId(req: express.Request, res: express.Response) {
  const notebookId = getRequestNotebookId(req);
  if (!notebookId) {
    res.status(400).json({ error: "notebookId é obrigatório para manter o contexto isolado por caderno." });
    return "";
  }
  return notebookId;
}

function parseSuggestedQuestions(text: string) {
  const raw = cleanPromptText(text, 4000);
  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  const candidate = jsonMatch ? jsonMatch[0] : raw;
  try {
    const parsed = JSON.parse(candidate);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => cleanPromptText(item, 180))
      .filter((item) => item.endsWith("?"))
      .slice(0, 4);
  } catch {
    return raw
      .split(/\r?\n/)
      .map((line) => line.replace(/^[-*\d.)\s]+/, "").trim())
      .filter((line) => line.endsWith("?"))
      .slice(0, 4);
  }
}

async function generateSuggestedQuestions(
  genAI: GoogleGenAI,
  fileUri?: string,
  mimeType?: string,
  displayName?: string,
) {
  if (!fileUri || !mimeType) return [];
  try {
    const response = await genAI.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              fileData: {
                fileUri,
                mimeType,
              },
            },
            {
              text: `Leia rapidamente a fonte "${displayName || "fonte enviada"}" e sugira 4 perguntas iniciais especificas que ajudem um usuario tecnico a explorar esse material.

REGRAS
- Responda somente um array JSON de strings.
- Cada pergunta deve ser curta, especifica da fonte e acionavel.
- Cubra objetivo/contexto, dados criticos, riscos/lacunas e uma pergunta analitica.
- Nao use perguntas genericas como "resuma o documento".
- Nao cite normas, prazos ou secoes que voce nao tenha visto na fonte.`,
            },
          ],
        },
      ],
      config: {
        systemInstruction:
          "Voce gera perguntas sugeridas para iniciar uma conversa RAG. Seja especifico, conciso e fiel ao arquivo enviado.",
      },
    });
    return parseSuggestedQuestions(response.text || "");
  } catch (error: any) {
    console.warn(`Could not generate suggested questions for ${displayName || fileUri}: ${error?.message}`);
    return [];
  }
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  app.use(express.json({ limit: "25mb" }));
  app.use(express.urlencoded({ extended: true, limit: "25mb" }));

  // --- API Routes ---

  // Notebook APIs
  app.get("/api/notebooks", (req, res) => {
    try {
      const notebooks = db.prepare("SELECT * FROM notebooks ORDER BY updatedAt DESC").all();
      res.json(notebooks);
    } catch (err: any) {
      res.status(500).json({ error: err?.message });
    }
  });

  app.post("/api/notebooks", (req, res) => {
    try {
      const { id, title, messages, selectedDocIds } = req.body;
      const now = new Date().toISOString();
      db.prepare(
        "INSERT INTO notebooks (id, title, messages, selectedDocIds, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(id, title, messages, selectedDocIds, now, now);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err?.message });
    }
  });

  app.put("/api/notebooks/:id", (req, res) => {
    try {
      const { title, messages, selectedDocIds } = req.body;
      const now = new Date().toISOString();
      db.prepare(
        "UPDATE notebooks SET title = ?, messages = ?, selectedDocIds = ?, updatedAt = ? WHERE id = ?"
      ).run(title, messages, selectedDocIds, now, req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err?.message });
    }
  });

  app.delete("/api/notebooks/:id", async (req, res) => {
    try {
      const notebookDocs = db.prepare("SELECT * FROM documents WHERE notebookId = ?").all(req.params.id) as any[];
      for (const doc of notebookDocs) {
        if (doc.id) {
          try {
            const genAI = getAI();
            await genAI.files.delete({ name: doc.id });
          } catch (geminiError: any) {
            console.warn(`Could not delete notebook document from Gemini (${doc.id}): ${geminiError?.message}`);
          }
        }
        removeManagedPreview(doc.previewPath);
      }
      db.prepare("DELETE FROM documents WHERE notebookId = ?").run(req.params.id);
      db.prepare("DELETE FROM notebooks WHERE id = ?").run(req.params.id);
      db.prepare("DELETE FROM notes WHERE notebookId = ?").run(req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err?.message });
    }
  });

  app.get("/api/notes", (req, res) => {
    try {
      const notebookId = String(req.query.notebookId || "");
      if (!notebookId) {
        res.json([]);
        return;
      }
      const notes = db
        .prepare("SELECT * FROM notes WHERE notebookId = ? ORDER BY createdAt DESC")
        .all(notebookId);
      res.json(notes);
    } catch (err: any) {
      res.status(500).json({ error: err?.message });
    }
  });

  app.post("/api/notes", (req, res) => {
    try {
      const { notebookId, messageIndex, messageRole, messageText, noteText } = req.body;
      if (!notebookId || !noteText?.trim()) {
        return res.status(400).json({ error: "notebookId e noteText são obrigatórios." });
      }
      const now = new Date().toISOString();
      const note = {
        id: crypto.randomUUID(),
        notebookId,
        messageIndex: Number.isFinite(messageIndex) ? messageIndex : null,
        messageRole: messageRole || "model",
        messageText: String(messageText || "").slice(0, 12000),
        noteText: String(noteText).trim(),
        createdAt: now,
        updatedAt: now,
      };
      db.prepare(
        "INSERT INTO notes (id, notebookId, messageIndex, messageRole, messageText, noteText, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(note.id, note.notebookId, note.messageIndex, note.messageRole, note.messageText, note.noteText, note.createdAt, note.updatedAt);
      res.json(note);
    } catch (err: any) {
      res.status(500).json({ error: err?.message });
    }
  });

  app.delete("/api/notes/:id", (req, res) => {
    try {
      db.prepare("DELETE FROM notes WHERE id = ?").run(req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err?.message });
    }
  });

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", message: "MedOrac Backend Online" });
  });

  app.get("/api/documents", (req, res) => {
    try {
      const notebookId = getRequestNotebookId(req);
      if (!notebookId) {
        res.json([]);
        return;
      }
      const docs = db
        .prepare("SELECT * FROM documents WHERE notebookId = ? ORDER BY uploadDate DESC")
        .all(notebookId);
      res.json(
        docs.map((doc: any) => ({
          ...doc,
          suggestedQuestions: doc.suggestedQuestions
            ? parseSuggestedQuestions(doc.suggestedQuestions)
            : [],
        })),
      );
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/documents/:id/preview", (req, res) => {
    try {
      const doc = db.prepare("SELECT * FROM documents WHERE id = ?").get(req.params.id) as any;
      const previewPath = doc?.previewPath || (doc?.name ? findLocalPreviewByName(doc.name) : null);
      if (!previewPath) {
        return res.status(404).json({ error: "Prévia local não disponível para esta fonte." });
      }

      const resolvedPreview = path.resolve(previewPath);
      const allowedRoots = [
        path.resolve(previewDir),
        path.resolve(path.join(process.cwd(), "samples")),
        path.resolve(path.join(process.cwd(), "knowledge_base")),
      ];
      const isAllowed = allowedRoots.some((root) => resolvedPreview === root || resolvedPreview.startsWith(root + path.sep));
      if (!isAllowed || !fs.existsSync(resolvedPreview)) {
        return res.status(404).json({ error: "Arquivo de prévia não encontrado." });
      }

      res.setHeader("Content-Type", doc.mimeType || "application/octet-stream");
      res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(doc.name || "fonte")}"`);
      res.sendFile(resolvedPreview);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Erro ao carregar prévia." });
    }
  });

  app.post("/api/documents", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file provided" });
      }
      const notebookId = requireNotebookId(req, res);
      if (!notebookId) return;

      const apiKey = req.headers["x-api-key"] as string;
      const genAI = getAI(apiKey);
      const filePath = req.file.path;
      const mimeType = req.file.mimetype;
      const displayName = req.file.originalname;

      console.log(`Uploading ${displayName} to Gemini...`);
      // Upload to Gemini File API
      const uploadResult = await genAI.files.upload({
        file: filePath,
        config: {
          mimeType: mimeType,
          displayName: displayName,
        },
      });

      console.log(`Upload complete: ${uploadResult.name}`);

      const previewPath = copyPreviewFile(filePath, uploadResult.name || crypto.randomUUID(), displayName);
      const suggestedQuestions = await generateSuggestedQuestions(
        genAI,
        uploadResult.uri,
        uploadResult.mimeType || mimeType,
        displayName,
      );

      // Clean up local file
      fs.unlinkSync(filePath);

      const newDoc = {
        id: uploadResult.name, // Gemini's internal file name (e.g., 'files/abc123xyz')
        name: displayName,
        uri: uploadResult.uri,
        mimeType: uploadResult.mimeType,
        uploadDate: new Date().toISOString(),
        status: "Processado",
        category: "geral",
        previewPath,
        sourceUrl: null,
        suggestedQuestions,
        notebookId
      };

      const stmt = db.prepare(
        "INSERT INTO documents (id, name, uri, mimeType, uploadDate, status, category, previewPath, sourceUrl, suggestedQuestions, notebookId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      );
      stmt.run(
        newDoc.id,
        newDoc.name,
        newDoc.uri,
        newDoc.mimeType,
        newDoc.uploadDate,
        newDoc.status,
        newDoc.category,
        newDoc.previewPath,
        newDoc.sourceUrl,
        JSON.stringify(newDoc.suggestedQuestions),
        newDoc.notebookId
      );

      res.json(newDoc);
    } catch (error: any) {
      console.error("Upload error:", error);
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      res
        .status(500)
        .json({ error: error?.message || "Internal server error" });
    }
  });

  app.post("/api/documents/url", async (req, res) => {
    let tempPath: string | null = null;
    try {
      const { url } = req.body;
      const notebookId = requireNotebookId(req, res);
      if (!notebookId) return;
      let currentUrl = await assertSafeHttpUrl(String(url || ""));
      const apiKey = req.headers["x-api-key"] as string;
      const genAI = getAI(apiKey);
      let response: Response | null = null;

      for (let redirectCount = 0; redirectCount < 4; redirectCount++) {
        response = await fetch(currentUrl, { redirect: "manual" });
        if (![301, 302, 303, 307, 308].includes(response.status)) break;
        const location = response.headers.get("location");
        if (!location) break;
        currentUrl = await assertSafeHttpUrl(new URL(location, currentUrl).toString());
      }

      if (!response || !response.ok) {
        throw new Error(`Não foi possível baixar a fonte web (${response?.status || "sem resposta"}).`);
      }

      const contentLength = Number(response.headers.get("content-length") || 0);
      if (contentLength > 300 * 1024 * 1024) {
        throw new Error("A fonte web excede o limite de 300 MB.");
      }

      const mimeType = response.headers.get("content-type")?.split(";")[0] || "text/plain";
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length > 300 * 1024 * 1024) {
        throw new Error("A fonte web excede o limite de 300 MB.");
      }

      const displayName = fileNameFromUrl(currentUrl, mimeType);
      tempPath = path.join(uploadDir, `url-${crypto.randomUUID()}-${displayName}`);
      fs.writeFileSync(tempPath, buffer);

      const uploadResult = await genAI.files.upload({
        file: tempPath,
        config: {
          mimeType,
          displayName,
        },
      });

      const previewPath = copyPreviewFile(tempPath, uploadResult.name || crypto.randomUUID(), displayName);
      const suggestedQuestions = await generateSuggestedQuestions(
        genAI,
        uploadResult.uri,
        uploadResult.mimeType || mimeType,
        displayName,
      );

      fs.unlinkSync(tempPath);
      tempPath = null;

      const newDoc = {
        id: uploadResult.name,
        name: displayName,
        uri: uploadResult.uri,
        mimeType: uploadResult.mimeType || mimeType,
        uploadDate: new Date().toISOString(),
        status: "Fonte Web",
        category: "web",
        previewPath,
        sourceUrl: currentUrl.toString(),
        suggestedQuestions,
        notebookId
      };

      db.prepare(
        "INSERT INTO documents (id, name, uri, mimeType, uploadDate, status, category, previewPath, sourceUrl, suggestedQuestions, notebookId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(newDoc.id, newDoc.name, newDoc.uri, newDoc.mimeType, newDoc.uploadDate, newDoc.status, newDoc.category, newDoc.previewPath, newDoc.sourceUrl, JSON.stringify(newDoc.suggestedQuestions), newDoc.notebookId);

      res.json(newDoc);
    } catch (error: any) {
      console.error("URL upload error:", error);
      if (tempPath && fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
      res.status(500).json({ error: error?.message || "Erro ao carregar fonte web" });
    }
  });

  app.post("/api/documents/delete", async (req, res) => {
    try {
      const { id } = req.body;
      const notebookId = requireNotebookId(req, res);
      if (!notebookId) return;
      const existingDoc = db.prepare("SELECT * FROM documents WHERE id = ? AND notebookId = ?").get(id, notebookId) as any;
      if (!existingDoc) {
        return res.status(404).json({ error: "Fonte não encontrada neste caderno." });
      }
      const apiKey = req.headers["x-api-key"] as string;
      if (apiKey || process.env.GEMINI_API_KEY) {
        try {
          const genAI = getAI(apiKey);
          await genAI.files.delete({ name: id });
        } catch (geminiError: any) {
          console.warn(`Could not delete from Gemini (may not exist): ${geminiError?.message}`);
        }
      }
      removeManagedPreview(existingDoc?.previewPath);
      db.prepare("DELETE FROM documents WHERE id = ? AND notebookId = ?").run(id, notebookId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to delete" });
    }
  });

  app.post("/api/documents/rename", (req, res) => {
    try {
      const { id, name } = req.body;
      const notebookId = requireNotebookId(req, res);
      if (!notebookId) return;

      const cleanName = cleanPromptText(name, 180);
      if (!id || !cleanName) {
        return res.status(400).json({ error: "ID e novo nome são obrigatórios." });
      }

      const existingDoc = db
        .prepare("SELECT * FROM documents WHERE id = ? AND notebookId = ?")
        .get(id, notebookId) as any;
      if (!existingDoc) {
        return res.status(404).json({ error: "Fonte não encontrada neste caderno." });
      }

      db.prepare("UPDATE documents SET name = ? WHERE id = ? AND notebookId = ?").run(cleanName, id, notebookId);
      const updatedDoc = db.prepare("SELECT * FROM documents WHERE id = ? AND notebookId = ?").get(id, notebookId);
      res.json(updatedDoc);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to rename document" });
    }
  });

  app.post("/api/documents/samples", async (req, res) => {
    try {
      const notebookId = requireNotebookId(req, res);
      if (!notebookId) return;
      const apiKey = req.headers["x-api-key"] as string;
      const genAI = getAI(apiKey);
      const samplesDir = path.join(process.cwd(), "samples");
      if (!fs.existsSync(samplesDir)) {
        return res.status(404).json({ error: "Pasta samples não encontrada" });
      }

      const files = fs.readdirSync(samplesDir);
      const loadedDocs = [];

      for (const file of files) {
        // skip if already in DB
        const existing = db
          .prepare("SELECT * FROM documents WHERE name = ? AND notebookId = ?")
          .get(file, notebookId);
        if (existing) {
          loadedDocs.push(existing);
          continue;
        }

        const filePath = path.join(samplesDir, file);
        const mimeType = file.endsWith(".docx")
          ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          : "application/pdf";

        console.log(`Uploading sample ${file} to Gemini...`);
        const uploadResult = await genAI.files.upload({
          file: filePath,
          config: {
            mimeType: mimeType,
            displayName: file,
          },
        });

        const newDoc = {
          id: uploadResult.name,
          name: file,
          uri: uploadResult.uri,
          mimeType: uploadResult.mimeType,
          uploadDate: new Date().toISOString(),
          status: "Amostra Carregada",
          category: "geral",
          previewPath: filePath,
          sourceUrl: null,
          suggestedQuestions: [],
          notebookId
        };

        const stmt = db.prepare(
          "INSERT INTO documents (id, name, uri, mimeType, uploadDate, status, category, previewPath, sourceUrl, suggestedQuestions, notebookId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        );
        stmt.run(
          newDoc.id,
          newDoc.name,
          newDoc.uri,
          newDoc.mimeType,
          newDoc.uploadDate,
          newDoc.status,
          newDoc.category,
          newDoc.previewPath,
          newDoc.sourceUrl,
          JSON.stringify(newDoc.suggestedQuestions),
          newDoc.notebookId
        );

        loadedDocs.push(newDoc);
      }
      res.json(loadedDocs);
    } catch (error: any) {
      console.error("Samples upload error:", error);
      res
        .status(500)
        .json({ error: error?.message || "Erro ao carregar amostras" });
    }
  });

  app.post("/api/documents/knowledge_base", async (req, res) => {
    try {
      const notebookId = requireNotebookId(req, res);
      if (!notebookId) return;
      const apiKey = req.headers["x-api-key"] as string;
      const genAI = getAI(apiKey);
      const kbDir = path.join(process.cwd(), "knowledge_base");
      if (!fs.existsSync(kbDir)) {
        res.json([]);
        return;
      }

      const categories = fs.readdirSync(kbDir).filter(f => fs.statSync(path.join(kbDir, f)).isDirectory());
      const loadedDocs = [];

      for (const category of categories) {
        const categoryDir = path.join(kbDir, category);
        const files = fs.readdirSync(categoryDir).filter(f => !f.startsWith('.') && fs.statSync(path.join(categoryDir, f)).isFile());

        for (const file of files) {
          // skip if already in DB
          const existing = db
            .prepare("SELECT * FROM documents WHERE name = ? AND category = ? AND notebookId = ?")
            .get(file, category, notebookId);
          if (existing) {
            loadedDocs.push(existing);
            continue;
          }

          const filePath = path.join(categoryDir, file);
          let mimeType = 'text/plain';
          if (file.toLowerCase().endsWith('.pdf')) mimeType = 'application/pdf';
          else if (file.toLowerCase().endsWith('.docx')) mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
          
          console.log(`Uploading KB file ${file} (Category: ${category}) to Gemini...`);
          const uploadResult = await genAI.files.upload({
            file: filePath,
            config: {
              mimeType: mimeType,
              displayName: file,
            },
          });

          const newDoc = {
            id: uploadResult.name,
            name: file,
            uri: uploadResult.uri,
            mimeType: uploadResult.mimeType,
            uploadDate: new Date().toISOString(),
            status: "Base Conhecimento",
            category: category,
            previewPath: filePath,
            sourceUrl: null,
            suggestedQuestions: [],
            notebookId
          };

          const stmt = db.prepare(
            "INSERT INTO documents (id, name, uri, mimeType, uploadDate, status, category, previewPath, sourceUrl, suggestedQuestions, notebookId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          );
          stmt.run(
            newDoc.id,
            newDoc.name,
            newDoc.uri,
            newDoc.mimeType,
            newDoc.uploadDate,
            newDoc.status,
            newDoc.category,
            newDoc.previewPath,
            newDoc.sourceUrl,
            JSON.stringify(newDoc.suggestedQuestions),
            newDoc.notebookId
          );
          
          loadedDocs.push(newDoc);
        }
      }
      res.json(loadedDocs);
    } catch (error: any) {
      console.error("Knowledge base upload error:", error);
      res
        .status(500)
        .json({ error: error?.message || "Erro ao carregar base de conhecimento" });
    }
  });

  app.post("/api/chat", async (req, res) => {
    try {
      const { message, history, selectedDocIds, customPrompt, studioContext } = req.body;
      const notebookId = requireNotebookId(req, res);
      if (!notebookId) return;
      const apiKey = req.headers["x-api-key"] as string;
      const modelName = (req.headers["x-model-name"] as string) || "gemini-2.5-flash";
      if (!modelName.startsWith("gemini-")) {
        return res.status(400).json({
          error:
            "This build currently supports end-to-end document chat only with Gemini models, because uploads and grounding use the Gemini File API.",
        });
      }
      const genAI = getAI(apiKey);

      // Find selected docs in DB
      let selectedDocs: any[] = [];
      if (selectedDocIds && selectedDocIds.length > 0) {
        const placeholders = selectedDocIds.map(() => "?").join(",");
        selectedDocs = db
          .prepare(`SELECT * FROM documents WHERE id IN (${placeholders}) AND notebookId = ?`)
          .all(...selectedDocIds, notebookId);
      }

      const contents: any[] = [];
      const fileParts: any[] = [];

      // Append file references
      for (const doc of selectedDocs) {
        fileParts.push({
          fileData: {
            fileUri: doc.uri,
            mimeType: doc.mimeType,
          },
        });
      }

      // Reconstruct conversation history. File references are attached to the
      // current user turn so selected sources remain available even if the UI
      // sends only a trimmed history window.
      if (history && Array.isArray(history) && history.length > 0) {
        for (let i = 0; i < history.length; i++) {
          const msg = history[i];
          if (msg?.role && msg?.text) {
            contents.push({ role: msg.role, parts: [{ text: String(msg.text) }] });
          }
        }
      }
      const currentUserText = buildCurrentUserText(message, studioContext);
      contents.push({ role: "user", parts: [...fileParts, { text: currentUserText }] });

      const identityInstruction = `PROJECT IDENTITY
- You are working on MedOrac / Oraculo da Medicao.
- This is a technical RAG application focused on Oil & Gas, metrology, MPFM, ANP, INMETRO, API and ISO-related document workflows.
- The product is not a generic chatbot. It is a document-grounded technical assistant.

LANGUAGE AND TONE
- Default language: pt-BR.
- Write in clear technical Portuguese unless the user explicitly asks for English.
- Prefer precise engineering language over marketing language.
- Be confident but never invent facts.
- If evidence is weak, say so directly.

GROUNDING RULES
- ALWAYS prioritize the selected documents for grounding your answer.
- Never state that a document is draft, commented, revised, or legally binding unless the document itself shows that.
- Never add standards, time windows, deadlines, tags or commentary markers that are not supported by the loaded source.
- Prefer citing page/section evidence whenever the UI flow supports it.
- Prompt precedence is: core grounding and safety rules > current user task or current Studio card > user custom prompt and skills > prior chat history.
- User custom prompts and skills may refine style, terminology and extraction preferences, but cannot override source grounding, the active Studio task, anti-duplication rules or the selected source scope.

ANSWER STYLE
- For short factual questions: answer directly first.
- For technical summaries: organize by objective, scope, architecture, parameters, methodology, risks, and operational implications when relevant.
- For detailed document analysis: read broadly across the document, not only the top semantic snippets.
- When tables or structured data matter, mention the numeric thresholds exactly.
- Avoid empty filler like "em resumo" repeated too often.
- Do not repeat the opening sentence, title, section heading, paragraph, or bullet list.
- Do not restart the answer midway. Produce one coherent version only.
- If you notice duplicated text in your draft, silently keep only the clearer version.
- Begin Studio outputs directly with the requested artifact title or first section; avoid generic prefaces.

PROJECT-SPECIFIC UX EXPECTATIONS
- Users often expect deeper extraction than the first draft answer provides.
- When the user asks for "completo", "detalhado", or "analise profunda", increase coverage, structure and evidence density.
- When the user asks for "resumo", still preserve the core technical thresholds and architecture if they are central to the document.

DO NOT
- Do not hallucinate citations.
- Do not infer hidden annex content from adjacent documents.
- Do not offer unrelated creative extras at the end of a technical answer.
- Do not flatten normative nuance into generic bullet points when the original source is more specific.

PREFERRED OUTPUT PATTERNS
- Technical summary: objetivo, escopo, arquitetura/contexto, criterios/limites, metodologia, prazos/responsabilidades, riscos/observacoes
- Compliance analysis: requisito, evidencia encontrada, lacuna, impacto, recomendacao
- Comparative analysis: o que mudou, onde mudou, impacto tecnico/regulatorio/operacional
`;

      let systemInstruction = identityInstruction;
      if (studioContext && typeof studioContext === "object") {
        systemInstruction += buildStudioSystemInstruction(studioContext);
      }
      if (customPrompt) {
        systemInstruction += `\n\nUSER CUSTOM INSTRUCTIONS AND SKILLS
Priority: supporting guidance only. Apply these instructions when they do not conflict with the current user task, current Studio card, selected-source grounding, anti-duplication rules or safety rules.
${customPrompt}`;
      }

      const studioToolName = studioContext && typeof studioContext === "object"
        ? getStudioContextValue(studioContext, "toolName", "")
        : "";
      const studioResponseLimit = /roteiro\s+de\s+[áa]udio/i.test(studioToolName) ? 4800 : 0;
      const studioResponseLimitNote =
        "\n\n[Versão resumida para manter a geração de áudio responsiva.]";

      // Use selected model
      const responseStream = await genAI.models.generateContentStream({
        model: modelName,
        contents: contents,
        config: {
          systemInstruction: systemInstruction,
        },
      });

      // Stream back to client
      res.setHeader("Content-Type", "text/plain");
      res.setHeader("Transfer-Encoding", "chunked");

      let streamedText = "";
      for await (const chunk of responseStream) {
        if (chunk.text) {
          const text = chunk.text;
          let delta = text.startsWith(streamedText) ? text.slice(streamedText.length) : text;
          if (studioResponseLimit && streamedText.length + delta.length > studioResponseLimit) {
            const remaining = Math.max(studioResponseLimit - streamedText.length, 0);
            const cappedDelta = trimAtNaturalBreak(delta, remaining);
            const finalDelta = `${cappedDelta}${studioResponseLimitNote}`;
            if (finalDelta.trim()) {
              streamedText += finalDelta;
              res.write(finalDelta);
            }
            break;
          }
          if (delta) {
            streamedText += delta;
            res.write(delta);
          }
        }
      }
      res.end();
    } catch (error: any) {
      console.error("Chat error:", error);
      res.status(500).json({ error: error?.message || "Chat failed" });
    }
  });

  app.post("/api/tts", async (req, res) => {
    try {
      const { text, voiceName = "Kore" } = req.body;
      const script = cleanPromptText(text, 5000);
      if (!script) {
        return res.status(400).json({ error: "Texto obrigatório para gerar áudio." });
      }

      const apiKey = req.headers["x-api-key"] as string;
      const genAI = getAI(apiKey);
      const response = await genAI.models.generateContent({
        model: "gemini-3.1-flash-tts-preview",
        contents: [
          {
            parts: [
              {
                text: `Leia em português brasileiro, com voz clara, ritmo natural e tom técnico-profissional:\n\n${script}`,
              },
            ],
          },
        ],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
        },
      });

      const data = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!data) {
        return res.status(502).json({ error: "A Gemini TTS não retornou áudio." });
      }

      const wavBuffer = createWaveBuffer(Buffer.from(data, "base64"));
      res.setHeader("Content-Type", "audio/wav");
      res.setHeader("Content-Disposition", 'attachment; filename="roteiro-audio.wav"');
      res.send(wavBuffer);
    } catch (error: any) {
      console.error("TTS error:", error);
      res.status(500).json({ error: error?.message || "Erro ao gerar áudio." });
    }
  });

  // --- Vite Middleware (Development) ---
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*all", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
