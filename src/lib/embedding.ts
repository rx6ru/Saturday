import OpenAI from 'openai';
import { EmbeddingConfig, getEmbeddingDimensions } from './config';

export interface EmbeddingResult {
  embedding: number[];
  model: string;
  usage: { prompt_tokens: number; total_tokens: number };
}

export interface EmbeddingProgress {
  completed: number;
  total: number;
}

export interface EmbeddingServiceConfig extends EmbeddingConfig {
  apiKey: string;
}

type EmbeddingProvider = 'openai' | 'gemini' | 'jina';

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
    if (this.provider === 'jina') {
      return this.embedJina([text], taskType).then((embeddings) => ({
        embedding: embeddings[0],
        model: this.model,
        usage: { prompt_tokens: 0, total_tokens: 0 },
      }));
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
    onProgress?: (progress: EmbeddingProgress) => void,
  ): Promise<number[][]> {
    if (this.provider === 'gemini') {
      const embeddings: number[][] = [];
      for (const text of texts) {
        const result = await this.embedGemini(text, taskType);
        embeddings.push(result.embedding);
        onProgress?.({ completed: embeddings.length, total: texts.length });
      }
      return embeddings;
    }
    if (this.provider === 'jina') {
      const embeddings: number[][] = [];
      for (const batch of this.buildJinaBatches(texts, batchSize)) {
        embeddings.push(...(await this.embedJina(batch, taskType)));
        onProgress?.({ completed: embeddings.length, total: texts.length });
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
      onProgress?.({ completed: embeddings.length, total: texts.length });
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

  private async embedJina(texts: string[], taskType: string): Promise<number[][]> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await fetch('https://api.jina.ai/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          task: this.mapJinaTask(taskType),
          normalized: true,
          embedding_type: 'float',
          input: texts,
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        if (response.status === 429 && /RATE_TOKEN_LIMIT_EXCEEDED/.test(body) && attempt < 2) {
          await this.sleep(65000);
          continue;
        }
        throw new Error(`Jina embedding failed: ${response.status} ${body}`);
      }

      const payload: any = await response.json();
      if (!Array.isArray(payload.data)) {
        throw new Error('Jina embedding response did not include embedding data');
      }

      return payload.data
        .sort((a: { index: number }, b: { index: number }) => a.index - b.index)
        .map((item: { embedding: number[] }) => item.embedding);
    }
    throw new Error('Jina embedding failed after retries');
  }

  private mapJinaTask(taskType: string): string {
    if (this.model.startsWith('jina-code-embeddings')) {
      return taskType === 'RETRIEVAL_DOCUMENT' ? 'nl2code.passage' : 'nl2code.query';
    }

    return taskType === 'RETRIEVAL_DOCUMENT' ? 'retrieval.passage' : 'retrieval.query';
  }

  private buildJinaBatches(texts: string[], batchSize: number): string[][] {
    const maxItems = Math.min(batchSize, 12);
    const maxEstimatedTokens = 6000;
    const batches: string[][] = [];
    let currentBatch: string[] = [];
    let currentEstimatedTokens = 0;

    for (const text of texts) {
      const estimatedTokens = Math.max(1, Math.ceil(text.length / 3));
      const wouldOverflow =
        currentBatch.length >= maxItems ||
        currentEstimatedTokens + estimatedTokens > maxEstimatedTokens;

      if (currentBatch.length > 0 && wouldOverflow) {
        batches.push(currentBatch);
        currentBatch = [];
        currentEstimatedTokens = 0;
      }

      currentBatch.push(text);
      currentEstimatedTokens += estimatedTokens;
    }

    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }

    return batches;
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private normalize(vector: number[]): number[] {
    const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
    if (!norm) return vector;
    return vector.map((value) => value / norm);
  }
}
