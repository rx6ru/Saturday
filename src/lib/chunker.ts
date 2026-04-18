import * as path from 'path';
import { createHash } from 'crypto';

export interface Chunk {
  id: string;
  filePath: string;
  content: string;
  hash: string;
  language: string;
  functionName?: string;
  startLine: number; // 1-based
  endLine: number;   // inclusive
}

export class FileChunker {
  private chunkSize: number;
  private overlap: number;

  constructor(chunkSize: number = 50, overlap: number = 10) {
    this.chunkSize = chunkSize;
    this.overlap = overlap;
  }

  chunk(content: string, filePath: string): Chunk[] {
    const language = this.getLanguageFromPath(filePath);
    const trimmed = content ?? '';
    if (trimmed.trim().length === 0) {
      return [];
    }

    const lines = trimmed.split(/\r?\n/);
    const chunks: Chunk[] = [];
    const stride = Math.max(1, this.chunkSize - this.overlap);
    for (let start = 0; start < lines.length; start += stride) {
      const end = Math.min(start + this.chunkSize, lines.length);
      const chunkLines = lines.slice(start, end);
      const contentBlock = chunkLines.join('\n');
      if (contentBlock.trim().length === 0) {
        continue;
      }
      const hash = this.sha256(contentBlock);
      const firstLine = chunkLines[0] ?? '';
      const funcName = this.detectFunctionName(firstLine, language) ?? undefined;
      chunks.push({
        id: `${filePath}:${start + 1}-${end}`,
        filePath,
        content: contentBlock,
        hash,
        language,
        functionName: funcName,
        startLine: start + 1,
        endLine: end,
      });
    }
    return chunks;
  }

  // Private helpers
  private detectFunctionName(line: string, language: string): string | undefined {
    const s = line.trim();
    if (!s) return undefined;

    switch (language) {
      case 'markdown': {
        // Look for a top-level heading: '# Title' or '## Title'
        const m = s.match(/^#+\s+(.+)/);
        if (m) return m[1].trim();
        return undefined;
      }
      case 'typescript':
      case 'javascript': {
        const patterns = [
          /export\s+function\s+([A-Za-z_$][\w$]*)\s*\(/,
          /function\s+([A-Za-z_$][\w$]*)\s*\(/,
          /export\s+const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?\(/,
          /const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?\(/,
        ];
        for (const pat of patterns) {
          const m = s.match(pat);
          if (m && m[1]) return m[1];
        }
        return undefined;
      }
      case 'python': {
        const m = s.match(/^def\s+([A-Za-z_][\w_]*)\s*\(/);
        if (m) return m[1];
        return undefined;
      }
      default:
        return undefined;
    }
  }

  private getLanguageFromPath(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
      case '.ts':
      case '.tsx':
        return 'typescript';
      case '.js':
      case '.jsx':
        return 'javascript';
      case '.py':
        return 'python';
      case '.md':
        return 'markdown';
      default:
        return 'unknown';
    }
  }

  private getLanguage(ext: string): string {
    switch (ext) {
      case '.ts':
      case '.tsx':
        return 'typescript';
      case '.js':
      case '.jsx':
        return 'javascript';
      case '.py':
        return 'python';
      case '.md':
        return 'markdown';
      default:
        return 'unknown';
    }
  }

  private sha256(data: string): string {
    return createHash('sha256').update(data).digest('hex');
  }
}

export default FileChunker;
