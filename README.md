# Saturday
                                                                                                   

Talk to your codebase.

Saturday is a small CLI that indexes a project into Qdrant, exposes a local search
webhook, and connects it to a Vapi voice assistant.

```text
        your repo              vector store             voice UI
   +----------------+       +--------------+       +----------------+
   | saturday sync  | ----> |   Qdrant     | <---- | /api/search    |
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
npm install -g saturday
```

Requirements:

- Node.js 18+
- `ngrok` on `PATH`
- Vapi public/private keys
- Qdrant URL/API key
- OpenAI or Gemini key for embeddings

## Quick Start

Run this inside the project you want to query:

```bash
saturday init \
  --vapi-public-key "$VAPI_PUBLIC_KEY" \
  --vapi-private-key "$VAPI_PRIVATE_KEY" \
  --qdrant-url "$QDRANT_URL" \
  --qdrant-key "$QDRANT_API_KEY" \
  --qdrant-collection "my-project" \
  --openai-key "$OPENAI_API_KEY"

saturday sync
saturday serve
```

Then open the URL printed by `saturday serve`.

## Commands

```bash
saturday init   # write .saturday.config.json and prepare Qdrant
saturday sync   # chunk files, embed changed chunks, upload to Qdrant
saturday serve  # start the web UI and create a Vapi assistant
```

## Configuration

Saturday writes `.saturday.config.json`. It is ignored by git because it contains
provider keys.

Default indexing:

```json
{
  "include": ["src", "lib"],
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
saturday init \
  --assistant-model-provider openai \
  --assistant-model gpt-4o
```

Groq through Vapi:

```bash
saturday init \
  --assistant-model-provider groq \
  --assistant-model llama-3.3-70b-versatile \
  --assistant-provider-api-key "$GROQ_API_KEY"
```

Cerebras through Vapi:

```bash
saturday init \
  --assistant-model-provider cerebras \
  --assistant-model gpt-oss-120b \
  --assistant-provider-api-key "$CEREBRAS_API_KEY"
```

Any OpenAI-compatible endpoint:

```bash
saturday init \
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
saturday init \
  --embedding-provider openai \
  --embedding-model text-embedding-3-small \
  --openai-key "$OPENAI_API_KEY"
```

Gemini:

```bash
saturday init \
  --embedding-provider gemini \
  --embedding-model gemini-embedding-001 \
  --embedding-dimensions 768 \
  --gemini-key "$GEMINI_API_KEY"
```

Gemini supports `768`, `1536`, and `3072` dimensions. Saturday normalizes reduced
dimension vectors before writing them to Qdrant.

## What Gets Published

The npm package contains only:

- compiled CLI and library files in `dist/`
- web assets in `dist/web/`
- type declarations
- this README

Tests and source files are not included in the published package.
