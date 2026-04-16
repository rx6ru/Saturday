import { Request, Response } from 'express';
import { EmbeddingService } from '../../lib/embedding';
import { QdrantCodeIndex } from '../../lib/qdrant-client';

interface SimpleToolCall {
  id?: string;
  name?: string;
  arguments?: {
    query?: string;
  };
}

interface NestedToolCall {
  name?: string;
  toolCall?: {
    id?: string;
    parameters?: {
      query?: string;
    };
    function?: {
      name?: string;
      arguments?: string;
    };
  };
}

function hasSimpleFields(toolCall: SimpleToolCall | NestedToolCall): toolCall is SimpleToolCall {
  return 'arguments' in toolCall || 'id' in toolCall;
}

function hasNestedFields(toolCall: SimpleToolCall | NestedToolCall): toolCall is NestedToolCall {
  return 'toolCall' in toolCall;
}

interface WebhookRequest {
  message?: {
    type?: string;
    toolCallList?: Array<SimpleToolCall | NestedToolCall>;
  };
}

function getToolCallId(toolCall: SimpleToolCall | NestedToolCall): string | undefined {
  if (hasSimpleFields(toolCall) && toolCall.id) {
    return toolCall.id;
  }
  if (hasNestedFields(toolCall)) {
    return toolCall.toolCall?.id;
  }
  return undefined;
}

function getQuery(toolCall: SimpleToolCall | NestedToolCall): string | undefined {
  if (hasSimpleFields(toolCall) && toolCall.arguments?.query) {
    return toolCall.arguments.query;
  }

  if (hasNestedFields(toolCall) && toolCall.toolCall?.parameters?.query) {
    return toolCall.toolCall.parameters.query;
  }

  const rawArguments = hasNestedFields(toolCall) ? toolCall.toolCall?.function?.arguments : undefined;
  if (!rawArguments) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(rawArguments);
    return parsed.query;
  } catch {
    return undefined;
  }
}

export function createSearchHandler(qdrant: QdrantCodeIndex, embedding: EmbeddingService) {
  return async (req: Request, res: Response) => {
    try {
      const body = req.body as WebhookRequest;

      if (body.message?.type !== 'tool-calls') {
        res.json({ results: [] });
        return;
      }

      const toolCallList = body.message.toolCallList || [];
      const results: Array<{ toolCallId?: string; result: string }> = [];

      for (const toolCall of toolCallList) {
        const name = toolCall.name || (hasNestedFields(toolCall) ? toolCall.toolCall?.function?.name : undefined);
        if (name && name !== 'search_codebase') {
          continue;
        }

        const query = getQuery(toolCall);
        if (!query) {
          continue;
        }

        const embedded = await embedding.embed(query);
        const searchResults = await qdrant.search(embedded.embedding, 5);

        if (searchResults.length === 0) {
          results.push({
            toolCallId: getToolCallId(toolCall),
            result: 'No relevant code found in the indexed project.',
          });
          continue;
        }

        const lines = searchResults.map((result, index) => {
          const payload = result.payload;
          const location = payload.functionName
            ? `${payload.filePath} (${payload.functionName})`
            : `${payload.filePath} (lines ${payload.startLine}-${payload.endLine})`;
          return `[${index + 1}] ${location} (${(result.score * 100).toFixed(0)}% match)`;
        });

        results.push({
          toolCallId: getToolCallId(toolCall),
          result: `Found ${searchResults.length} relevant code sections:\n${lines.join('\n')}`,
        });
      }

      res.json({ results });
    } catch (error: any) {
      res.status(500).json({
        error: `Search failed: ${error.message}`,
        results: [],
      });
    }
  };
}
