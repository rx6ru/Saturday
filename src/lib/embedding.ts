import OpenAI from 'openai';
import { EmbeddingConfig, getEmbeddingDimensions } from './config';

export interface EmbeddingResult {
  embedding: number[];
  model: string;
  usage: { prompt_tokens: number; total_tokens: number };
}

export interface EmbeddingServiceConfig extends EmbeddingConfig {
  apiKey: string;
}

type EmbeddingProvider = 'openai' | 'gemini';

export class EmbeddingService {
  private apiKey: string;
  private provider: EmbeddingProvider;
  private model: string;
  private dimensions: number;
  private openai?: OpenAI;

  constructor(apiKeyOrConfig: string | EmbeddingServiceConfig, model: string = 'text-embedding-3-small') {
    if (typeof apiKeyOrConfig === 'string') {
      this.apiKey = apiKeyOrConfig;
      this.provider = 'openai';
      this.model = model;
      this.dimensions = getEmbeddingDimensions('openai', model);
    } else {
      this.apiKey = apiKeyOrConfig.apiKey;
      this.provider = apiKeyOrConfig.provider as EmbeddingProvider;
      this.model = apiKeyOrConfig.model;
      this.dimensions = apiKeyOrConfig.dimensions;
    }

    if (this.provider === 'openai') {
      this.openai = new OpenAI({ apiKey: this.apiKey });
    }
  }

  async embed(text: string, taskType: string = 'RETRIEVAL_QUERY'): Promise<EmbeddingResult> {
    if (this.provider === 'gemini') {
      return this.embedGemini(text, taskType);
    }

    const response = await this.openai!.embeddings.create({
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

  async embedBatch(
    texts: string[],
    batchSize: number = 100,
    taskType: string = 'RETRIEVAL_DOCUMENT',
  ): Promise<number[][]> {
    if (this.provider === 'gemini') {
      const embeddings: number[][] = [];
      for (const text of texts) {
        const result = await this.embedGemini(text, taskType);
        embeddings.push(result.embedding);
      }
      return embeddings;
    }

    const embeddings: number[][] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const response = await this.openai!.embeddings.create({
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
    return this.dimensions;
  }

  private async embedGemini(text: string, taskType: string): Promise<EmbeddingResult> {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:embedContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': this.apiKey,
        },
        body: JSON.stringify({
          content: {
            parts: [{ text }],
          },
          taskType,
          output_dimensionality: this.dimensions,
        }),
      },
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Gemini embedding failed: ${response.status} ${body}`);
    }

    const payload: any = await response.json();
    const rawEmbedding = payload.embedding?.values || payload.embeddings?.[0]?.values;
    if (!Array.isArray(rawEmbedding)) {
      throw new Error('Gemini embedding response did not include embedding values');
    }

    const embedding = this.dimensions === 3072 ? rawEmbedding : this.normalize(rawEmbedding);
    return {
      embedding,
      model: this.model,
      usage: {
        prompt_tokens: 0,
        total_tokens: 0,
      },
    };
  }

  private normalize(vector: number[]): number[] {
    const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
    if (!norm) return vector;
    return vector.map((value) => value / norm);
  }
}
