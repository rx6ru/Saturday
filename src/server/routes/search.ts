import { Request, Response } from 'express';
import { QdrantCodeIndex } from '../../lib/qdrant-client';
import { EmbeddingService } from '../../lib/embedding';

interface ToolCall {
  name: string;
  id?: string;
  toolCall?: {
    id: string;
    parameters: { query: string };
  };
  arguments?: { query: string };
}

interface WebhookMessage {
  type: string;
  call?: { id: string; status: string };
  toolCallList?: ToolCall[];
}

interface WebhookRequest {
  message: WebhookMessage;
}

export function createSearchHandler(qdrant: QdrantCodeIndex, embedding: EmbeddingService) {
  return async (req: Request, res: Response) => {
    try {
      const body: WebhookRequest = req.body;

      if (body.message?.type !== 'tool-calls') {
        return res.json({ results: [] });
      }

      const toolCalls = body.message.toolCallList || [];
      const results: { toolCallId: string; result: string }[] = [];

      for (const toolCall of toolCalls) {
        if (toolCall.name !== 'search_codebase') continue;

        const toolCallId = toolCall.id || toolCall.toolCall?.id;
        const args = toolCall.arguments || toolCall.toolCall?.parameters;
        const query = args?.query;

        if (!query) continue;

        const { embedding: queryVector } = await embedding.embed(query);
        const searchResults = await qdrant.search(queryVector, 5);

        let resultText: string;

        if (searchResults.length === 0) {
          resultText = 'No relevant code found in the codebase.';
        } else {
          const formattedResults = searchResults.map((r, i) => {
            const p = r.payload;
            const location = p.functionName
              ? `${p.filePath} (${p.functionName})`
              : `${p.filePath} (lines ${p.startLine}-${p.endLine})`;
            return `[${i + 1}] ${location} (${(r.score * 100).toFixed(0)}% relevant)`;
          });
          resultText = `Found ${searchResults.length} relevant code section(s):\n\n${formattedResults.join('\n')}`;
        }

        results.push({ toolCallId: toolCallId || '', result: resultText });
      }

      res.json({ results });
    } catch (error: any) {
      console.error('Search handler error:', error);
      res.status(500).json({ error: 'Search failed: ' + error.message, results: [] });
    }
  };
}
