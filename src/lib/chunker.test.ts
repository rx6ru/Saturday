import FileChunker, { Chunk } from './chunker';
import { createHash } from 'crypto';

describe('FileChunker - RED phase (tests to drive implementation)', () => {
  test('chunk() splits file content into overlapping chunks', () => {
    const lines = Array.from({ length: 12 }, (_, i) => `line${i + 1}`);
    const content = lines.join('\n');
    const chunker = new FileChunker(5, 2);

    const chunks = chunker.chunk(content, 'src/sample.ts');

    // Expect 4 chunks due to stride = 3 (5-2) across 12 lines
    expect(chunks.length).toBe(4);

    // First chunk lines 1-5
    expect(chunks[0].startLine).toBe(1);
    expect(chunks[0].endLine).toBe(5);
    expect(chunks[0].content).toBe(lines.slice(0, 5).join('\n'));

    // Second chunk lines 4-8
    expect(chunks[1].startLine).toBe(4);
    expect(chunks[1].endLine).toBe(8);
    expect(chunks[1].content).toBe(lines.slice(3, 8).join('\n'));

    // Third chunk lines 7-11
    expect(chunks[2].startLine).toBe(7);
    expect(chunks[2].endLine).toBe(11);
    expect(chunks[2].content).toBe(lines.slice(6, 11).join('\n'));

    // Fourth chunk lines 10-12
    expect(chunks[3].startLine).toBe(10);
    expect(chunks[3].endLine).toBe(12);
    expect(chunks[3].content).toBe(lines.slice(9, 12).join('\n'));
  });

  test('chunk() detects language from file extension', () => {
    const content = 'export function hello() { return 1; }';
    const chunker = new FileChunker();
    const chunks = chunker.chunk(content, 'demo.ts');
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].language).toBe('typescript');
  });

  test('chunk() computes SHA-256 hash of each chunk', () => {
    const lines = ['line1', 'line2', 'line3'];
    const content = lines.join('\n');
    const chunker = new FileChunker(2, 0); // 2 lines per chunk, no overlap
    const chunks = chunker.chunk(content, 'f.ts');
    expect(chunks.length).toBe(2);
    for (let i = 0; i < chunks.length; i++) {
      const expected = createHash('sha256').update(chunks[i].content).digest('hex');
      expect(chunks[i].hash).toBe(expected);
    }
  });

  test('chunk() detects function names from first line', () => {
    const content = 'export function sum(a, b) {\n  return a + b;\n}\nconsole.log(sum(1,2));';
    const chunker = new FileChunker(50, 10);
    const chunks = chunker.chunk(content, 'calc.ts');
    expect(chunks.length).toBe(1);
    expect(chunks[0].functionName).toBe('sum');
  });

  test('chunk() handles empty content', () => {
    const chunker = new FileChunker();
    const chunks = chunker.chunk('', 'empty.ts');
    expect(chunks.length).toBe(0);
  });

  test('chunk() handles single-line files', () => {
    const content = 'def greet(): pass';
    const chunker = new FileChunker(50, 10);
    const chunks = chunker.chunk(content, 'script.py');
    expect(chunks.length).toBe(1);
    expect(chunks[0].startLine).toBe(1);
    expect(chunks[0].endLine).toBe(1);
    expect(chunks[0].functionName).toBe('greet');
    expect(chunks[0].language).toBe('python');
  });

  test('chunk() skips trailing empty chunks from files ending with a newline', () => {
    const content = 'export const value = 1;\n';
    const chunker = new FileChunker(1, 0);

    const chunks = chunker.chunk(content, 'value.ts');

    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe('export const value = 1;');
  });

  test('detectFunctionName patterns for TS/JS/Python/Markdown', () => {
    const c = new FileChunker();
    // TS/JS pattern
    const tsLine = 'export function doStuff(x) {';
    expect((c as any).detectFunctionName(tsLine, 'typescript')).toBe('doStuff');
    // Python pattern
    const pyLine = 'def analyze(data):';
    expect((c as any).detectFunctionName(pyLine, 'python')).toBe('analyze');
    // Markdown heading
    const mdLine = '# MyFunction';
    expect((c as any).detectFunctionName(mdLine, 'markdown')).toBe('MyFunction');
  });
});
