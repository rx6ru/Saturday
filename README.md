# Saturday

Saturday turns any codebase into a voice-queryable knowledge base.

## Install

```bash
npm install -g saturday
```

## Requirements

- Node.js 18 or newer
- `ngrok` installed and available on `PATH`
- Vapi public and private keys
- Qdrant URL and API key
- OpenAI or Gemini API key for embeddings
- Optional Groq or Cerebras API key if you want Vapi to use those as the assistant LLM

## Quick start

From the project you want to index:

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

This creates `.saturday.config.json`, indexes the configured files into Qdrant, starts the local web server, creates a Vapi assistant, and prints the public URL.

## Model providers

Saturday has two separate model choices:

- Assistant model: the LLM Vapi uses during the voice conversation.
- Embedding model: the model Saturday uses while indexing and searching your codebase.

### Assistant LLM examples

Use OpenAI through Vapi:

```bash
saturday init \
  --assistant-model-provider openai \
  --assistant-model gpt-4o
```

Use Groq through Vapi:

```bash
saturday init \
  --assistant-model-provider groq \
  --assistant-model llama-3.3-70b-versatile \
  --assistant-provider-api-key "$GROQ_API_KEY"
```

Use Cerebras through Vapi:

```bash
saturday init \
  --assistant-model-provider cerebras \
  --assistant-model gpt-oss-120b \
  --assistant-provider-api-key "$CEREBRAS_API_KEY"
```

Use any OpenAI-compatible endpoint through Vapi custom LLM:

```bash
saturday init \
  --assistant-model-provider custom-llm \
  --assistant-model gpt-oss-120b \
  --assistant-model-url https://api.cerebras.ai/v1 \
  --assistant-provider-api-key "$CEREBRAS_API_KEY"
```

Vapi also lets you configure provider keys in the dashboard. If you already did that, you can omit `--assistant-provider-api-key`.

### Embedding examples

Use OpenAI embeddings:

```bash
saturday init \
  --embedding-provider openai \
  --embedding-model text-embedding-3-small \
  --openai-key "$OPENAI_API_KEY"
```

Use Gemini embeddings:

```bash
saturday init \
  --embedding-provider gemini \
  --embedding-model gemini-embedding-001 \
  --embedding-dimensions 768 \
  --gemini-key "$GEMINI_API_KEY"
```

Gemini supports `768`, `1536`, and `3072` output dimensions. Saturday normalizes Gemini vectors when using reduced dimensions.

## Commands

### `saturday init`

Creates `.saturday.config.json` and prepares the Qdrant collection.

### `saturday sync`

Scans the configured source folders, chunks files, embeds new or changed chunks, and updates Qdrant.

### `saturday serve`

Starts the local server, exposes `/api/search` through ngrok, creates a Vapi assistant, and serves the voice UI.
