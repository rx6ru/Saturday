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
- OpenAI API key for embeddings

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

## Commands

### `saturday init`

Creates `.saturday.config.json` and prepares the Qdrant collection.

### `saturday sync`

Scans the configured source folders, chunks files, embeds new or changed chunks, and updates Qdrant.

### `saturday serve`

Starts the local server, exposes `/api/search` through ngrok, creates a Vapi assistant, and serves the voice UI.
