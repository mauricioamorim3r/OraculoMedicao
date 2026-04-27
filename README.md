<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# MedOrac - Oráculo da Medição

Aplicação web para análise técnica de documentos usando Gemini File API, cadernos isolados, skills, Estúdio e histórico local em SQLite.

## Desenvolvimento

**Prerequisites:**  Node.js

1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Produção

1. Instale dependências:
   `npm ci`
2. Configure variáveis no servidor:
   `GEMINI_API_KEY`, e futuramente `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` se forem habilitadas.
3. Valide e gere o frontend:
   `npm run prod:check`
4. Suba o servidor em modo produção:
   `npm run start`

O servidor usa `NODE_ENV=production` para servir os arquivos estáticos de `dist/`.

## Dados Locais

Preservar e fazer backup de:
- `data/medorac.db`
- `data/previews/`
- `.env.local` ou variáveis equivalentes do ambiente

Pastas temporárias/artefatos que podem ser limpos antes de empacotar:
- `uploads/`
- `temp_medorac/`
- `output/`
- `.codex-server*.log`

Não apagar `samples/`, `knowledge_base/` ou `public/`, pois podem ser usados pela aplicação.
