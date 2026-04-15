import OpenAI from 'openai';

export interface EmbeddingResult {
  embedding: number[];
  model: string;
  usage: { prompt_tokens: number; total_tokens: number };
}

export class EmbeddingService {
  private openai: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string = 'text-embedding-3-small') {
    this.openai = new OpenAI({ apiKey });
    this.model = model;
  }

  async embed(text: string): Promise<EmbeddingResult> {
    const response = await this.openai.embeddings.create({
      model: this.model,
      input: text
    });

    const data = response.data[0];
    return {
      embedding: data.embedding,
      model: response.model,
      usage: {
        prompt_tokens: response.usage.prompt_tokens,
        total_tokens: response.usage.total_tokens
      }
    };
  }

  async embedBatch(texts: string[], batchSize: number = 100): Promise<number[][]> {
    const embeddings: number[][] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const response = await this.openai.embeddings.create({
        model: this.model,
        input: batch
      });

      embeddings.push(
        ...response.data.sort((a: { index: number }, b: { index: number }) => a.index - b.index).map((d: { embedding: number[] }) => d.embedding)
      );
    }

    return embeddings;
  }

  getDimensions(): number {
    const dimensions: Record<string, number> = {
      'text-embedding-3-small': 1536,
      'text-embedding-3-large': 3072,
      'text-embedding-ada-002': 1536
    };
    return dimensions[this.model] || 1536;
  }
}
