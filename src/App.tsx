/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Upload,
  Send,
  Plus,
  Activity,
  BookOpen,
  LayoutDashboard,
  FileText,
  Bell,
  Paperclip,
  Search,
  Trash2,
  Loader2,
  User,
  Bot,
  Settings,
  X,
  ArrowUp,
  HelpCircle,
  Clock,
  Headphones,
  CheckSquare,
  ShieldCheck,
  GitCompare,
  BarChart2,
  Table,
  Network,
  Sparkles,
  Save,
  Copy,
  Zap,
  Edit2,
  Globe2,
  Mic,
  StickyNote,
  Eye,
  GripVertical,
  Volume2,
  Download,
  FileDown,
  GitBranch,
  Milestone,
  UploadCloud,
  Image as ImageIcon
} from "lucide-react";
import React, { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { MarkmapMindMap } from "./components/MarkmapMindMap";

interface UploadedDoc {
  id: string;
  name: string;
  uri: string;
  uploadDate: string;
  status: string;
  mimeType?: string;
  category?: string;
  previewPath?: string;
  sourceUrl?: string;
  suggestedQuestions?: string[];
  notebookId?: string | null;
}

interface Message {
  role: "user" | "model";
  text: string;
}

interface LinkedNote {
  id: string;
  notebookId: string;
  messageIndex: number | null;
  messageRole: "user" | "model";
  messageText: string;
  noteText: string;
  createdAt: string;
  updatedAt: string;
}

interface SkillItem {
  id: string;
  name: string;
  description?: string;
  content: string;
  scope: "global" | "notebook";
  notebookId?: string | null;
  enabled: boolean;
  createdAt: string;
}

interface StudioChatContext {
  toolName: string;
  taskPrompt: string;
  effortValue: StudioEffort;
  effortLabel: string;
  effortInstruction: string;
}

const normalizeSkillItem = (skill: any): SkillItem => ({
  id: String(skill?.id || crypto.randomUUID()),
  name: String(skill?.name || "Skill sem nome"),
  description: typeof skill?.description === "string" ? skill.description : "",
  content: String(skill?.content || ""),
  scope: skill?.scope === "global" ? "global" : "notebook",
  notebookId: skill?.notebookId || null,
  enabled: skill?.enabled !== false,
  createdAt: String(skill?.createdAt || new Date().toISOString()),
});

const STUDIO_TOOLS = [
  {
    id: "guia-estudos",
    icon: BookOpen,
    color: "bg-blue-100 text-blue-600",
    name: "Guia de Estudos",
    description: "Conceitos e glossário",
    prompt: "Crie um guia de estudos baseado nas fontes ativas.\nEstrutura obrigatória:\n1. Título específico do tema analisado\n2. Principais conceitos abordados\n3. Glossário de termos técnicos\n4. Perguntas de revisão com gabarito baseado nas fontes"
  },
  {
    id: "faq",
    icon: HelpCircle,
    color: "bg-indigo-100 text-indigo-600",
    name: "FAQ",
    description: "Perguntas frequentes e fontes",
    prompt: "Elabore um FAQ com perguntas e respostas baseadas nas fontes ativas.\nPara cada resposta, inclua a evidência disponível: documento, trecho, seção, tabela, linha ou campo, conforme existir na fonte."
  },
  {
    id: "mapa-mental",
    icon: Network,
    color: "bg-pink-100 text-pink-600",
    name: "Mapa Mental",
    description: "Estrutura visual de conceitos",
    prompt: "Crie um mapa mental hierárquico em Markdown usando listas aninhadas.\nComece com um título curto e depois liste o nó central, ramos principais e sub-ramos. Organize conceitos, relações técnicas, riscos e evidências sem escrever parágrafos longos."
  },
  {
    id: "linha-tempo",
    icon: Clock,
    color: "bg-amber-100 text-amber-600",
    name: "Linha do Tempo",
    description: "Cronologia e marcos",
    prompt: "Extraia datas, horários, prazos, marcos temporais e frequências mencionadas nas fontes ativas.\nOrganize cronologicamente em itens curtos, um evento por linha, para permitir visualização gráfica. Se a fonte trouxer apenas eventos pontuais, diga isso claramente e não invente periodicidades."
  },
  {
    id: "briefing-executivo",
    icon: FileText,
    color: "bg-emerald-100 text-emerald-600",
    name: "Briefing Executivo",
    description: "Resumo executivo e riscos",
    prompt: "Escreva um briefing executivo técnico sobre as fontes ativas.\nEstrutura obrigatória:\n- Resumo do cenário\n- Principais descobertas\n- Riscos identificados\n- Recomendações técnicas ou operacionais"
  },
  {
    id: "roteiro-audio",
    icon: Headphones,
    color: "bg-purple-100 text-purple-600",
    name: "Roteiro de Áudio",
    description: "Script de podcast estilo deep-dive",
    prompt: "Transforme o conteúdo técnico das fontes ativas em um roteiro de áudio estilo deep-dive, próprio para geração de voz.\nCrie um diálogo didático entre host e especialista, preservando precisão técnica e deixando claro quando a fonte não contém base normativa.\nLIMITE RÍGIDO: no máximo 4.500 caracteres no total. Use 8 a 12 falas curtas alternando Host e Especialista. Não crie seções extensas, listas longas ou anexos; priorize apenas os pontos técnicos de maior valor para que o áudio seja gerado em tempo razoável."
  },
  {
    id: "procedimento-pop",
    icon: CheckSquare,
    color: "bg-teal-100 text-teal-600",
    name: "Procedimento (POP)",
    description: "Operação passo a passo",
    prompt: "Crie um Procedimento Operacional Padrão (POP) preenchido a partir das fontes ativas.\nEstrutura obrigatória: Objetivo, Escopo, Referências usadas, Definições, Responsabilidades, Passo a passo, Registros/Evidências e Cuidados. Se a fonte não for suficiente para um POP completo, indique as lacunas e gere uma versão preliminar controlada."
  },
  {
    id: "analise-critica-rastreavel",
    icon: Search,
    color: "bg-sky-100 text-sky-600",
    name: "Análise Crítica Rastreável",
    description: "Requisitos, evidências e lacunas",
    prompt: "Aplique uma análise documental crítica e rastreável nas fontes ativas.\nObjetivo: extrair requisitos, evidências, riscos, prazos, responsáveis, critérios técnicos, lacunas, pendências e oportunidades de automação.\nEstrutura obrigatória: A) objetivo e escopo, B) fontes usadas, C) requisitos extraídos, D) evidências rastreáveis, E) riscos e impactos, F) lacunas ou ambiguidades, G) prazos e responsabilidades, H) critérios técnicos ou metrológicos, I) oportunidades de melhoria/automação, J) perguntas de validação para o usuário e K) checklist de qualidade.\nNão invente requisitos ausentes. Quando a fonte não trouxer dado suficiente, registre como lacuna e indique o que falta para confirmar."
  },
  {
    id: "analise-aderencia",
    icon: ShieldCheck,
    color: "bg-rose-100 text-rose-600",
    name: "Análise de Aderência",
    description: "Verificação normativa",
    prompt: "Realize uma análise de aderência com base somente nos requisitos presentes nas fontes ativas.\nEstrutura obrigatória: requisito encontrado, evidência, situação, lacuna/desvio, impacto e recomendação.\nSe a fonte não contiver requisitos normativos, explique a limitação e avalie apenas riscos observáveis."
  },
  {
    id: "comparar-versoes",
    icon: GitCompare,
    color: "bg-cyan-100 text-cyan-600",
    name: "Comparar Versões",
    description: "Mudanças e seus impactos",
    prompt: "Compare as fontes selecionadas e identifique diferenças estruturais, regulatórias, metodológicas ou operacionais.\nSe houver apenas uma fonte ativa, não force comparação: informe a limitação e sugira quais materiais seriam necessários."
  },
  {
    id: "analise-dados",
    icon: Table,
    color: "bg-orange-100 text-orange-600",
    name: "Análise de Dados Tabulares",
    description: "Padrões operacionais e extração",
    prompt: "Analise tabelas, relatórios, logs ou planilhas presentes nas fontes ativas.\nIdentifique contagens, tendências, valores fora do padrão, recorrências, campos críticos e insights operacionais relevantes."
  }
];

type StudioEffort = "auto" | "baixo" | "medio" | "alto";

const STUDIO_EFFORTS: Array<{ value: StudioEffort; label: string; description: string; instruction: string }> = [
  {
    value: "auto",
    label: "Auto",
    description: "Ajusta pelo tipo de fonte",
    instruction:
      "Defina a profundidade automaticamente. Use BAIXO para texto simples e perguntas objetivas; MEDIO para documentos técnicos comuns; ALTO para fontes críticas, tabelas densas, imagens técnicas, equações, logs, requisitos normativos, medições, cálculos, múltiplas fontes ou evidências ambíguas.",
  },
  {
    value: "baixo",
    label: "Curto",
    description: "Baixo esforço",
    instruction:
      "Use baixo esforço: resposta objetiva, até 5 bullets ou 3 seções curtas. Priorize conclusão direta e somente as evidências essenciais.",
  },
  {
    value: "medio",
    label: "Médio",
    description: "Análise equilibrada",
    instruction:
      "Use esforço médio: resposta estruturada, com evidências suficientes, principais riscos e limitações. Evite excesso de exemplos.",
  },
  {
    value: "alto",
    label: "Longo",
    description: "Deep-dive técnico",
    instruction:
      "Use alto esforço: análise detalhada e crítica, com leitura cuidadosa de tabelas, imagens, equações, requisitos, exceções e lacunas. Preserve rastreabilidade das evidências.",
  },
];

const MODEL_GROUPS = [
  {
    label: "Google (Suportado hoje)",
    options: [
      { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro (Mais Capaz)" },
      { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
      { value: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite" },
      { value: "gemini-1.5-pro", label: "Gemini 1.5 Pro (Legado)" },
    ],
  },
  {
    label: "Anthropic (Catálogo Atual)",
    options: [
      { value: "claude-opus-4-7", label: "Claude Opus 4.7" },
      { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
      { value: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
      { value: "claude-3-7-sonnet-latest", label: "Claude 3.7 Sonnet (Legado)" },
    ],
  },
  {
    label: "OpenAI (Catálogo Atual)",
    options: [
      { value: "gpt-5.5", label: "GPT-5.5" },
      { value: "gpt-5.4", label: "GPT-5.4" },
      { value: "gpt-5.4-mini", label: "GPT-5.4 mini" },
      { value: "gpt-5.4-nano", label: "GPT-5.4 nano" },
      { value: "gpt-4o", label: "GPT-4o (Legado)" },
    ],
  },
];

const isGeminiModel = (model: string) => model.startsWith("gemini-");

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const CHAT_REQUEST_HISTORY_LIMIT = 8;
const CHAT_REQUEST_MESSAGE_CHAR_LIMIT = 12000;

const buildChatRequestHistory = (items: Message[]) =>
  items.slice(-CHAT_REQUEST_HISTORY_LIMIT).map((item) => ({
    role: item.role,
    text:
      item.text.length > CHAT_REQUEST_MESSAGE_CHAR_LIMIT
        ? `${item.text.slice(0, CHAT_REQUEST_MESSAGE_CHAR_LIMIT)}\n\n[trecho anterior resumido pelo limite de contexto da conversa]`
        : item.text,
  }));

const normalizeDocument = (doc: any): UploadedDoc => {
  let suggestedQuestions: string[] = [];
  if (Array.isArray(doc?.suggestedQuestions)) {
    suggestedQuestions = doc.suggestedQuestions;
  } else if (typeof doc?.suggestedQuestions === "string" && doc.suggestedQuestions.trim()) {
    try {
      const parsed = JSON.parse(doc.suggestedQuestions);
      suggestedQuestions = Array.isArray(parsed) ? parsed : [];
    } catch {
      suggestedQuestions = [];
    }
  }

  return {
    ...doc,
    suggestedQuestions: suggestedQuestions
      .map((question) => String(question || "").trim())
      .filter(Boolean)
      .slice(0, 4),
  };
};

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const sanitizeFileSegment = (value: string, fallback = "item", maxLength = 70) => {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\.[a-z0-9]{2,6}$/i, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength);
  return normalized || fallback;
};

const formatDisplayTimestamp = (date = new Date()) => {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${String(date.getFullYear()).slice(-2)} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

const summarizePurpose = (value: string, fallback = "Caderno de Análise Documental", maxWords = 8) => {
  const cleaned = value
    .replace(/\.[a-z0-9]{2,6}$/i, "")
    .replace(/^estúdio:\s*/i, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[_-]+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = cleaned.split(/\s+/).filter(Boolean).slice(0, maxWords);
  return words.join(" ") || fallback;
};

const buildTimestampedName = (purpose: string, fallback = "Análise Documental") =>
  `${summarizePurpose(purpose, fallback)} - ${formatDisplayTimestamp()}`;

const isGeneratedNotebookTitle = (title?: string) =>
  !title ||
  title === "Novo Caderno" ||
  /^Caderno de Análise Documental - \d{2}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(title) ||
  /^Análise de .+ - \d{2}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(title);

const getDocumentTypeMeta = (doc: Pick<UploadedDoc, "name" | "mimeType">) => {
  const mimeType = (doc.mimeType || "").toLowerCase();
  const name = (doc.name || "").toLowerCase();
  if (mimeType.includes("image") || /\.(png|jpe?g|gif|webp|bmp|tiff?)$/i.test(name)) {
    return { Icon: ImageIcon, label: "Imagem", className: "text-sky-600" };
  }
  if (mimeType.includes("audio") || /\.(mp3|wav|m4a|ogg|flac)$/i.test(name)) {
    return { Icon: Headphones, label: "Áudio", className: "text-purple-600" };
  }
  if (mimeType.includes("sheet") || mimeType.includes("excel") || /\.(xlsx?|csv|ods)$/i.test(name)) {
    return { Icon: Table, label: "Planilha", className: "text-emerald-600" };
  }
  if (mimeType.includes("pdf") || /\.pdf$/i.test(name)) {
    return { Icon: FileText, label: "PDF", className: "text-oracle-red" };
  }
  if (mimeType.includes("word") || /\.(docx?|rtf)$/i.test(name)) {
    return { Icon: FileText, label: "Word", className: "text-blue-600" };
  }
  return { Icon: FileText, label: "Documento", className: "text-gray-400" };
};

const DocumentTypeIcon = ({ doc, active = false }: { doc: UploadedDoc; active?: boolean }) => {
  const meta = getDocumentTypeMeta(doc);
  const Icon = meta.Icon;
  return <Icon size={13} className={active ? meta.className : "text-gray-400"} aria-label={meta.label} />;
};

const cleanMindMapText = (line: string) =>
  line
    .replace(/^#{1,6}\s+/, "")
    .replace(/^[-*+]\s+/, "")
    .replace(/^\d+(?:\.\d+)*[\s.)-]+/, "")
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/\s+/g, " ")
    .trim();

const wrapSvgText = (value: string, maxChars = 28) => {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
};

const TTS_TEXT_LIMIT = 4500;

const prepareTextForTts = (text: string) => {
  const clean = text
    .replace(/\*\*/g, "")
    .replace(/#{1,6}\s*/g, "")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (clean.length <= TTS_TEXT_LIMIT) return clean;

  const dialogueLines = clean
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^(host|especialista|narrador|entrevistador)\s*:/i.test(line));
  const candidate = dialogueLines.length >= 4 ? dialogueLines.join("\n") : clean;
  const shortened = candidate.slice(0, TTS_TEXT_LIMIT).replace(/\s+\S*$/, "").trim();

  return `Versão em áudio resumida do roteiro gerado, preservando os pontos técnicos principais.\n\n${shortened}`;
};

const markdownToWordHtml = (text: string, title: string) => {
  const lines = text.split(/\r?\n/);
  const body = lines
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return "<p>&nbsp;</p>";
      if (trimmed.startsWith("### ")) return `<h3>${escapeHtml(trimmed.slice(4))}</h3>`;
      if (trimmed.startsWith("## ")) return `<h2>${escapeHtml(trimmed.slice(3))}</h2>`;
      if (trimmed.startsWith("# ")) return `<h1>${escapeHtml(trimmed.slice(2))}</h1>`;
      if (/^[-*]\s+/.test(trimmed)) return `<p class="bullet">• ${escapeHtml(trimmed.replace(/^[-*]\s+/, ""))}</p>`;
      return `<p>${escapeHtml(trimmed)}</p>`;
    })
    .join("\n");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    @page { margin: 3cm 2cm 2cm 3cm; }
    body { font-family: Arial, sans-serif; font-size: 12px; line-height: 1.5; text-align: justify; }
    h1, h2, h3 { font-size: 12px; font-weight: bold; line-height: 1.5; text-align: left; }
    p { margin: 0 0 8px; }
    .bullet { margin-left: 18px; }
    small, .note { font-size: 10px; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  ${body}
</body>
</html>`;
};

const buildStudioContext = (
  toolName: string,
  basePrompt: string,
  effort: StudioEffort,
  effortInstructionOverride?: string,
): StudioChatContext => {
  const effortConfig = STUDIO_EFFORTS.find((item) => item.value === effort) || STUDIO_EFFORTS[0];

  return {
    toolName,
    taskPrompt: basePrompt,
    effortValue: effortConfig.value,
    effortLabel: effortConfig.label,
    effortInstruction: effortInstructionOverride?.trim() || effortConfig.instruction,
  };
};

export default function App() {
  const [hasStarted, setHasStarted] = useState(() => localStorage.getItem("medorac_has_started") === "true");
  const [showStudio, setShowStudio] = useState(false);
  const [documents, setDocuments] = useState<UploadedDoc[]>([]);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [notes, setNotes] = useState<LinkedNote[]>([]);
  const [webUrl, setWebUrl] = useState("");
  const [previewDoc, setPreviewDoc] = useState<UploadedDoc | null>(null);
  const [audioUrls, setAudioUrls] = useState<Record<number, string>>({});
  const [audioLoadingIndex, setAudioLoadingIndex] = useState<number | null>(null);
  const [leftSidebarWidth, setLeftSidebarWidth] = useState(() => Number(localStorage.getItem("medorac_left_sidebar_width")) || 248);
  const [rightSidebarWidth, setRightSidebarWidth] = useState(() => Number(localStorage.getItem("medorac_right_sidebar_width")) || 320);
  const [resizingSidebar, setResizingSidebar] = useState<"left" | "right" | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [profileName, setProfileName] = useState(() => localStorage.getItem("medorac_profile_name") || "Operador");
  const [profileRole, setProfileRole] = useState(() => localStorage.getItem("medorac_profile_role") || "Especialista de Medição");
  const [profilePhoto, setProfilePhoto] = useState(() => localStorage.getItem("medorac_profile_photo") || "");
  const [showSkills, setShowSkills] = useState(false);
  const [skills, setSkills] = useState<SkillItem[]>(() => {
    try {
      const savedSkills = JSON.parse(localStorage.getItem("medorac_skills") || "[]");
      return Array.isArray(savedSkills) ? savedSkills.map(normalizeSkillItem) : [];
    } catch {
      return [];
    }
  });
  const [skillName, setSkillName] = useState("");
  const [skillDescription, setSkillDescription] = useState("");
  const [skillContent, setSkillContent] = useState("");
  const [skillScope, setSkillScope] = useState<"global" | "notebook">("notebook");
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [editingDocName, setEditingDocName] = useState("");

  // Notebooks
  const [notebooks, setNotebooks] = useState<any[]>([]);
  const [currentNotebookId, setCurrentNotebookId] = useState<string | null>(null);

  // Settings Mode
  const [showSettings, setShowSettings] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [modelName, setModelName] = useState("gemini-2.5-flash");
  const [chatTags, setChatTags] = useState("Guia de Estudos, FAQ, Mapa Mental, Briefing Executivo");
  const [studioEffort, setStudioEffort] = useState<StudioEffort>(() => {
    const savedEffort = localStorage.getItem("medorac_studio_effort") as StudioEffort | null;
    return STUDIO_EFFORTS.some((item) => item.value === savedEffort) ? savedEffort! : "auto";
  });
  const [customEffortInstructions, setCustomEffortInstructions] = useState<Record<StudioEffort, string>>(() => {
    try {
      const savedInstructions = JSON.parse(localStorage.getItem("medorac_effort_instructions") || "{}");
      return STUDIO_EFFORTS.reduce((acc, effort) => {
        acc[effort.value] = typeof savedInstructions?.[effort.value] === "string"
          ? savedInstructions[effort.value]
          : effort.instruction;
        return acc;
      }, {} as Record<StudioEffort, string>);
    } catch {
      return STUDIO_EFFORTS.reduce((acc, effort) => {
        acc[effort.value] = effort.instruction;
        return acc;
      }, {} as Record<StudioEffort, string>);
    }
  });
  const [customToolsPrompts, setCustomToolsPrompts] = useState<Record<string, string>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const profilePhotoInputRef = useRef<HTMLInputElement>(null);
  const skillImportInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetchNotebooks();
    const savedPrompt = localStorage.getItem("medorac_custom_prompt");
    if (savedPrompt) {
      setCustomPrompt(savedPrompt);
    }
    const savedTags = localStorage.getItem("medorac_chat_tags");
    if (savedTags) {
      setChatTags(savedTags);
    }
    const savedApiKey = localStorage.getItem("medorac_api_key");
    if (savedApiKey) {
      setApiKey(savedApiKey);
    }
    const savedTools = localStorage.getItem("medorac_custom_tools_prompts");
    if (savedTools) {
      try {
        setCustomToolsPrompts(JSON.parse(savedTools));
      } catch(e) {}
    }
    const savedModelName = localStorage.getItem("medorac_model_name");
    if (savedModelName) {
      setModelName(savedModelName);
    }
    const savedStudioEffort = localStorage.getItem("medorac_studio_effort") as StudioEffort | null;
    if (STUDIO_EFFORTS.some((item) => item.value === savedStudioEffort)) {
      setStudioEffort(savedStudioEffort!);
    }
    const savedEffortInstructions = localStorage.getItem("medorac_effort_instructions");
    if (savedEffortInstructions) {
      try {
        const parsed = JSON.parse(savedEffortInstructions);
        setCustomEffortInstructions((current) => ({
          ...current,
          ...Object.fromEntries(
            STUDIO_EFFORTS.map((effort) => [
              effort.value,
              typeof parsed?.[effort.value] === "string" ? parsed[effort.value] : current[effort.value],
            ]),
          ),
        }));
      } catch(e) {}
    }
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const textarea = chatInputRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  }, [query]);

  useEffect(() => {
    if (!resizingSidebar) return;

    const handleMouseMove = (event: MouseEvent) => {
      if (resizingSidebar === "left") {
        const nextWidth = clamp(event.clientX, 192, 380);
        setLeftSidebarWidth(nextWidth);
        localStorage.setItem("medorac_left_sidebar_width", String(nextWidth));
      } else {
        const nextWidth = clamp(window.innerWidth - event.clientX, 260, 520);
        setRightSidebarWidth(nextWidth);
        localStorage.setItem("medorac_right_sidebar_width", String(nextWidth));
      }
    };

    const stopResizing = () => setResizingSidebar(null);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", stopResizing);

    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", stopResizing);
    };
  }, [resizingSidebar]);

  const saveSettings = () => {
    localStorage.setItem("medorac_custom_prompt", customPrompt);
    localStorage.setItem("medorac_chat_tags", chatTags);
    localStorage.setItem("medorac_api_key", apiKey);
    localStorage.setItem("medorac_model_name", modelName);
    localStorage.setItem("medorac_studio_effort", studioEffort);
    localStorage.setItem("medorac_effort_instructions", JSON.stringify(customEffortInstructions));
    setShowSettings(false);
  };

  const handleStudioEffortChange = (value: StudioEffort) => {
    setStudioEffort(value);
    localStorage.setItem("medorac_studio_effort", value);
  };

  const updateEffortInstruction = (value: StudioEffort, instruction: string) => {
    setCustomEffortInstructions((current) => {
      const next = { ...current, [value]: instruction };
      localStorage.setItem("medorac_effort_instructions", JSON.stringify(next));
      return next;
    });
  };

  const resetEffortInstructions = () => {
    const defaults = STUDIO_EFFORTS.reduce((acc, effort) => {
      acc[effort.value] = effort.instruction;
      return acc;
    }, {} as Record<StudioEffort, string>);
    setCustomEffortInstructions(defaults);
    localStorage.setItem("medorac_effort_instructions", JSON.stringify(defaults));
  };

  const activeSkills = skills.filter((skill) => {
    if (skill.enabled === false) return false;
    if (skill.scope === "global") return true;
    return skill.notebookId === currentNotebookId;
  });

  const activeSkillsPrompt = activeSkills.length
    ? `ACTIVE USER SKILLS\n${activeSkills.map((skill, index) => {
      const description = skill.description?.trim() ? `\nQuando usar: ${skill.description.trim()}` : "";
      return `${index + 1}. ${skill.name}${description}\n${skill.content}`;
    }).join("\n\n")}`
    : "";

  const activeSuggestedQuestions = Array.from(
    new Set(
      documents
        .filter((doc) => selectedDocIds.includes(doc.id))
        .flatMap((doc) => doc.suggestedQuestions || [])
        .map((question) => question.trim())
        .filter(Boolean),
    ),
  ).slice(0, 6);

  const getActiveSourceNames = () =>
    documents
      .filter((doc) => selectedDocIds.includes(doc.id))
      .map((doc) => doc.name)
      .filter(Boolean);

  const getMessageTriggerLabel = (messageIndex?: number | null) => {
    if (messageIndex === null || messageIndex === undefined) return "Chat";
    const previous = messages[messageIndex - 1]?.text || messages[messageIndex]?.text || "Chat";
    const studioMatch = previous.match(/Estúdio:\s*([^(]+)/i);
    return (studioMatch?.[1] || previous).trim().slice(0, 90);
  };

  const getSourceLabel = () => {
    const sourceNames = getActiveSourceNames();
    if (sourceNames.length === 1) return sourceNames[0];
    if (sourceNames.length > 1) return `${sourceNames.length} fontes`;
    return "sem fonte ativa";
  };

  const buildMessageFileTitle = (messageIndex?: number | null, base = "Resposta MedOrac") => {
    const sourceLabel = getSourceLabel();
    const triggerLabel = getMessageTriggerLabel(messageIndex);
    return buildTimestampedName(`${base} ${triggerLabel} ${sourceLabel}`, base);
  };

  const buildMessageFileName = (messageIndex: number | null | undefined, extension: string) => {
    const sourceLabel = getSourceLabel();
    const triggerLabel = getMessageTriggerLabel(messageIndex);
    return `${buildTimestampedName(`${triggerLabel} ${sourceLabel}`, "Resposta MedOrac")}.${extension}`;
  };

  const saveProfile = () => {
    localStorage.setItem("medorac_profile_name", profileName);
    localStorage.setItem("medorac_profile_role", profileRole);
    localStorage.setItem("medorac_profile_photo", profilePhoto);
    setShowProfile(false);
  };

  const handleProfilePhotoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setProfilePhoto(String(reader.result || ""));
    };
    reader.readAsDataURL(file);
  };

  const profileInitials = profileName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "OP";

  const persistSkills = (nextSkills: SkillItem[]) => {
    const normalizedSkills = nextSkills.map(normalizeSkillItem);
    setSkills(normalizedSkills);
    localStorage.setItem("medorac_skills", JSON.stringify(normalizedSkills));
  };

  const parseSkillMarkdown = (source: string) => {
    const text = source.trim();
    const frontmatterMatch = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n)?([\s\S]*)$/);
    const metadata: Record<string, string> = {};
    let body = text;

    if (frontmatterMatch) {
      body = frontmatterMatch[2].trim();
      frontmatterMatch[1].split(/\r?\n/).forEach((line) => {
        const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
        if (!match) return;
        metadata[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
      });
    }

    const heading = body.match(/^#\s+(.+)$/m)?.[1]?.trim().replace(/^skill\s*:\s*/i, "");
    const metadataName = metadata.name?.trim();
    const displayName = heading || metadataName?.replace(/[-_]+/g, " ") || "Skill importada";

    return {
      name: displayName,
      description: metadata.description || "",
      body,
    };
  };

  const skillSlug = (name: string) =>
    (name || "skill-med-orac")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 72) || "skill-med-orac";

  const quoteYaml = (value: string) => JSON.stringify(value || "");

  const skillToMarkdown = (skill: Pick<SkillItem, "name" | "description" | "content">) => {
    const body = skill.content.trim();
    const bodyWithHeading = /^#\s+/m.test(body.slice(0, 500)) ? body : `# ${skill.name.trim() || "Skill MedOrac"}\n\n${body}`;
    const description = skill.description?.trim() || `Use esta skill no MedOrac quando a análise exigir ${skill.name.trim() || "um fluxo especializado"}.`;

    return `---\nname: ${skillSlug(skill.name)}\ndescription: ${quoteYaml(description)}\n---\n\n${bodyWithHeading}\n`;
  };

  const exportSkill = (skill: SkillItem) => {
    const markdown = skillToMarkdown(skill);
    downloadBlob(new Blob([markdown], { type: "text/markdown;charset=utf-8" }), `${skillSlug(skill.name)}-SKILL.md`);
  };

  const exportSkillTemplate = () => {
    const template = `---\nname: nova-skill-med-orac\ndescription: "Use esta skill quando o MedOrac precisar aplicar um fluxo especializado de analise documental."\n---\n\n# Nova Skill MedOrac\n\n## Objetivo\nDescreva o resultado que a skill deve produzir e em quais documentos, fontes ou cenarios ela deve ser aplicada.\n\n## Quando usar\n- Quando o usuario pedir este tipo de analise explicitamente.\n- Quando a fonte ativa contiver sinais tecnicos compatíveis com este fluxo.\n\n## Entradas esperadas\n- Fonte atual do caderno.\n- Pergunta do usuario, quando houver.\n- Prompt do Estudio ou prompt customizado, quando habilitado.\n\n## Procedimento\n1. Leia a fonte ativa antes de concluir.\n2. Extraia somente evidencias presentes na fonte.\n3. Organize os achados por requisito, evidencia, risco, lacuna e recomendacao.\n4. Declare limitacoes quando a fonte nao trouxer base suficiente.\n\n## Formato de saida\n- Resumo executivo.\n- Achados rastreaveis.\n- Tabela de requisitos ou evidencias, quando aplicavel.\n- Lacunas e proximas acoes.\n\n## Regras de qualidade\n- Nao inventar norma, prazo, valor, requisito ou evidencia.\n- Evitar repetir introducoes ou secoes.\n- Citar documento, secao, tabela, pagina, linha ou campo sempre que a fonte permitir.\n`;
    downloadBlob(new Blob([template], { type: "text/markdown;charset=utf-8" }), "modelo-SKILL.md");
  };

  const addSkill = () => {
    if (!skillName.trim() || !skillContent.trim()) return;
    if (skillScope === "notebook" && !currentNotebookId) {
      alert("Aguarde a criação ou seleção de um caderno antes de vincular uma skill ao caderno atual.");
      return;
    }
    const newSkill: SkillItem = {
      id: crypto.randomUUID(),
      name: skillName.trim(),
      description: skillDescription.trim(),
      content: skillContent.trim(),
      scope: skillScope,
      notebookId: skillScope === "notebook" ? currentNotebookId : null,
      enabled: true,
      createdAt: new Date().toISOString(),
    };
    persistSkills([newSkill, ...skills]);
    setSkillName("");
    setSkillDescription("");
    setSkillContent("");
  };

  const importSkillFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (skillScope === "notebook" && !currentNotebookId) {
      alert("Selecione ou crie um caderno antes de importar uma skill para o caderno atual.");
      return;
    }

    const text = await file.text();
    const parsed = parseSkillMarkdown(text);
    if (!parsed.body.trim()) {
      alert("O arquivo não contém instruções de skill.");
      return;
    }

    const importedSkill: SkillItem = {
      id: crypto.randomUUID(),
      name: parsed.name,
      description: parsed.description,
      content: parsed.body,
      scope: skillScope,
      notebookId: skillScope === "notebook" ? currentNotebookId : null,
      enabled: true,
      createdAt: new Date().toISOString(),
    };

    const withoutSameScopeDuplicate = skills.filter((skill) => !(
      skill.name.toLowerCase() === importedSkill.name.toLowerCase()
      && skill.scope === importedSkill.scope
      && (skill.notebookId || null) === (importedSkill.notebookId || null)
    ));
    persistSkills([importedSkill, ...withoutSameScopeDuplicate]);
  };

  const toggleSkill = (id: string) => {
    persistSkills(skills.map((skill) => skill.id === id ? { ...skill, enabled: !skill.enabled } : skill));
  };

  const deleteSkill = (id: string) => {
    persistSkills(skills.filter((skill) => skill.id !== id));
  };

  const fetchDocuments = async (notebookId = currentNotebookId) => {
    try {
      if (!notebookId) {
        setDocuments([]);
        return;
      }
      const res = await fetch(`/api/documents?notebookId=${encodeURIComponent(notebookId)}`);
      const data = await res.json();
      setDocuments(Array.isArray(data) ? data.map(normalizeDocument) : []);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchNotebooks = async () => {
    try {
      const res = await fetch("/api/notebooks");
      const data = await res.json();
      setNotebooks(data);
      if (data.length > 0 && !currentNotebookId) {
        selectNotebook(data[0]);
      } else if (data.length === 0) {
        createNewNotebook();
      }
    } catch (e) {
      console.error("Failed to fetch notebooks", e);
    }
  };

  const fetchNotes = async (notebookId: string) => {
    try {
      const res = await fetch(`/api/notes?notebookId=${encodeURIComponent(notebookId)}`);
      const data = await res.json();
      setNotes(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Failed to fetch notes", e);
      setNotes([]);
    }
  };

  const createNewNotebook = async () => {
    const id = crypto.randomUUID();
    const newNb = {
      id,
      title: buildTimestampedName("Caderno de Análise Documental", "Caderno de Análise Documental"),
      messages: "[]",
      selectedDocIds: "[]"
    };
    try {
      await fetch("/api/notebooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newNb)
      });
      setNotebooks([newNb, ...notebooks]);
      selectNotebook(newNb);
    } catch (e) {
      console.error(e);
    }
  };

  const renameGeneratedNotebookFromSource = async (doc: UploadedDoc, nextSelectedDocIds: string[]) => {
    if (!currentNotebookId) return;
    const currentNotebook = notebooks.find((notebook) => notebook.id === currentNotebookId);
    if (!isGeneratedNotebookTitle(currentNotebook?.title)) return;

    const title = buildTimestampedName(`Análise de ${doc.name}`, "Análise Documental");
    const updatedNotebook = {
      ...(currentNotebook || { id: currentNotebookId, messages: JSON.stringify(messages) }),
      title,
      selectedDocIds: JSON.stringify(nextSelectedDocIds),
    };

    setNotebooks((prev) =>
      prev.map((notebook) => (notebook.id === currentNotebookId ? { ...notebook, title } : notebook)),
    );

    try {
      await fetch(`/api/notebooks/${currentNotebookId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          messages: currentNotebook?.messages || JSON.stringify(messages),
          selectedDocIds: updatedNotebook.selectedDocIds,
        }),
      });
    } catch (error) {
      console.error("Failed to rename generated notebook", error);
    }
  };

  const deleteNotebook = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDelete({ type: 'notebook', id });
  };

  const executeDeleteNotebook = async (id: string) => {
    try {
      await fetch(`/api/notebooks/${id}`, { method: 'DELETE' });
      setNotebooks(notebooks.filter(nb => nb.id !== id));
      if (currentNotebookId === id) {
        setDocuments([]);
        setSelectedDocIds([]);
        setMessages([]);
        setNotes([]);
        const remaining = notebooks.filter(nb => nb.id !== id);
        if (remaining.length > 0) {
          selectNotebook(remaining[0]);
        } else {
          createNewNotebook();
        }
      }
    } catch (err) {
      console.error("Failed to delete notebook", err);
    }
  };

  const selectNotebook = (nb: any) => {
    setCurrentNotebookId(nb.id);
    fetchDocuments(nb.id);
    fetchNotes(nb.id);
    try {
      setMessages(JSON.parse(nb.messages));
    } catch {
      setMessages([]);
    }
    try {
      setSelectedDocIds(JSON.parse(nb.selectedDocIds));
    } catch {
      setSelectedDocIds([]);
    }
  };

  const saveNotebookState = async (newMessages: Message[], newSelectedDocIds: string[]) => {
    if (!currentNotebookId) return;
    try {
      await fetch(`/api/notebooks/${currentNotebookId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: notebooks.find(n => n.id === currentNotebookId)?.title || "Novo Caderno",
          messages: JSON.stringify(newMessages),
          selectedDocIds: JSON.stringify(newSelectedDocIds)
        })
      });
    } catch (e) {
      console.error(e);
    }
  };

  const saveNotebookTitle = async (id: string, e?: React.FormEvent | React.KeyboardEvent | React.FocusEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    
    if (!editingNbTitle.trim()) {
      setEditingNbId(null);
      return;
    }

    const updatedNotebooks = notebooks.map(nb => 
      nb.id === id ? { ...nb, title: editingNbTitle.trim() } : nb
    );
    setNotebooks(updatedNotebooks);
    setEditingNbId(null);

    const nb = updatedNotebooks.find(n => n.id === id);
    if (!nb) return;

    try {
      await fetch(`/api/notebooks/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: nb.title,
          messages: nb.messages,
          selectedDocIds: nb.selectedDocIds
        })
      });
    } catch (e) {
      console.error("Failed to rename notebook", e);
    }
  };

  // Sync state changes to backend when they change
  useEffect(() => {
    if (currentNotebookId) {
      saveNotebookState(messages, selectedDocIds);
    }
  }, [messages, selectedDocIds]);

  const loadKnowledgeBase = async () => {
    if (!currentNotebookId) {
      alert("Selecione ou crie um caderno antes de carregar fontes.");
      return;
    }
    setIsUploading(true);
    try {
      const res = await fetch("/api/documents/knowledge_base", { 
        method: "POST",
        headers: { "x-api-key": apiKey, "x-notebook-id": currentNotebookId }
      });
      const newDocs = await res.json();
      
      if (!res.ok) throw new Error(newDocs.error || "Erro na API");

      if (newDocs && newDocs.length > 0) {
        const normalizedDocs = newDocs.map(normalizeDocument);
        setDocuments((prev) => {
          const combined = [...prev];
          normalizedDocs.forEach((d: UploadedDoc) => {
            if (!combined.some((c) => c.id === d.id)) combined.push(d);
          });
          return combined;
        });
        setSelectedDocIds((prev) => {
          const combined = [...prev];
          normalizedDocs.forEach((d: UploadedDoc) => {
            if (!combined.includes(d.id)) combined.push(d.id);
          });
          return combined;
        });
        alert(`${newDocs.length} documentos da base de conhecimento carregados.`);
      } else {
        alert("Nenhum novo documento encontrado na base de conhecimento.");
      }
    } catch (error) {
      console.error("Failed to load knowledge base", error);
      alert("Erro ao carregar base de conhecimento.");
    } finally {
      setIsUploading(false);
    }
  };

  const loadSamples = async () => {
    if (!currentNotebookId) {
      alert("Selecione ou crie um caderno antes de carregar fontes.");
      return;
    }
    setIsUploading(true);
    try {
      const res = await fetch("/api/documents/samples", { 
        method: "POST",
        headers: { "x-api-key": apiKey, "x-notebook-id": currentNotebookId }
      });
      const newDocs = await res.json();
      
      if (!res.ok) throw new Error(newDocs.error || "Erro na API");

      if (newDocs && newDocs.length > 0) {
        const normalizedDocs = newDocs.map(normalizeDocument);
        setDocuments((prev) => {
          const combined = [...prev];
          normalizedDocs.forEach((d: UploadedDoc) => {
            if (!combined.some((c) => c.name === d.name)) combined.push(d);
          });
          return combined;
        });
        setSelectedDocIds((prev) => {
          const combined = [...prev];
          normalizedDocs.forEach((d: UploadedDoc) => {
            if (!combined.includes(d.id)) combined.push(d.id);
          });
          return combined;
        });
      } else {
        alert("Nenhuma nova amostra encontrada na pasta samples.");
      }
    } catch (error) {
      console.error("Failed to load samples", error);
      alert("Erro ao carregar amostras.");
    } finally {
      setIsUploading(false);
    }
  };

  const [savingMessageIndex, setSavingMessageIndex] = useState<number | null>(null);
  const [noteSavingMessageIndex, setNoteSavingMessageIndex] = useState<number | null>(null);

  const addNoteForMessage = async (messageIndex: number, msg: Message) => {
    if (!currentNotebookId) {
      alert("Selecione um caderno antes de criar uma nota.");
      return;
    }
    const noteText = msg.text.trim();
    if (!noteText) {
      alert("Não há conteúdo nesta resposta para salvar como nota.");
      return;
    }

    try {
      setNoteSavingMessageIndex(messageIndex);
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notebookId: currentNotebookId,
          messageIndex,
          messageRole: msg.role,
          messageText: msg.text,
          noteText,
        }),
      });
      const newNote = await res.json();
      if (!res.ok) throw new Error(newNote.error || "Erro ao salvar nota");
      setNotes((prev) => [newNote, ...prev]);
    } catch (error) {
      console.error("Failed to save note", error);
      alert("Erro ao salvar nota vinculada.");
    } finally {
      setNoteSavingMessageIndex(null);
    }
  };

  const deleteNote = async (id: string) => {
    try {
      const res = await fetch(`/api/notes/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete note");
      setNotes((prev) => prev.filter((item) => item.id !== id));
    } catch (error) {
      console.error("Failed to delete note", error);
      alert("Erro ao apagar nota.");
    }
  };

  const messageWasGeneratedByStudio = (index: number, cardName: string) =>
    messages[index - 1]?.role === "user" &&
    messages[index - 1]?.text.toLowerCase().includes(`estúdio: ${cardName.toLowerCase()}`);

  const exportMessageAsWord = (text: string, title = "Analise MedOrac") => {
    const html = markdownToWordHtml(text, title);
    downloadBlob(
      new Blob([html], { type: "application/msword;charset=utf-8" }),
      `${title.replace(/[\\/:*?"<>|]+/g, "-").slice(0, 80)}.doc`,
    );
  };

  const generateAudioForMessage = async (index: number, text: string) => {
    try {
      setAudioLoadingIndex(index);
      const ttsText = prepareTextForTts(text);
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey },
        body: JSON.stringify({ text: ttsText }),
      });
      if (!res.ok) {
        let message = "Erro ao gerar áudio.";
        try {
          const payload = await res.json();
          message = payload.error || message;
        } catch {}
        throw new Error(message);
      }
      const blob = await res.blob();
      setAudioUrls((prev) => {
        if (prev[index]) URL.revokeObjectURL(prev[index]);
        return { ...prev, [index]: URL.createObjectURL(blob) };
      });
    } catch (error: any) {
      console.error("Audio generation failed", error);
      alert(error?.message || "Erro ao gerar áudio.");
    } finally {
      setAudioLoadingIndex(null);
    }
  };

  const extractArtifactItems = (text: string, maxItems = 10) =>
    text
      .split(/\r?\n/)
      .map((line) => cleanMindMapText(line))
      .filter((line) => line.length > 8 && !/^```/.test(line))
      .slice(0, maxItems);

  const parseMindMapTree = (text: string) => {
    const candidates = text
      .split(/\r?\n/)
      .map((raw) => {
        const clean = cleanMindMapText(raw);
        const headingLevel = raw.match(/^#{1,6}\s/)?.[0]?.trim().length;
        const indentLevel = Math.min(2, Math.floor((raw.match(/^\s*/)?.[0].length || 0) / 2));
        const bulletLevel = /^\s*[-*+]/.test(raw) ? indentLevel + 1 : indentLevel;
        return {
          label: clean,
          level: headingLevel ? Math.max(0, headingLevel - 1) : bulletLevel,
        };
      })
      .filter((item) => item.label.length > 8 && !/^```/.test(item.label))
      .slice(0, 28);

    const fallback = extractArtifactItems(text, 10);
    const root = candidates[0]?.label || fallback[0] || "Mapa mental";
    const branches: Array<{ label: string; children: string[] }> = [];
    let currentBranch: { label: string; children: string[] } | null = null;

    candidates.slice(1).forEach((item) => {
      if ((item.level <= 1 || !currentBranch) && branches.length < 8) {
        currentBranch = { label: item.label, children: [] };
        branches.push(currentBranch);
        return;
      }
      if (currentBranch && currentBranch.children.length < 3) {
        currentBranch.children.push(item.label);
      }
    });

    if (branches.length < 3) {
      return {
        root,
        branches: fallback.slice(1, 9).map((label) => ({ label, children: [] })),
      };
    }

    return { root, branches };
  };

  const buildMindMapSvgMarkup = (root: string, branches: Array<{ label: string; children: string[] }>) => {
    const width = 900;
    const rootX = 450;
    const rootY = 66;
    const nodeWidth = 230;
    const nodeHeight = 62;
    const leftBranches = branches.filter((_, index) => index % 2 === 0);
    const rightBranches = branches.filter((_, index) => index % 2 !== 0);
    const rows = Math.max(leftBranches.length, rightBranches.length, 1);
    const height = Math.max(280, 160 + rows * 96);
    const placed = branches.map((branch, index) => {
      const side = index % 2 === 0 ? "left" : "right";
      const sideIndex = side === "left" ? Math.floor(index / 2) : Math.floor(index / 2);
      return {
        ...branch,
        side,
        x: side === "left" ? 168 : 732,
        y: 148 + sideIndex * 96,
      };
    });

    const escapeSvg = (value: string) =>
      value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const textSpans = (value: string, x: number, y: number, maxChars = 28, color = "#1e3a5f", weight = 700) =>
      wrapSvgText(value, maxChars)
        .map((line, idx) => `<text x="${x}" y="${y + idx * 14}" text-anchor="middle" fill="${color}" font-size="11" font-weight="${weight}">${escapeSvg(line)}</text>`)
        .join("");
    const childSpans = (items: string[], x: number, y: number) =>
      items
        .slice(0, 2)
        .flatMap((item, childIndex) =>
          wrapSvgText(item, 34)
            .slice(0, 1)
            .map((line) => `<text x="${x}" y="${y + childIndex * 15}" text-anchor="middle" fill="#64748b" font-size="9">${escapeSvg(line)}</text>`),
        )
        .join("");

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" rx="18" fill="#fff"/>
  <rect x="${rootX - 145}" y="${rootY - 32}" width="290" height="64" rx="32" fill="#dc2626"/>
  ${textSpans(root, rootX, rootY - 5, 34, "#fff", 700)}
  ${placed.map((branch) => {
    const controlX = branch.side === "left" ? rootX - 150 : rootX + 150;
    const startX = branch.side === "left" ? rootX - 135 : rootX + 135;
    const endX = branch.side === "left" ? branch.x + nodeWidth / 2 : branch.x - nodeWidth / 2;
    return `<path d="M ${startX} ${rootY + 14} C ${controlX} ${branch.y - 20}, ${controlX} ${branch.y + 20}, ${endX} ${branch.y}" stroke="#dc2626" stroke-opacity="0.34" stroke-width="2.5" fill="none"/>`;
  }).join("\n  ")}
  ${placed.map((branch) => `<g>
    <rect x="${branch.x - nodeWidth / 2}" y="${branch.y - nodeHeight / 2}" width="${nodeWidth}" height="${nodeHeight}" rx="18" fill="#fff7f7" stroke="#fecaca"/>
    ${textSpans(branch.label, branch.x, branch.y - 8, 31)}
    ${childSpans(branch.children, branch.x, branch.y + 23)}
  </g>`).join("\n  ")}
</svg>`;
  };

  const renderMindMap = (text: string) => {
    const items = extractArtifactItems(text, 12);
    if (items.length < 3) return null;

    const relevantLines = text
      .split(/\r?\n/)
      .filter((line) => !/^```/.test(line.trim()))
      .join("\n");
    const hasMarkdownTree = /(^|\n)\s*(#{1,6}\s+|[-*+]\s+|\d+[\.)]\s+)/.test(relevantLines);
    const markdown = hasMarkdownTree
      ? relevantLines
      : [`# ${items[0]}`, ...items.slice(1).map((item) => `- ${item}`)].join("\n");
    const root = items[0] || "Mapa mental";

    return <MarkmapMindMap markdown={markdown} fileName={`${sanitizeFileSegment(root, "mapa-mental")}.svg`} />;
  };

  const renderTimeline = (text: string) => {
    const items = text
      .split(/\r?\n/)
      .map((line) => line.trim().replace(/^[-*]\s+/, ""))
      .filter((line) => /(\d{1,2}[:h]\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2}|jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)/i.test(line))
      .slice(0, 8);
    if (items.length < 2) return null;
    return (
      <div className="mt-4 rounded-2xl border border-oracle-red/15 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-oracle-red">
          <Milestone size={14} /> Linha do tempo visual
        </div>
        <div className="space-y-3">
          {items.map((item, idx) => (
            <div key={`${item}-${idx}`} className="grid grid-cols-[20px_1fr] gap-3">
              <div className="flex flex-col items-center">
                <div className="h-4 w-4 rounded-full bg-oracle-red" />
                {idx < items.length - 1 && <div className="mt-1 h-full min-h-8 w-px bg-oracle-red/25" />}
              </div>
              <p className="pb-2 text-[11px] leading-relaxed text-[#334155]">{item}</p>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const uploadSourceFile = async (file: File) => {
    if (!currentNotebookId) {
      throw new Error("Selecione ou crie um caderno antes de enviar fontes.");
    }
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/documents", {
      method: "POST",
      headers: { "x-api-key": apiKey, "x-notebook-id": currentNotebookId },
      body: formData,
    });
    const newDoc = await res.json();

    if (!res.ok) throw new Error(newDoc.error || "Erro na API");

    const normalizedDoc = normalizeDocument(newDoc);
    const nextSelectedDocIds = Array.from(new Set([...selectedDocIds, normalizedDoc.id]));
    setDocuments((prev) => [...prev, normalizedDoc]);
    setSelectedDocIds(nextSelectedDocIds);
    await renameGeneratedNotebookFromSource(normalizedDoc, nextSelectedDocIds);
    return normalizedDoc;
  };

  const saveMessageAsDocument = async (text: string, format: string, messageIndex?: number | null) => {
    try {
      setIsUploading(true);
      setSavingMessageIndex(null);
      let mimeType = "text/plain";
      let extension = "txt";
      let content = text;
      const sourceNames = getActiveSourceNames();
      const metadata = {
        sourceContext: sourceNames.length ? sourceNames : ["sem fonte ativa"],
        chatItem: getMessageTriggerLabel(messageIndex),
        savedAt: formatDisplayTimestamp(),
      };
      
      if (format === "markdown") {
        mimeType = "text/markdown";
        extension = "md";
        content = `---\nsourceContext: ${JSON.stringify(metadata.sourceContext)}\nchatItem: ${JSON.stringify(metadata.chatItem)}\nsavedAt: ${JSON.stringify(metadata.savedAt)}\n---\n\n${text}`;
      } else if (format === "json") {
        mimeType = "application/json";
        extension = "json";
        // try to wrap text in a simple JSON structure if it's not already valid JSON
        try {
          JSON.parse(text);
        } catch {
          content = JSON.stringify({ ...metadata, content: text }, null, 2);
        }
      } else {
        content = `Fonte(s): ${metadata.sourceContext.join(", ")}\nItem do chat: ${metadata.chatItem}\nSalvo em: ${metadata.savedAt}\n\n${text}`;
      }

      const blob = new Blob([content], { type: mimeType });
      const file = new File([blob], buildMessageFileName(messageIndex, extension), { type: mimeType });
      
      await uploadSourceFile(file);
      alert(`Sucesso! Resposta salva como um Documento (.${extension}) e adicionada ao contexto.`);
    } catch (error) {
      console.error("Upload failed", error);
      alert("Erro ao salvar como documento.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;

    setIsUploading(true);

    try {
      await uploadSourceFile(e.target.files[0]);
    } catch (error) {
      console.error("Upload failed", error);
      alert("Erro ao carregar fonte.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (audioInputRef.current) audioInputRef.current.value = "";
    }
  };

  const handleWebUrlUpload = async () => {
    if (!webUrl.trim()) return;
    if (!currentNotebookId) {
      alert("Selecione ou crie um caderno antes de carregar fontes.");
      return;
    }
    setIsUploading(true);
    try {
      const res = await fetch("/api/documents/url", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey, "x-notebook-id": currentNotebookId },
        body: JSON.stringify({ url: webUrl.trim(), notebookId: currentNotebookId }),
      });
      const newDoc = await res.json();

      if (!res.ok) throw new Error(newDoc.error || "Erro na API");

      const normalizedDoc = normalizeDocument(newDoc);
      const nextSelectedDocIds = Array.from(new Set([...selectedDocIds, normalizedDoc.id]));
      setDocuments((prev) => [...prev, normalizedDoc]);
      setSelectedDocIds(nextSelectedDocIds);
      await renameGeneratedNotebookFromSource(normalizedDoc, nextSelectedDocIds);
      setWebUrl("");
      setShowUploadModal(false);
    } catch (error: any) {
      console.error("URL upload failed", error);
      alert(error?.message || "Erro ao carregar fonte web.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDelete({ type: 'doc', id });
  };

  const executeDeleteDoc = async (id: string) => {
    if (!currentNotebookId) return;
    try {
      const res = await fetch("/api/documents/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey, "x-notebook-id": currentNotebookId },
        body: JSON.stringify({ id, notebookId: currentNotebookId }),
      });
      if (!res.ok) throw new Error("Failed to delete");
      setDocuments((prev) => prev.filter((d) => d.id !== id));
      setSelectedDocIds((prev) => prev.filter((docId) => docId !== id));
    } catch (e) {
      console.error(e);
      alert("Erro ao remover documento.");
    }
  };

  const startRenamingDocument = (doc: UploadedDoc, event: React.MouseEvent) => {
    event.stopPropagation();
    setEditingDocId(doc.id);
    setEditingDocName(doc.name);
  };

  const cancelRenamingDocument = (event?: React.SyntheticEvent) => {
    event?.stopPropagation();
    setEditingDocId(null);
    setEditingDocName("");
  };

  const renameDocument = async (doc: UploadedDoc, event?: React.SyntheticEvent) => {
    event?.stopPropagation();
    if (!currentNotebookId) return;
    const cleanName = editingDocName.trim();
    if (!cleanName) return;
    if (cleanName === doc.name) {
      cancelRenamingDocument();
      return;
    }

    try {
      const res = await fetch("/api/documents/rename", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-notebook-id": currentNotebookId },
        body: JSON.stringify({ id: doc.id, name: cleanName, notebookId: currentNotebookId }),
      });
      const updatedDoc = await res.json();
      if (!res.ok) throw new Error(updatedDoc.error || "Failed to rename");
      const normalizedDoc = normalizeDocument(updatedDoc);
      setDocuments((prev) => prev.map((item) => (item.id === doc.id ? { ...item, ...normalizedDoc } : item)));
      setPreviewDoc((current) => (current?.id === doc.id ? { ...current, ...normalizedDoc } : current));
      cancelRenamingDocument();
    } catch (error) {
      console.error("Failed to rename document", error);
      alert("Erro ao renomear a fonte.");
    }
  };

  const toggleDocSelection = (id: string) => {
    setSelectedDocIds((prev) =>
      prev.includes(id) ? prev.filter((docId) => docId !== id) : [...prev, id],
    );
  };

  const handleChat = async (
    messageOverride?: string,
    displayMessageOverride?: string,
    studioContext?: StudioChatContext,
  ) => {
    const outgoingMessage = messageOverride ?? query;
    if (!outgoingMessage.trim() && selectedDocIds.length === 0) return;
    if (!currentNotebookId) {
      alert("Selecione ou crie um caderno antes de conversar.");
      return;
    }
    if (!isGeminiModel(modelName)) {
      alert("Nesta versão, o chat com documentos funciona de ponta a ponta apenas com modelos Gemini. Os catálogos OpenAI e Anthropic já aparecem na lista, mas ainda dependem de integração adicional no backend.");
      return;
    }

    const newQuery = outgoingMessage;
    const displayQuery = displayMessageOverride || newQuery;
    const combinedCustomPrompt = [customPrompt, activeSkillsPrompt].filter(Boolean).join("\n\n");
    setQuery("");
    setMessages((prev) => [...prev, { role: "user", text: displayQuery }]);
    setIsTyping(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "x-model-name": modelName,
          "x-notebook-id": currentNotebookId
        },
        body: JSON.stringify({
          message: newQuery,
          history: buildChatRequestHistory(messages),
          selectedDocIds: selectedDocIds,
          customPrompt: combinedCustomPrompt,
          studioContext,
          notebookId: currentNotebookId,
        }),
      });

      if (!response.ok) {
        let errDesc = "Erro ao comunicar com a IA.";
        try {
           const errPayload = await response.json();
           errDesc = errPayload.error || errDesc;
        } catch(e) {}
        throw new Error(errDesc);
      }

      if (!response.body) throw new Error("No response body stream");

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");

      setMessages((prev) => [...prev, { role: "model", text: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });

        setMessages((prev) => {
          const lastIndex = prev.length - 1;
          return prev.map((msg, index) =>
            index === lastIndex ? { ...msg, text: msg.text + chunk } : msg,
          );
        });
      }
    } catch (error: any) {
      console.error("Chat error", error);
      setMessages((prev) => [
        ...prev,
        { role: "model", text: error.message || "Erro ao comunicar com MedOrac." },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleChat();
    }
  };

  const startApp = () => {
    localStorage.setItem("medorac_has_started", "true");
    setHasStarted(true);
  };

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [openNav, setOpenNav] = useState({ notebooks: true, docs: true, kb: false });
  const [hoveredNb, setHoveredNb] = useState<string | null>(null);
  const [hoveredDoc, setHoveredDoc] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{type: 'notebook'|'doc', id: string} | null>(null);
  const [editingNbId, setEditingNbId] = useState<string | null>(null);
  const [editingNbTitle, setEditingNbTitle] = useState("");
  const [editingToolId, setEditingToolId] = useState<string | null>(null);
  const [editingToolText, setEditingToolText] = useState("");

  const handleUploadClick = () => {
    setShowUploadModal(true);
  };

  const previewUrl = (doc: UploadedDoc) => `/api/documents/${encodeURIComponent(doc.id)}/preview`;

  const renderPreviewContent = (doc: UploadedDoc) => {
    const url = previewUrl(doc);
    const mimeType = doc.mimeType || "";

    if (mimeType.startsWith("image/")) {
      return <img src={url} alt={doc.name} className="max-h-full max-w-full object-contain" />;
    }
    if (mimeType.startsWith("audio/")) {
      return <audio src={url} controls className="w-full" />;
    }
    if (mimeType.startsWith("video/")) {
      return <video src={url} controls className="max-h-full max-w-full" />;
    }
    if (mimeType.includes("pdf") || mimeType.startsWith("text/") || mimeType.includes("html")) {
      return <iframe src={url} title={doc.name} className="h-full w-full rounded-xl border border-black/8 bg-white" />;
    }

    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <FileText size={32} className="text-oracle-red" />
        <p className="max-w-sm text-sm text-[#334155]">
          Este formato pode não renderizar diretamente no navegador, mas a prévia local está vinculada à fonte.
        </p>
        <button
          onClick={() => window.open(url, "_blank")}
          className="rounded-xl bg-oracle-red px-4 py-2 text-sm font-semibold text-white hover:bg-oracle-red-dark"
        >
          Abrir prévia
        </button>
      </div>
    );
  };

  if (!hasStarted) {
    return (
      <div className="min-h-screen bg-white flex flex-col font-sans overflow-x-hidden">
        <header className="flex items-center justify-between gap-4 px-4 py-4 sm:px-6 sm:py-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="h-8 shrink-0 flex items-center justify-start">
              <img src="/oraculo-ico.png" alt="Oráculo da Medição Logo" className="h-full w-auto object-contain" />
            </div>
            <span className="truncate font-semibold text-base sm:text-lg text-[#1e3a5f] tracking-tight">Oráculo da Medição</span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setShowHelp(true)} className="shrink-0 p-2 text-gray-400 hover:text-gray-900 transition-colors" title="Como usar">
              <HelpCircle className="w-5 h-5" />
            </button>
            <button onClick={() => setShowSettings(true)} className="shrink-0 p-2 text-gray-400 hover:text-gray-900 transition-colors" title="Configurações">
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </header>

        <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center px-5 py-10 text-center sm:px-8 sm:py-14 md:py-16 lg:py-20">
          <h1 className="mb-6 max-w-[10ch] text-4xl font-light leading-[1.05] tracking-tight text-[#1e3a5f] sm:mb-8 sm:max-w-[12ch] sm:text-5xl md:text-6xl lg:max-w-none lg:text-[64px]">
            Analise <span className="text-oracle-red font-medium tracking-normal">Qualquer</span>{" "}
            <span className="text-oracle-amber font-medium tracking-normal">Documento</span>
          </h1>
          <p className="mb-10 max-w-xl text-base leading-relaxed text-[#334155] sm:mb-12 sm:max-w-2xl sm:text-lg md:text-[19px]">
            Você identifica e carrega as fontes técnicas, que passam a ser as referências para análises confiáveis, consistentes e fundamentadas.
          </p>
          <button 
            onClick={startApp}
            className="w-full max-w-xs rounded-full bg-oracle-red px-8 py-3.5 text-base font-semibold text-white shadow-md transition-transform hover:bg-oracle-red-dark active:scale-95 sm:w-auto sm:px-10 sm:py-4 sm:text-[17px]"
          >
            Começar agora
          </button>
        </main>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-oracle-canvas text-oracle-navy font-sans">
      
      {/* settings modal */}
      {showSettings && (
         <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/55 backdrop-blur-sm">
           <div className="max-h-[88vh] w-[min(720px,calc(100vw-32px))] overflow-y-auto rounded-2xl bg-white p-8 shadow-2xl">
             <div className="flex justify-between items-center mb-6 border-b pb-4">
                <h2 className="text-xl font-semibold text-[#1e3a5f]">Configurações</h2>
                <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-gray-600"><X size={20}/></button>
             </div>
             <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-[#334155] mb-1 block">Modelo</label>
                  <select value={modelName} onChange={e=>setModelName(e.target.value)} className="w-full bg-gray-50 border border-black/8 rounded-xl px-3 py-2 text-sm focus:outline-none">
                    {MODEL_GROUPS.map((group) => (
                      <optgroup key={group.label} label={group.label}>
                        {group.options.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <p className="mt-2 text-[11px] leading-relaxed text-gray-500">
                    Esta versao usa a Gemini File API para upload e RAG documental. Por isso, os modelos Gemini funcionam hoje de ponta a ponta; OpenAI e Anthropic ja ficaram catalogados para a proxima integracao.
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-[#334155] mb-1 block">Esforço do Estúdio</label>
                  <select
                    value={studioEffort}
                    onChange={(e) => handleStudioEffortChange(e.target.value as StudioEffort)}
                    className="w-full bg-gray-50 border border-black/8 rounded-xl px-3 py-2 text-sm focus:outline-none"
                  >
                    {STUDIO_EFFORTS.map((effort) => (
                      <option key={effort.value} value={effort.value}>
                        {effort.label} - {effort.description}
                      </option>
                    ))}
                  </select>
                  <p className="mt-2 text-[11px] leading-relaxed text-gray-500">
                    Auto aumenta a profundidade quando a fonte tem tabela, imagem, equação, log, requisito normativo ou dado crítico.
                  </p>
                </div>
                <div className="rounded-2xl border border-black/8 bg-gray-50 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[#334155]">Prompts dos níveis de esforço</p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-gray-500">
                        Estas instruções entram no backend como controle do Estúdio e não substituem as regras de fonte.
                      </p>
                    </div>
                    <button
                      onClick={resetEffortInstructions}
                      className="shrink-0 rounded-lg border border-black/8 bg-white px-3 py-1.5 text-[11px] font-semibold text-gray-500 hover:text-oracle-red"
                    >
                      Restaurar
                    </button>
                  </div>
                  <div className="space-y-3">
                    {STUDIO_EFFORTS.map((effort) => (
                      <div key={effort.value}>
                        <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-gray-500">
                          {effort.label} · {effort.description}
                        </label>
                        <textarea
                          value={customEffortInstructions[effort.value] || effort.instruction}
                          onChange={(e) => updateEffortInstruction(effort.value, e.target.value)}
                          className="h-20 w-full resize-none rounded-xl border border-black/8 bg-white px-3 py-2 text-xs leading-relaxed text-[#334155] outline-none focus:border-oracle-red/50"
                        />
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                   <label className="text-sm font-medium text-[#334155] mb-1 block">Tags de Chat (separadas por vírgula)</label>
                   <input type="text" value={chatTags} onChange={e=>setChatTags(e.target.value)} className="w-full bg-gray-50 border border-black/8 rounded-xl px-3 py-2 text-sm focus:outline-none" placeholder="Ex: FAQ, Resumo"/>
                </div>
                <div>
                   <label className="text-sm font-medium text-[#334155] mb-1 block">Custom Prompt</label>
                   <textarea value={customPrompt} onChange={e=>setCustomPrompt(e.target.value)} className="w-full bg-gray-50 border border-black/8 rounded-xl px-3 py-2 text-sm focus:outline-none h-24"></textarea>
                </div>
             </div>
             <div className="mt-6 flex justify-end">
                <button onClick={saveSettings} className="bg-oracle-red text-white px-4 py-2 rounded-xl text-sm font-medium">Salvar</button>
             </div>
           </div>
         </div>
      )}

      {/* Help Modal */}
      {showHelp && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/55 p-4 backdrop-blur-sm">
          <div className="max-h-[88vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between border-b border-black/8 pb-4">
              <div>
                <h2 className="text-lg font-semibold text-[#1e3a5f]">Como usar o Oráculo</h2>
                <p className="mt-1 text-xs text-gray-500">Fluxo, campos e ordem oficial dos prompts.</p>
              </div>
              <button onClick={() => setShowHelp(false)} className="text-gray-400 hover:text-gray-700">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-5 text-sm leading-relaxed text-[#334155]">
              <section>
                <h3 className="mb-2 text-sm font-semibold text-[#1e3a5f]">Fluxo principal</h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  {[
                    ["1. Enviar fontes", "Carregue PDF, imagem, áudio, documento local ou URL. A fonte fica registrada somente no caderno atual."],
                    ["2. Perguntas sugeridas", "Depois do upload, o backend gera perguntas específicas da fonte. Você pode clicar para aceitar ou ignorar."],
                    ["3. Chat", "Use o campo principal para perguntas livres. A fonte ativa sempre acompanha a pergunta no backend."],
                    ["4. Estúdio", "Use os cards para transformar a base em FAQ, guia, POP, análise, linha do tempo e outros formatos."],
                  ].map(([title, body]) => (
                    <div key={title} className="rounded-xl border border-black/8 bg-gray-50 p-3">
                      <p className="font-semibold text-[#1e3a5f]">{title}</p>
                      <p className="mt-1 text-xs text-gray-500">{body}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <h3 className="mb-2 text-sm font-semibold text-[#1e3a5f]">Ordem oficial dos prompts</h3>
                <div className="rounded-xl border border-black/8 bg-gray-50 p-3 text-xs text-gray-600">
                  <p><strong>1.</strong> Regras centrais do backend: fonte, grounding, segurança, anti-repetição.</p>
                  <p><strong>2.</strong> Tarefa atual: pergunta do chat ou card do Estúdio.</p>
                  <p><strong>3.</strong> Nível de esforço: Auto, Curto, Médio ou Longo.</p>
                  <p><strong>4.</strong> Custom Prompt e Skills: complementam estilo, termos e preferências, sem sobrescrever a fonte ou o card atual.</p>
                  <p><strong>5.</strong> Histórico: usado como contexto, aparado para evitar payload grande e redundância.</p>
                  <p><strong>Escopo.</strong> Cada caderno tem fontes, notas, histórico e contexto próprios. Um caderno novo começa vazio.</p>
                </div>
              </section>

              <section>
                <h3 className="mb-2 text-sm font-semibold text-[#1e3a5f]">Campos importantes</h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-xl border border-black/8 p-3">
                    <p className="font-semibold text-[#1e3a5f]">Custom Prompt</p>
                    <p className="mt-1 text-xs text-gray-500">Preferências globais de estilo, terminologia e comportamento. Não deve repetir a tarefa dos cards.</p>
                  </div>
                  <div className="rounded-xl border border-black/8 p-3">
                    <p className="font-semibold text-[#1e3a5f]">Skills</p>
                    <p className="mt-1 text-xs text-gray-500">Instruções reutilizáveis, globais ou por caderno, para um domínio ou método específico.</p>
                  </div>
                  <div className="rounded-xl border border-black/8 p-3">
                    <p className="font-semibold text-[#1e3a5f]">Níveis de esforço</p>
                    <p className="mt-1 text-xs text-gray-500">Controlam profundidade e criticidade. Podem ser editados em Configurações.</p>
                  </div>
                  <div className="rounded-xl border border-black/8 p-3">
                    <p className="font-semibold text-[#1e3a5f]">Notas vinculadas</p>
                    <p className="mt-1 text-xs text-gray-500">Comentários do usuário ligados a uma resposta ou item analisado.</p>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="mb-2 text-sm font-semibold text-[#1e3a5f]">Formatação das respostas</h3>
                <p className="rounded-xl border border-black/8 bg-gray-50 p-3 text-xs text-gray-600">
                  O conteúdo gerado no chat usa fonte da aplicação, texto 12px, títulos 12px em negrito, notas 10px,
                  espaçamento 1,5, alinhamento justificado e numeração progressiva de seções quando houver títulos Markdown.
                </p>
              </section>
            </div>
          </div>
        </div>
      )}

      {/* Edit Tool Prompt Modal */}
      {editingToolId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/55 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-[540px] p-6 shadow-2xl">
            <h2 className="text-xl font-semibold text-[#1e3a5f] mb-2">Editar Prompt do Estúdio</h2>
            <p className="text-sm text-gray-500 mb-4">Personalize as instruções que serão enviadas para a IA quando este botão for clicado.</p>
            <textarea 
              value={editingToolText}
              onChange={(e) => setEditingToolText(e.target.value)}
              className="w-full h-40 bg-gray-50 border border-black/8 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-oracle-red resize-none mb-6"
              placeholder="Digite as instruções..."
            />
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setEditingToolId(null)}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-xl"
              >
                Cancelar
              </button>
              <button 
                onClick={() => {
                  const newPrompts = { ...customToolsPrompts, [editingToolId]: editingToolText };
                  setCustomToolsPrompts(newPrompts);
                  localStorage.setItem("medorac_custom_tools_prompts", JSON.stringify(newPrompts));
                  setEditingToolId(null);
                }}
                className="px-4 py-2 text-sm font-medium text-white bg-oracle-red hover:bg-oracle-red-dark rounded-xl"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/55 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-[400px] p-6 shadow-2xl">
            <h2 className="text-xl font-semibold text-[#1e3a5f] mb-2">Confirmar Exclusão</h2>
            <p className="text-sm text-gray-500 mb-6">
              {confirmDelete.type === 'notebook' 
                ? 'Tem certeza que deseja excluir este caderno?'
                : 'Tem certeza que deseja apagar este documento permanentemente de todos os cadernos/projetos?'}
            </p>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-xl"
              >
                Cancelar
              </button>
              <button 
                onClick={() => {
                  if (confirmDelete.type === 'notebook') {
                    executeDeleteNotebook(confirmDelete.id);
                  } else {
                    executeDeleteDoc(confirmDelete.id);
                  }
                  setConfirmDelete(null);
                }}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-xl"
              >
                Apagar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-[540px] p-8 shadow-2xl">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="text-xl font-semibold text-[#1e3a5f]">Adicionar fontes</h2>
                <p className="text-sm text-gray-500 mt-0.5">Mande os arquivos aqui</p>
              </div>
              <button onClick={() => setShowUploadModal(false)} className="p-1 text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>

            <div className="flex items-center gap-2 bg-gray-50 border border-black/8 rounded-xl px-3.5 py-2.5 mb-4">
              <Globe2 size={15} className="text-gray-400" />
              <input
                value={webUrl}
                onChange={(e) => setWebUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleWebUrlUpload();
                  }
                }}
                placeholder="Cole uma URL http/https para adicionar como fonte"
                className="flex-1 bg-transparent text-sm text-[#1e3a5f] placeholder:text-gray-400 focus:outline-none"
              />
              <button
                onClick={handleWebUrlUpload}
                disabled={isUploading || !webUrl.trim()}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  webUrl.trim() && !isUploading ? "bg-oracle-red text-white hover:bg-oracle-red-dark" : "bg-gray-100 text-gray-400"
                }`}
              >
                Adicionar
              </button>
            </div>

            {/* Drop zone */}
            <div
              className={`border-2 border-dashed rounded-2xl p-10 text-center mb-4 transition-all relative ${
                isUploading ? 'border-oracle-red bg-oracle-red-bg' : 'border-black/14 bg-gray-50'
              }`}
            >
              <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center mx-auto mb-4 shadow-sm">
                <Upload size={22} className="text-oracle-red" />
              </div>
              <p className="text-sm font-semibold text-[#1e3a5f] mb-1">
                {isUploading ? "Enviando arquivo..." : "Clique para selecionar seus arquivos"}
              </p>
              <p className="text-xs text-gray-500">pdf, imagens, audio e outros</p>
              
              <input
                 type="file"
                 className="absolute inset-0 opacity-0 cursor-pointer"
                 ref={fileInputRef}
                 onChange={(e) => {
                   handleFileUpload(e).then(() => setShowUploadModal(false));
                 }}
              />
            </div>
            
            <div className="flex gap-2.5 justify-center flex-wrap">
               <button
                 onClick={() => audioInputRef.current?.click()}
                 className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-black/8 bg-white text-sm text-[#1e3a5f] hover:bg-gray-50 transition-colors"
               >
                  <Mic size={14} className="text-oracle-red" />
                  Áudio
               </button>
               <input
                 ref={audioInputRef}
                 type="file"
                 accept="audio/*"
                 className="hidden"
                 onChange={(e) => {
                   handleFileUpload(e).then(() => setShowUploadModal(false));
                 }}
               />
               <button onClick={loadSamples} className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-black/8 bg-white text-sm text-[#1e3a5f] hover:bg-gray-50 transition-colors">
                  + Amostras Teste
               </button>
               <button onClick={() => { loadKnowledgeBase(); setShowUploadModal(false); }} className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-black/8 bg-white text-sm text-[#1e3a5f] hover:bg-gray-50 transition-colors">
                  + Base de Conhecimento
               </button>
            </div>
          </div>
        </div>
      )}

      {/* Source Preview Modal */}
      {previewDoc && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/55 p-5 backdrop-blur-sm">
          <div className="flex h-[78vh] w-full max-w-4xl flex-col rounded-2xl bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-4 border-b border-black/8 pb-3">
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold text-[#1e3a5f]">{previewDoc.name}</h2>
                <p className="mt-0.5 text-xs text-gray-500">
                  {previewDoc.mimeType || "tipo desconhecido"} · {previewDoc.status}
                </p>
              </div>
              <button onClick={() => setPreviewDoc(null)} className="shrink-0 p-1 text-gray-400 hover:text-gray-700">
                <X size={20} />
              </button>
            </div>
            <div className="min-h-0 flex-1 rounded-xl bg-gray-50 p-3">
              {renderPreviewContent(previewDoc)}
            </div>
          </div>
        </div>
      )}

      {/* Profile Modal */}
      {showProfile && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/55 p-5 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between border-b border-black/8 pb-4">
              <h2 className="text-lg font-semibold text-[#1e3a5f]">Perfil</h2>
              <button onClick={() => setShowProfile(false)} className="text-gray-400 hover:text-gray-700">
                <X size={20} />
              </button>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => profilePhotoInputRef.current?.click()}
                className="h-20 w-20 shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-oracle-red to-oracle-red-dark border border-black/10 flex items-center justify-center"
                title="Alterar foto"
              >
                {profilePhoto ? (
                  <img src={profilePhoto} alt={profileName} className="h-full w-full object-cover" />
                ) : (
                  <span className="text-xl font-bold text-white">{profileInitials}</span>
                )}
              </button>
              <input ref={profilePhotoInputRef} type="file" accept="image/*" className="hidden" onChange={handleProfilePhotoChange} />
              <div className="min-w-0 flex-1 space-y-3">
                <input
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  className="w-full rounded-xl border border-black/10 bg-gray-50 px-3 py-2 text-sm text-[#1e3a5f] outline-none focus:border-oracle-red/50"
                  placeholder="Nome"
                />
                <input
                  value={profileRole}
                  onChange={(e) => setProfileRole(e.target.value)}
                  className="w-full rounded-xl border border-black/10 bg-gray-50 px-3 py-2 text-sm text-[#1e3a5f] outline-none focus:border-oracle-red/50"
                  placeholder="Função"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setProfilePhoto("")} className="rounded-xl px-4 py-2 text-sm font-medium text-gray-500 hover:bg-gray-100">
                Remover foto
              </button>
              <button onClick={saveProfile} className="rounded-xl bg-oracle-red px-4 py-2 text-sm font-semibold text-white hover:bg-oracle-red-dark">
                Salvar perfil
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Skills Modal */}
      {showSkills && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/55 p-5 backdrop-blur-sm">
          <div className="flex max-h-[82vh] w-full max-w-3xl flex-col rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between border-b border-black/8 pb-4">
              <div>
                <h2 className="text-lg font-semibold text-[#1e3a5f]">Skills</h2>
                <p className="mt-1 text-xs text-gray-500">
                  Skills ativas entram automaticamente no prompt do chat e do Estúdio.
                </p>
                <p className="mt-1 text-[11px] text-gray-400">
                  {activeSkills.length} skill{activeSkills.length === 1 ? "" : "s"} aplicada{activeSkills.length === 1 ? "" : "s"} ao caderno atual.
                </p>
              </div>
              <button onClick={() => setShowSkills(false)} className="text-gray-400 hover:text-gray-700">
                <X size={20} />
              </button>
            </div>

            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-black/8 bg-gray-50 px-3 py-2">
              <p className="text-xs leading-relaxed text-gray-500">
                Use arquivos no formato <span className="font-semibold text-[#1e3a5f]">SKILL.md</span> com frontmatter <span className="font-semibold text-[#1e3a5f]">name</span> e <span className="font-semibold text-[#1e3a5f]">description</span>.
              </p>
              <div className="flex shrink-0 flex-wrap gap-2">
                <input
                  ref={skillImportInputRef}
                  type="file"
                  accept=".md,.markdown,text/markdown,text/plain"
                  onChange={importSkillFile}
                  className="hidden"
                />
                <button
                  onClick={() => skillImportInputRef.current?.click()}
                  className="flex items-center gap-1.5 rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold text-[#1e3a5f] hover:bg-gray-100"
                >
                  <UploadCloud size={14} />
                  Importar SKILL.md
                </button>
                <button
                  onClick={exportSkillTemplate}
                  className="flex items-center gap-1.5 rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold text-[#1e3a5f] hover:bg-gray-100"
                >
                  <FileDown size={14} />
                  Exportar modelo
                </button>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-[1fr_170px]">
              <input
                value={skillName}
                onChange={(e) => setSkillName(e.target.value)}
                className="rounded-xl border border-black/10 bg-gray-50 px-3 py-2 text-sm text-[#1e3a5f] outline-none focus:border-oracle-red/50"
                placeholder="Nome da skill"
              />
              <select
                value={skillScope}
                onChange={(e) => setSkillScope(e.target.value as "global" | "notebook")}
                className="rounded-xl border border-black/10 bg-gray-50 px-3 py-2 text-sm text-[#1e3a5f] outline-none focus:border-oracle-red/50"
              >
                <option value="notebook">Caderno atual</option>
                <option value="global">Global</option>
              </select>
              <input
                value={skillDescription}
                onChange={(e) => setSkillDescription(e.target.value)}
                className="rounded-xl border border-black/10 bg-gray-50 px-3 py-2 text-sm text-[#1e3a5f] outline-none focus:border-oracle-red/50 md:col-span-2"
                placeholder="Descrição / quando usar esta skill"
              />
              <textarea
                value={skillContent}
                onChange={(e) => setSkillContent(e.target.value)}
                className="min-h-28 rounded-xl border border-black/10 bg-gray-50 px-3 py-2 text-sm leading-relaxed text-[#1e3a5f] outline-none focus:border-oracle-red/50 md:col-span-2"
                placeholder="Cole ou escreva as instruções da skill..."
              />
              <div className="md:col-span-2 flex justify-end">
                <button
                  onClick={addSkill}
                  disabled={!skillName.trim() || !skillContent.trim()}
                  className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
                    skillName.trim() && skillContent.trim() ? "bg-oracle-red text-white hover:bg-oracle-red-dark" : "bg-gray-100 text-gray-400"
                  }`}
                >
                  Adicionar skill
                </button>
              </div>
            </div>

            <div className="mt-5 min-h-0 flex-1 overflow-y-auto space-y-2 pr-1">
              {skills.length === 0 && (
                <div className="rounded-xl border border-dashed border-black/10 p-4 text-sm text-gray-500">
                  Nenhuma skill cadastrada ainda.
                </div>
              )}
              {skills.map((skill) => (
                <div key={skill.id} className="rounded-xl border border-black/8 bg-gray-50 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[#1e3a5f]">{skill.name}</p>
                      <p className="mt-0.5 text-[11px] uppercase tracking-wide text-gray-400">
                        {skill.scope === "global" ? "Global" : skill.notebookId === currentNotebookId ? "Caderno atual" : "Outro caderno"}
                      </p>
                      {skill.description && (
                        <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-gray-500">{skill.description}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        onClick={() => toggleSkill(skill.id)}
                        role="switch"
                        aria-checked={skill.enabled}
                        className={`flex items-center gap-2 rounded-full px-2 py-1 text-[11px] font-semibold transition-colors ${
                          skill.enabled ? "bg-red-50 text-oracle-red" : "bg-gray-200 text-gray-500"
                        }`}
                        title={skill.enabled ? "Desativar esta skill no prompt" : "Ativar esta skill no prompt"}
                      >
                        <span
                          className={`h-4 w-7 rounded-full p-0.5 transition-colors ${
                            skill.enabled ? "bg-oracle-red" : "bg-gray-400"
                          }`}
                        >
                          <span
                            className={`block h-3 w-3 rounded-full bg-white transition-transform ${
                              skill.enabled ? "translate-x-3" : "translate-x-0"
                            }`}
                          />
                        </span>
                        {skill.enabled ? "Aplicando" : "Pausada"}
                      </button>
                      <button
                        onClick={() => exportSkill(skill)}
                        className="p-1 text-gray-400 hover:text-oracle-red"
                        title="Exportar SKILL.md"
                      >
                        <Download size={14} />
                      </button>
                      <button onClick={() => deleteSkill(skill.id)} className="p-1 text-gray-400 hover:text-red-500">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-gray-600">{skill.content}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TopBar */}
      <header className="relative flex h-24 shrink-0 items-center gap-3 overflow-hidden border-b border-white/10 bg-[#1f416d] px-4 shadow-[0_2px_10px_rgba(15,23,42,0.16)] sm:h-[104px] sm:px-8">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/25" />
        <div className="pointer-events-none absolute inset-y-0 left-0 w-72 bg-[radial-gradient(circle_at_18%_50%,rgba(255,255,255,0.12),transparent_58%)]" />
        <div className="flex min-w-0 items-center gap-4 sm:gap-6">
          <div className="flex h-[100px] w-[100px] shrink-0 items-center justify-center">
            <img src="/icon.png" alt="ícone" className="h-[100px] w-[100px] object-contain drop-shadow-[0_3px_5px_rgba(0,0,0,0.35)]" />
          </div>
          <div className="hidden min-w-0 items-baseline gap-2 sm:flex">
            <span className="truncate text-[18px] font-extrabold uppercase leading-none tracking-[0.015em] text-white">
              ORÁCULO DA MEDIÇÃO
            </span>
            <span className="text-[17px] font-semibold leading-none text-white/62">
              - Analise Qualquer Documento.
            </span>
          </div>
        </div>
        <div className="flex-1" />
        <button
          onClick={() => setShowHelp(true)}
          className="flex items-center gap-1.5 rounded-lg border border-white/12 bg-white/[0.06] px-3.5 py-1.5 text-sm font-medium text-white/82 transition-colors hover:bg-white/12 hover:text-white"
          title="Como usar"
        >
          <HelpCircle size={14} className="text-white/60" />
          <span className="hidden sm:inline">Ajuda</span>
        </button>
        <button
          onClick={() => setShowSkills(true)}
          className="flex items-center gap-1.5 rounded-lg bg-oracle-red px-3.5 py-1.5 text-sm font-semibold text-white shadow-sm shadow-black/10 transition-colors hover:bg-oracle-red-dark"
          title="Ingerir e gerenciar skills"
        >
          <Sparkles size={14} />
          <span className="hidden sm:inline">Skills</span>
        </button>
        <button 
          onClick={() => setShowSettings(true)}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-oracle-red text-sm text-white font-semibold hover:bg-oracle-red-dark transition-colors"
        >
          <Settings size={14} />
          <span className="hidden sm:inline">Configurações</span>
        </button>
        <button
          onClick={() => setShowProfile(true)}
          className="w-9 h-9 rounded-full bg-gradient-to-br from-oracle-red to-oracle-red-dark flex items-center justify-center border-2 border-white/20 cursor-pointer overflow-hidden"
          title="Perfil do usuário"
        >
          {profilePhoto ? (
            <img src={profilePhoto} alt={profileName} className="h-full w-full object-cover" />
          ) : (
            <span className="text-xs font-bold text-white">{profileInitials}</span>
          )}
        </button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* LeftPanel */}
        <aside
          className="hidden bg-[#f3f4f6] border-r border-black/8 md:flex flex-col shrink-0 overflow-hidden"
          style={{ width: leftSidebarWidth }}
        >
          <div className="px-3.5 h-[88px] flex flex-col justify-center border-b border-black/8 shrink-0">
            <p className="mb-2.5 text-center text-sm font-semibold text-[#1e3a5f]">
              Cadernos Ativos
            </p>
            <button
              onClick={createNewNotebook}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed border-black/14 text-sm text-oracle-red font-medium hover:bg-red-50 transition-colors"
            >
              <Plus size={14} />
              Novo Caderno
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-2.5 pt-2.5">
            {/* Cadernos */}
            <button onClick={() => setOpenNav(o => ({...o, notebooks: !o.notebooks}))} className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[#334155] text-sm font-medium hover:bg-gray-200 transition-colors mb-px">
              <BookOpen size={14} className="text-oracle-red" />
              <span className="flex-1 text-left text-sm font-semibold text-[#1e3a5f]">Cadernos</span>
              <span className="text-[11px] text-gray-500 bg-gray-200 rounded-full px-1.5">{notebooks.length}</span>
            </button>
            {openNav.notebooks && notebooks.map(nb => (
              <div
                key={nb.id}
                onClick={() => selectNotebook(nb)}
                onMouseEnter={() => setHoveredNb(nb.id)}
                onMouseLeave={() => setHoveredNb(null)}
                className={`w-full px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between mb-px transition-colors cursor-pointer ${
                  currentNotebookId === nb.id ? 'bg-red-50 text-oracle-red font-semibold' : 'text-slate-700 hover:bg-gray-200'
                }`}
              >
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  <BookOpen size={13} className={`shrink-0 ${currentNotebookId === nb.id ? 'text-oracle-red' : 'text-gray-400'}`} />
                  {editingNbId === nb.id ? (
                    <input
                      type="text"
                      className="flex-1 bg-white outline-none border border-oracle-red/30 rounded px-1.5 py-0.5 min-w-0 text-xs text-slate-900 font-normal shadow-sm"
                      value={editingNbTitle}
                      onChange={(e) => setEditingNbTitle(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onBlur={(e) => saveNotebookTitle(nb.id, e)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveNotebookTitle(nb.id, e);
                        if (e.key === 'Escape') setEditingNbId(null);
                      }}
                      autoFocus
                    />
                  ) : (
                    <span 
                      className="leading-snug truncate"
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        setEditingNbId(nb.id);
                        setEditingNbTitle(nb.title);
                      }}
                    >
                      {nb.title}
                    </span>
                  )}
                </div>
                {hoveredNb === nb.id && (
                  <div className="flex items-center gap-1 shrink-0 ml-2 mt-0.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingNbId(nb.id);
                        setEditingNbTitle(nb.title);
                      }}
                      className="text-gray-400 opacity-70 hover:opacity-100 hover:text-oracle-red p-0.5"
                      title="Renomear"
                    >
                      <Edit2 size={12} />
                    </button>
                    <button
                      onClick={(e) => deleteNotebook(nb.id, e)}
                      className="text-red-500 opacity-70 hover:opacity-100 p-0.5"
                      title="Apagar caderno"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                )}
              </div>
            ))}

            {/* Documentos */}
            <div className="mt-2"></div>
            <button onClick={() => setOpenNav(o => ({...o, docs: !o.docs}))} className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[#334155] text-sm font-medium hover:bg-gray-200 transition-colors mb-px">
              <FileText size={14} className="text-oracle-red" />
              <span className="flex-1 text-left text-sm font-semibold text-[#1e3a5f]">Contexto Atual</span>
              <span className="text-[11px] text-gray-500 bg-gray-200 rounded-full px-1.5">{selectedDocIds.length}</span>
            </button>
            {openNav.docs && documents.filter(d => selectedDocIds.includes(d.id)).map((doc) => (
              <div
                key={doc.id}
                onMouseEnter={() => setHoveredDoc(doc.id)}
                onMouseLeave={() => setHoveredDoc(null)}
                className="group/doc relative mb-1 flex cursor-pointer items-center gap-2.5 rounded-xl border border-oracle-red/10 bg-white px-2.5 py-2 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all hover:border-oracle-red/25 hover:bg-red-50/35 hover:shadow-sm"
                onClick={() => {
                  if (editingDocId !== doc.id) toggleDocSelection(doc.id);
                }}
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-red-100 bg-red-50 shadow-sm">
                  <DocumentTypeIcon doc={doc} active />
                </div>
                <div className="flex-1 min-w-0">
                  {editingDocId === doc.id ? (
                    <input
                      autoFocus
                      value={editingDocName}
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      onChange={(e) => setEditingDocName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") renameDocument(doc, e);
                        if (e.key === "Escape") cancelRenamingDocument(e);
                      }}
                      className="w-full rounded-md border border-oracle-red/30 bg-white px-1.5 py-0.5 text-[11px] font-medium text-oracle-red outline-none focus:border-oracle-red"
                      aria-label="Nome da fonte"
                    />
                  ) : (
                    <p className="line-clamp-2 text-[11px] font-semibold leading-snug text-[#1e3a5f] group-hover/doc:text-oracle-red" title={doc.name}>{doc.name}</p>
                  )}
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="rounded-full bg-oracle-red/10 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-oracle-red">Ativa</span>
                    <span className="text-[9px] text-gray-500">{new Date(doc.uploadDate).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {editingDocId === doc.id ? (
                    <>
                      <button
                        onClick={(e) => renameDocument(doc, e)}
                        className="text-gray-400 opacity-80 hover:text-oracle-red hover:opacity-100 p-0.5"
                        title="Salvar nome"
                        aria-label="Salvar nome da fonte"
                      >
                        <Save size={13} />
                      </button>
                      <button
                        onClick={(e) => cancelRenamingDocument(e)}
                        className="text-gray-400 opacity-80 hover:text-red-500 hover:opacity-100 p-0.5"
                        title="Cancelar renomeação"
                        aria-label="Cancelar renomeação"
                      >
                        <X size={14} />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={(e) => startRenamingDocument(doc, e)}
                        className="text-gray-400 opacity-80 hover:text-oracle-red hover:opacity-100 p-0.5"
                        title="Renomear fonte"
                        aria-label="Renomear fonte"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setPreviewDoc(doc); }}
                        className="text-gray-400 opacity-80 hover:text-oracle-red hover:opacity-100 p-0.5"
                        title="Visualizar fonte"
                        aria-label="Visualizar fonte"
                      >
                        <Eye size={14} />
                      </button>
                    </>
                  )}
                  {editingDocId !== doc.id && hoveredDoc === doc.id && (
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleDocSelection(doc.id); }}
                      className="text-red-500 opacity-70 hover:opacity-100 p-0.5"
                      title="Remover do contexto"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
            
            {openNav.docs && documents.filter(d => !selectedDocIds.includes(d.id)).map((doc) => (
              <div
                key={doc.id}
                onMouseEnter={() => setHoveredDoc(doc.id)}
                onMouseLeave={() => setHoveredDoc(null)}
                className="group/doc relative mb-1 flex cursor-pointer items-center gap-2.5 rounded-xl border border-black/6 bg-white/55 px-2.5 py-2 transition-all hover:border-black/12 hover:bg-white hover:shadow-sm"
                onClick={() => {
                  if (editingDocId !== doc.id) toggleDocSelection(doc.id);
                }}
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-black/5 bg-white shadow-sm">
                  <DocumentTypeIcon doc={doc} />
                </div>
                <div className="flex-1 min-w-0">
                  {editingDocId === doc.id ? (
                    <input
                      autoFocus
                      value={editingDocName}
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      onChange={(e) => setEditingDocName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") renameDocument(doc, e);
                        if (e.key === "Escape") cancelRenamingDocument(e);
                      }}
                      className="w-full rounded-md border border-oracle-red/30 bg-white px-1.5 py-0.5 text-[11px] font-medium text-slate-700 outline-none focus:border-oracle-red"
                      aria-label="Nome da fonte"
                    />
                  ) : (
                    <p className="line-clamp-2 text-[11px] font-medium leading-snug text-slate-700 group-hover/doc:text-[#1e3a5f]" title={doc.name}>{doc.name}</p>
                  )}
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-gray-500">Disponível</span>
                    <span className="text-[9px] text-gray-500">{new Date(doc.uploadDate).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {editingDocId === doc.id ? (
                    <>
                      <button
                        onClick={(e) => renameDocument(doc, e)}
                        className="text-gray-400 opacity-80 hover:text-oracle-red hover:opacity-100 p-0.5"
                        title="Salvar nome"
                        aria-label="Salvar nome da fonte"
                      >
                        <Save size={13} />
                      </button>
                      <button
                        onClick={(e) => cancelRenamingDocument(e)}
                        className="text-gray-400 opacity-80 hover:text-red-500 hover:opacity-100 p-0.5"
                        title="Cancelar renomeação"
                        aria-label="Cancelar renomeação"
                      >
                        <X size={14} />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={(e) => startRenamingDocument(doc, e)}
                        className="text-gray-400 opacity-80 hover:text-oracle-red hover:opacity-100 p-0.5"
                        title="Renomear fonte"
                        aria-label="Renomear fonte"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setPreviewDoc(doc); }}
                        className="text-gray-400 opacity-80 hover:text-oracle-red hover:opacity-100 p-0.5"
                        title="Visualizar fonte"
                        aria-label="Visualizar fonte"
                      >
                        <Eye size={14} />
                      </button>
                    </>
                  )}
                  {editingDocId !== doc.id && hoveredDoc === doc.id && (
                    <button
                      onClick={(e) => handleDelete(doc.id, e)}
                      className="text-red-500 opacity-70 hover:opacity-100 p-0.5"
                      title="Apagar permanentemente"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="px-3.5 py-2.5 border-t border-black/8">
            <button
              onClick={handleUploadClick}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-oracle-red text-sm text-white font-medium hover:bg-oracle-red-dark transition-colors"
            >
              <Upload size={14} />
              Enviar Documentos
            </button>
            <div className="flex items-center justify-center gap-1.5 mt-2.5">
              <div className="w-1.5 h-1.5 rounded-full bg-green-600 animate-pulse" />
              <span className="text-[11px] text-gray-500">Servidor Online</span>
            </div>
          </div>
        </aside>
        <div
          className="group hidden w-2 shrink-0 cursor-col-resize items-center justify-center bg-white hover:bg-red-50 md:flex"
          onMouseDown={() => setResizingSidebar("left")}
          title="Ajustar largura da barra lateral"
        >
          <GripVertical size={14} className="text-gray-300 group-hover:text-oracle-red" />
        </div>

        {/* ChatPanel */}
        <div className="flex-1 flex flex-col min-w-0 bg-white relative">
          {/* Header */}
          <div className="sticky top-0 z-10 flex h-[88px] shrink-0 items-center gap-3 border-b border-black/8 bg-white/90 px-6 shadow-[0_1px_0_rgba(15,23,42,0.02)] backdrop-blur-sm">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-black/8 bg-white shadow-sm">
              <img src="/oraculo-ico.png" className="h-8 w-8 object-contain" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-semibold text-[#1e3a5f]">Conversa</h1>
              <p className="max-w-[520px] truncate text-xs text-gray-500">
                {notebooks.find((notebook) => notebook.id === currentNotebookId)?.title || "Caderno atual"}
              </p>
            </div>
            <div className="ml-auto hidden flex-wrap items-center justify-end gap-2 xl:flex">
              <span className="rounded-full border border-black/8 bg-gray-50 px-2.5 py-1 text-[11px] font-semibold text-[#334155]">
                {selectedDocIds.length} ativa{selectedDocIds.length === 1 ? "" : "s"}
              </span>
              <span className="rounded-full border border-black/8 bg-gray-50 px-2.5 py-1 text-[11px] font-semibold text-[#334155]">
                {documents.length} fonte{documents.length === 1 ? "" : "s"}
              </span>
              <span className="rounded-full border border-oracle-red/15 bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-oracle-red">
                {modelName.replace(/^models\//, "")}
              </span>
              {activeSkills.length > 0 && (
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                  {activeSkills.length} skill{activeSkills.length === 1 ? "" : "s"}
                </span>
              )}
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 pb-4">
             {messages.length === 0 ? (
               <div className="mx-auto mt-24 flex max-w-2xl flex-col items-center text-center">
                 <img src="/oraculo-logo.png" className="mb-4 w-80 max-w-full drop-shadow-sm"/>
                 <p className="text-base font-semibold tracking-wide text-[#1e3a5f]">Bem-vindo(a) ao Oráculo da Medição</p>
                 <p className="mt-2 max-w-xl text-sm leading-relaxed text-gray-500">Compartilhe sua fonte de referência para iniciarmos uma conversa baseada nela.</p>
                 <div className="mt-6 grid w-full max-w-md gap-2 sm:grid-cols-2">
                   <button
                     onClick={() => setShowSkills(true)}
                     className="flex items-center justify-center gap-2 rounded-xl border border-black/8 bg-white px-3 py-2.5 text-xs font-semibold text-[#1e3a5f] shadow-sm transition-colors hover:bg-gray-50"
                   >
                     <Sparkles size={15} className="text-oracle-red" /> Usar skill
                   </button>
                   <button
                     onClick={() => setQuery("Faça um resumo objetivo das fontes ativas, destacando objetivo, escopo, riscos e próximos passos.")}
                     className="flex items-center justify-center gap-2 rounded-xl border border-black/8 bg-white px-3 py-2.5 text-xs font-semibold text-[#1e3a5f] shadow-sm transition-colors hover:bg-gray-50"
                   >
                     <BookOpen size={15} className="text-oracle-red" /> Preparar resumo
                   </button>
                 </div>
               </div>
             ) : (
               messages.map((msg, i) => (
                 <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                   {msg.role === 'model' && (
                     <img src="/oraculo-ico.png" className="w-8 h-8 rounded-xl object-contain border border-black/8 mt-0.5 shrink-0 bg-white p-1 shadow-sm" />
                   )}
                   <div className={`px-5 py-4 rounded-[20px] text-[15px] leading-relaxed shadow-sm ${
                     msg.role === 'user'
                       ? 'max-w-[75%] bg-oracle-red text-white rounded-tr-sm'
                       : 'w-full max-w-[75%] bg-oracle-canvas text-[#334155] rounded-tl-sm border border-black/5'
                   }`}>
                       {msg.role === 'user' ? (
                         msg.text
                      ) : (
                         <>
                           <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-black/5 pb-2">
                             <span className="text-[10px] font-bold uppercase tracking-wide text-[#1e3a5f]">Resposta MedOrac</span>
                             <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-gray-500 ring-1 ring-black/5">
                               {selectedDocIds.length ? `${selectedDocIds.length} fonte${selectedDocIds.length === 1 ? "" : "s"} ativa${selectedDocIds.length === 1 ? "" : "s"}` : "sem fonte ativa"}
                             </span>
                           </div>
                           <div className="markdown-body medorac-generated-doc opacity-95">
                             <ReactMarkdown remarkPlugins={[remarkGfm]}>
                               {msg.text || (isTyping && i === messages.length - 1 ? "..." : "")}
                             </ReactMarkdown>
                           </div>
                         </>
                       )}

                       {msg.role === 'model' && msg.text && messageWasGeneratedByStudio(i, "Mapa Mental") && renderMindMap(msg.text)}
                       {msg.role === 'model' && msg.text && messageWasGeneratedByStudio(i, "Linha do Tempo") && renderTimeline(msg.text)}
                       {msg.role === 'model' && msg.text && messageWasGeneratedByStudio(i, "Roteiro de Áudio") && (
                         <div className="mt-4 rounded-2xl border border-black/8 bg-white p-3 shadow-sm">
                           <div className="mb-2 flex flex-wrap items-center gap-2">
                             <button
                               onClick={() => generateAudioForMessage(i, msg.text)}
                               disabled={audioLoadingIndex === i}
                               className="flex items-center gap-1.5 rounded-lg bg-oracle-red px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-oracle-red-dark disabled:opacity-60"
                             >
                               <Volume2 size={13} />
                               {audioLoadingIndex === i ? "Gerando áudio..." : "Gerar áudio"}
                             </button>
                             {audioUrls[i] && (
                               <a
                                 href={audioUrls[i]}
                                 download="roteiro-audio.wav"
                                 className="flex items-center gap-1.5 rounded-lg border border-black/10 bg-white px-3 py-1.5 text-[11px] font-semibold text-[#334155] hover:text-oracle-red"
                               >
                                 <Download size={13} /> Baixar WAV
                               </a>
                             )}
                           </div>
                           {msg.text.length > TTS_TEXT_LIMIT && (
                             <p className="mb-2 text-[10px] leading-relaxed text-gray-400">
                               Áudios longos usam uma versão resumida do roteiro para manter a geração responsiva.
                             </p>
                           )}
                           {audioUrls[i] && <audio className="w-full" controls src={audioUrls[i]} />}
                         </div>
                       )}
                       {msg.role === 'model' && msg.text && messageWasGeneratedByStudio(i, "Procedimento (POP)") && (
                         <div className="mt-4 rounded-2xl border border-black/8 bg-white p-3 shadow-sm">
                           <p className="mb-2 text-[11px] leading-relaxed text-gray-500">
                             Deseja gerar um procedimento Word preenchido com esta resposta? Templates específicos podem ser refinados depois via Skill.
                           </p>
                           <button
                             onClick={() => exportMessageAsWord(msg.text, buildMessageFileTitle(i, "Procedimento MedOrac"))}
                             className="flex items-center gap-1.5 rounded-lg bg-oracle-red px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-oracle-red-dark"
                           >
                             <FileDown size={13} /> Gerar procedimento Word
                           </button>
                         </div>
                       )}

                       {msg.role === 'model' && msg.text && !(isTyping && i === messages.length - 1) && (
                          <div className="mt-5 flex flex-wrap gap-2 border-t border-black/5 pt-3">
                             <button onClick={()=>{ navigator.clipboard.writeText(msg.text); alert("Copiado!"); }} className="flex items-center gap-1.5 rounded-full border border-black/8 bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-gray-500 shadow-sm hover:text-oracle-red">
                               <Copy size={12}/> Copiar
                             </button>
                             <button onClick={() => exportMessageAsWord(msg.text, buildMessageFileTitle(i, "Resposta MedOrac"))} className="flex items-center gap-1.5 rounded-full border border-black/8 bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-gray-500 shadow-sm hover:text-oracle-red">
                               <FileDown size={12}/> Word
                             </button>
                              <button
                                onClick={() => addNoteForMessage(i, msg)}
                                disabled={noteSavingMessageIndex === i}
                                title="Salvar esta resposta como nota vinculada"
                                className="flex items-center gap-1.5 rounded-full border border-black/8 bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-gray-500 shadow-sm hover:text-oracle-red disabled:cursor-wait disabled:opacity-60"
                              >
                                <StickyNote size={12}/> {noteSavingMessageIndex === i ? "Salvando..." : "Anotar"}
                              </button>
                             <div className="relative group">
                               <button onClick={() => setSavingMessageIndex(savingMessageIndex === i ? null : i)} className="flex items-center gap-1.5 rounded-full border border-black/8 bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-gray-500 shadow-sm hover:text-oracle-red">
                                 <Save size={12}/> Salvar na Base
                               </button>
                               {savingMessageIndex === i && (
                                <div className="absolute bottom-full left-0 mb-2 w-[160px] bg-white border border-black/10 rounded-xl shadow-[0_5px_15px_rgba(0,0,0,0.1)] overflow-hidden z-20">
                                  <button
                                    onClick={() => saveMessageAsDocument(msg.text, "txt", i)}
                                    className="w-full text-left px-4 py-2.5 hover:bg-gray-50 text-[12px] text-gray-700 font-medium transition-colors border-b border-black/5"
                                  >
                                    Texto (.txt)
                                  </button>
                                  <button
                                    onClick={() => saveMessageAsDocument(msg.text, "markdown", i)}
                                    className="w-full text-left px-4 py-2.5 hover:bg-gray-50 text-[12px] text-gray-700 font-medium transition-colors border-b border-black/5"
                                  >
                                    Markdown (.md)
                                  </button>
                                  <button
                                    onClick={() => saveMessageAsDocument(msg.text, "json", i)}
                                    className="w-full text-left px-4 py-2.5 hover:bg-gray-50 text-[12px] text-gray-700 font-medium transition-colors"
                                  >
                                    Tabela/JSON
                                  </button>
                                  <button
                                    onClick={() => exportMessageAsWord(msg.text, buildMessageFileTitle(i, "Resposta MedOrac"))}
                                    className="w-full text-left px-4 py-2.5 hover:bg-gray-50 text-[12px] text-gray-700 font-medium transition-colors border-t border-black/5"
                                  >
                                    Word (.doc)
                                  </button>
                                </div>
                              )}
                             </div>
                          </div>
                       )}
                   </div>
                   {msg.role === 'user' && (
                     <div className="w-8 h-8 rounded-xl border border-black/8 mt-0.5 shrink-0 flex items-center justify-center bg-gray-100 shadow-sm overflow-hidden text-gray-400">
                       <User size={16}/>
                     </div>
                   )}
                 </div>
               ))
             )}
             
             {isTyping && (!messages.length || messages[messages.length-1]?.role === 'user') && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-xl border border-black/8 mt-0.5 shrink-0 flex items-center justify-center bg-white shadow-sm overflow-hidden">
                    <img src="/oraculo-ico.png" className="w-full h-full object-contain p-1" />
                  </div>
                  <div className="bg-oracle-canvas px-4 py-3.5 rounded-2xl rounded-tl-sm flex gap-1.5 items-center border border-black/5 shadow-sm">
                    {[0,1,2].map(i => (
                      <div key={i} className="w-1.5 h-1.5 rounded-full bg-oracle-red animate-bounce"
                        style={{ animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </div>
                </div>
             )}
             <div ref={messagesEndRef} />
          </div>

          {/* Quick chips & Input */}
          <div className="bg-gradient-to-t from-white via-white/95 to-transparent pt-8 px-6 pb-6">
            {activeSuggestedQuestions.length > 0 && (
              <div className="mb-3">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">Perguntas sugeridas pela fonte</p>
                <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                  {activeSuggestedQuestions.map((question) => (
                    <button
                      key={question}
                      onClick={() => setQuery(question)}
                      className="shrink-0 max-w-[360px] truncate rounded-full border border-oracle-red/20 bg-red-50/60 px-3.5 py-1.5 text-[13px] font-medium text-oracle-red transition-colors hover:bg-red-50"
                      title={question}
                    >
                      {question}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="flex gap-2 pb-3 overflow-x-auto no-scrollbar">
              {chatTags.split(',').map(s=>s.trim()).filter(Boolean).map(chip => (
                <button key={chip} onClick={() => { 
                  const matchedTool = STUDIO_TOOLS.find(t => t.name.toLowerCase() === chip.toLowerCase());
                  const injectedPrompt = matchedTool ? (customToolsPrompts[matchedTool.id] || matchedTool.prompt) : chip;
                  setQuery(injectedPrompt); 
                }}
                  className={`shrink-0 px-3.5 py-1.5 rounded-full text-[13px] border whitespace-nowrap transition-colors border-black/10 bg-white text-gray-600 hover:bg-gray-50 font-medium flex items-center gap-1.5`}>
                  <Zap size={14} className="text-yellow-500 fill-yellow-500/20" />
                  {chip}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-2 bg-white border border-black/14 rounded-[20px] p-3 shadow-lg shadow-black/[0.03] focus-within:border-oracle-red/50 focus-within:ring-2 focus-within:ring-oracle-red/10 transition-all">
              <textarea
                ref={chatInputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={1}
                placeholder="Explore seus documentos para esclarecer dúvidas, realizar consultas e revelar novos insights."
                className="min-h-[28px] w-full resize-none bg-transparent pt-1 px-1 text-[15px] leading-relaxed text-[#1e3a5f] placeholder:text-gray-400 focus:outline-none max-h-40 overflow-y-auto"
              />
              <div className="flex justify-between items-center px-1">
                 <button onClick={handleUploadClick} className="p-1.5 text-gray-400 hover:text-oracle-red shrink-0 rounded-lg hover:bg-red-50 transition-colors">
                    <Upload size={18} />
                 </button>
                 <button onClick={() => handleChat()}
                  disabled={isTyping || (!query.trim() && selectedDocIds.length === 0)}
                  className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors shrink-0 ${
                    query.trim() && !isTyping ? 'bg-oracle-red hover:bg-oracle-red-dark text-white shadow-md' : 'bg-gray-100 text-gray-400'
                  }`}>
                  <Send size={15} />
                </button>
              </div>
            </div>
            <p className="text-[11px] text-gray-400 text-center mt-3 tracking-wide">
              Oráculo de Medição pode gerar respostas imprecisas. Valide as métricas.
            </p>
          </div>
        </div>

        <div
          className="group hidden w-2 shrink-0 cursor-col-resize items-center justify-center bg-white hover:bg-red-50 lg:flex"
          onMouseDown={() => setResizingSidebar("right")}
          title="Ajustar largura do Estúdio"
        >
          <GripVertical size={14} className="text-gray-300 group-hover:text-oracle-red" />
        </div>

        {/* StudioPanel */}
        <aside
          className="hidden lg:flex bg-oracle-canvas border-l border-black/8 flex-col shrink-0 overflow-hidden"
          style={{ width: rightSidebarWidth }}
        >
          <div className="flex items-center justify-center px-5 h-[88px] border-b border-black/8 bg-white/50 backdrop-blur-sm shrink-0">
            <h2 className="w-full text-center text-sm font-semibold text-[#1e3a5f]">Estúdio</h2>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            <p className="text-[11px] text-gray-500 leading-relaxed p-3.5 bg-white rounded-xl border border-black/5 shadow-sm font-medium">
              Transforme a base <span className="text-oracle-red font-bold">{selectedDocIds.length}</span> em fontes em conteúdo estruturado para realizar sua análise.
            </p>

            <div className="rounded-xl border border-black/5 bg-white p-2.5 shadow-sm">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">Esforço</p>
              <div className="grid grid-cols-4 gap-1">
                {STUDIO_EFFORTS.map((effort) => (
                  <button
                    key={effort.value}
                    onClick={() => handleStudioEffortChange(effort.value)}
                    className={`rounded-lg px-1.5 py-1.5 text-[10px] font-semibold transition-colors ${
                      studioEffort === effort.value
                        ? "bg-oracle-red text-white"
                        : "bg-gray-50 text-gray-500 hover:bg-red-50 hover:text-oracle-red"
                    }`}
                    title={effort.description}
                  >
                    {effort.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-2">
              {STUDIO_TOOLS.map((tool: any) => {
                const IconComp = tool.icon;
                const activePrompt = customToolsPrompts[tool.id] || tool.prompt;
                return (
                  <div key={tool.id} onClick={() => {
                    const studioContext = buildStudioContext(
                      tool.name,
                      activePrompt,
                      studioEffort,
                      customEffortInstructions[studioEffort],
                    );
                    const displayMessage = `Estúdio: ${tool.name} (${studioContext.effortLabel})`;
                    setQuery(displayMessage);
                    handleChat(displayMessage, displayMessage, studioContext);
                  }}
                    className="group relative flex min-h-[122px] cursor-pointer flex-col gap-3 overflow-hidden rounded-[14px] border border-black/8 bg-white p-3.5 text-left shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:border-oracle-red/35 hover:bg-white hover:shadow-[0_12px_24px_rgba(15,23,42,0.09)]">
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-oracle-red/70 via-oracle-amber/70 to-transparent opacity-70 transition-opacity group-hover:opacity-100" />
                    <div className="pointer-events-none absolute -right-8 -top-8 h-20 w-20 rounded-full bg-oracle-red/5 opacity-0 transition-opacity group-hover:opacity-100" />
                    <div className="flex justify-between items-start">
                      <div className={`${tool.color} flex h-8 w-8 items-center justify-center rounded-xl shadow-sm ring-1 ring-black/5 transition-transform duration-200 group-hover:scale-105`}>
                        <IconComp size={17} strokeWidth={2.2} />
                      </div>
                      <button 
                        className="z-10 rounded-lg bg-white/80 p-1 text-gray-400 opacity-0 shadow-sm ring-1 ring-black/5 transition-all hover:text-oracle-red group-hover:opacity-100"
                        title="Editar prompt"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingToolId(tool.id);
                          setEditingToolText(activePrompt);
                        }}
                      >
                        <Edit2 size={12} />
                      </button>
                    </div>
                    <div className="mt-auto min-w-0">
                      <div className="mb-1 flex items-start gap-1.5">
                        <p className="min-w-0 flex-1 text-[11px] font-semibold leading-tight text-[#1e3a5f] transition-colors group-hover:text-oracle-red break-words">{tool.name}</p>
                        <ArrowUp size={12} className="mt-0.5 shrink-0 rotate-45 text-gray-300 opacity-0 transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-oracle-red group-hover:opacity-100" />
                      </div>
                      <p className="text-[10px] text-gray-500 leading-[1.35] opacity-85 line-clamp-3 break-words">{tool.description}</p>
                    </div>
                  </div>
                )
              })}
            </div>
            
            <div className="pt-2">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3 px-1">Notas vinculadas</p>
              {notes.length === 0 && (
                <div className="bg-white border border-dashed border-black/10 rounded-xl p-3.5 mb-2">
                  <p className="text-[11px] text-gray-500 leading-relaxed">
                    Use o botão <span className="font-semibold text-oracle-red">Anotar</span> em uma resposta para comentar uma análise específica.
                  </p>
                </div>
              )}
              {notes.map(n => (
                <div key={n.id} className="bg-white border border-black/5 rounded-xl p-3.5 mb-2 shadow-sm relative group">
                  <p className="text-[12px] text-[#334155] leading-relaxed font-medium line-clamp-6">{n.noteText}</p>
                  <div className="mt-2 rounded-lg bg-gray-50 border border-black/5 px-2.5 py-2">
                    <p className="text-[9px] text-gray-400 font-bold uppercase mb-1">
                      Origem: {n.messageRole === "model" ? "resposta da IA" : "mensagem do usuário"} {n.messageIndex !== null ? `#${n.messageIndex + 1}` : ""}
                    </p>
                    <p className="text-[10px] text-gray-500 leading-snug line-clamp-3">
                      {n.messageText || "Trecho de origem não disponível."}
                    </p>
                  </div>
                  <p className="text-[9px] text-gray-400 mt-2 font-bold uppercase">
                    {new Date(n.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </p>
                  <button 
                    onClick={() => deleteNote(n.id)}
                    className="absolute top-2 right-2 p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 size={12}/>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </aside>

      </div>
    </div>
  );
}
