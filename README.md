Talk to your codebase.

Saturday is a small CLI that indexes a project into Qdrant, exposes a local search
webhook, and connects it to a Vapi voice assistant. The command UX uses Clack for
interactive setup and cleaner progress output.

```text
        your repo              vector store             voice UI
   +----------------+       +--------------+       +----------------+
   | satur-day sync | ----> |   Qdrant     | <---- | /api/search    |
   | code chunks    |       | embeddings   |       | Vapi tool call |
   +----------------+       +--------------+       +----------------+
            ^                                             |
            |                                             v
   +----------------+                              +----------------+
   | .saturday      |                              | browser + Vapi |
   | config         |                              | speak, ask     |
   +----------------+                              +----------------+
```

## Install

```bash
npm install -g satur-day
```

Local use from a git clone:

```bash
git clone <repo-url>
cd saturday
npm install
npm run build
npm link
```

After that, run `satur-day ...` from anywhere on the same machine.

Requirements:

- Node.js 18+
- `ngrok` on `PATH`, or an ngrok auth token for the built-in SDK fallback
- Vapi public/private keys
- Qdrant URL/API key
- OpenAI, Gemini, or Jina key for embeddings

## Quick Start

Run this inside the project you want to query:

```bash
satur-day init \
  --vapi-public-key "$VAPI_PUBLIC_KEY" \
  --vapi-private-key "$VAPI_PRIVATE_KEY" \
  --qdrant-url "$QDRANT_URL" \
  --qdrant-key "$QDRANT_API_KEY" \
  --qdrant-collection "my-project" \
  --openai-key "$OPENAI_API_KEY"

satur-day sync
satur-day serve
```

Then open the URL printed by `satur-day serve`.

If you run `satur-day init` in a real TTY, Saturday walks you through setup with
Clack prompts instead of forcing every option on the command line.

If the `ngrok` binary is not installed, `satur-day serve` falls back to the
official ngrok JavaScript SDK. For that path, set `NGROK_AUTHTOKEN` or store it
in Saturday config.

## Commands

```bash
satur-day init   # write .saturday.config.json and prepare Qdrant
satur-day sync   # chunk files, embed changed chunks, upload to Qdrant
satur-day serve  # start the web UI and create a Vapi assistant
```

CLI behavior:

- `init` uses Clack prompts when values are missing
- `sync` shows a compact progress flow and summary
- `serve` shows a cleaner startup flow with endpoint output

## Configuration

Saturday writes `.saturday.config.json`. It is ignored by git because it contains
provider keys.

Default indexing:

```json
{
  "include": ["."],
  "exclude": ["node_modules", ".git", "dist", "build"],
  "extensions": [".ts", ".js", ".tsx", ".jsx", ".py", ".md"]
}
```

## Models

Saturday has two independent model choices.

```text
assistant model  -> Vapi conversation LLM
embedding model  -> code indexing/search vectors
```

### Assistant LLM

OpenAI through Vapi:

```bash
satur-day init \
  --assistant-model-provider openai \
  --assistant-model gpt-4o
```

Groq through Vapi:

```bash
satur-day init \
  --assistant-model-provider groq \
  --assistant-model llama-3.3-70b-versatile \
  --assistant-provider-api-key "$GROQ_API_KEY"
```

Cerebras through Vapi:

```bash
satur-day init \
  --assistant-model-provider cerebras \
  --assistant-model gpt-oss-120b \
  --assistant-provider-api-key "$CEREBRAS_API_KEY"
```

Any OpenAI-compatible endpoint:

```bash
satur-day init \
  --assistant-model-provider custom-llm \
  --assistant-model gpt-oss-120b \
  --assistant-model-url https://api.cerebras.ai/v1 \
  --assistant-provider-api-key "$CEREBRAS_API_KEY"
```

If your provider key is already configured in the Vapi dashboard, omit
`--assistant-provider-api-key`.

### Embeddings

OpenAI:

```bash
satur-day init \
  --embedding-provider openai \
  --embedding-model text-embedding-3-small \
  --openai-key "$OPENAI_API_KEY"
```

Gemini:

```bash
satur-day init \
  --embedding-provider gemini \
  --embedding-model gemini-embedding-001 \
  --embedding-dimensions 768 \
  --gemini-key "$GEMINI_API_KEY"
```

Gemini supports `768`, `1536`, and `3072` dimensions. Saturday normalizes reduced
dimension vectors before writing them to Qdrant.

Jina text embeddings:

```bash
satur-day init \
  --embedding-provider jina \
  --embedding-model jina-embeddings-v5-text-small \
  --jina-key "$JINA_API_KEY"
```

Jina code embeddings:

```bash
satur-day init \
  --embedding-provider jina \
  --embedding-model jina-code-embeddings-1.5b \
  --jina-key "$JINA_API_KEY"
```

Saturday maps retrieval tasks automatically:

- text models: `retrieval.query` / `retrieval.passage`
- code models: `nl2code.query` / `nl2code.passage`

For codebase indexing, Saturday defaults Jina to `jina-code-embeddings-1.5b`.

## What Gets Published

The npm package contains only:

- compiled CLI and library files in `dist/`
- web assets in `dist/web/`
- type declarations
- this README

Tests and source files are not included in the published package.
