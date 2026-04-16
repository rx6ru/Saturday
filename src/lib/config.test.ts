import * as fs from 'fs';
import * as path from 'path';
import {
  loadConfig,
  saveConfig,
  validateConfig,
  getDefaultConfig,
  Config,
} from './config';

describe('Config module (TDD)', () => {
  const tmpDir = path.join(__dirname, 'tmp_config_tests');

  beforeAll(() => {
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
  });

  afterAll(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch { /* ignore */ }
  });

  test('loadConfig reads and parses .voicecoach.config.json', () => {
    const cfgPath = path.join(tmpDir, '.voicecoach.config.json');
    const cfg: Config = {
      vapi: { publicKey: 'pub', privateKey: 'priv' },
      qdrant: { url: 'http://localhost:6333', apiKey: 'q_api', collection: 'col' },
      openai: { apiKey: 'openai-key' },
      embedding: { provider: 'openai', model: 'text-embedding-3-small', dimensions: 1536 },
      indexing: { include: ['src'], exclude: ['node_modules'], extensions: ['.ts'] },
      server: { port: 8080, host: 'localhost' },
    };
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), 'utf-8');

    const loaded = loadConfig(cfgPath);
    expect(loaded).toEqual(cfg);
  });

  test("loadConfig throws if file doesn't exist", () => {
    const missing = path.join(tmpDir, 'missing.config.json');
    expect(() => loadConfig(missing)).toThrow();
  });

  test('loadConfig throws if JSON is invalid', () => {
    const badPath = path.join(tmpDir, 'bad.config.json');
    fs.writeFileSync(badPath, '{ bad json', 'utf-8');
    expect(() => loadConfig(badPath)).toThrow();
  });

  test('loadConfig validates required fields', () => {
    const invalidPath = path.join(tmpDir, 'invalid.config.json');
    const invalidCfg = {
      vapi: { publicKey: '', privateKey: '' },
      qdrant: { url: '', apiKey: '', collection: '' },
      openai: { apiKey: '' },
    } as any;
    fs.writeFileSync(invalidPath, JSON.stringify(invalidCfg, null, 2), 'utf-8');
    expect(() => loadConfig(invalidPath)).toThrow();
  });

  test('saveConfig writes config to file', () => {
    const cfgPath = path.join(tmpDir, 'save.config.json');
    const cfg: Config = {
      vapi: { publicKey: 'pub', privateKey: 'priv' },
      qdrant: { url: 'http://example', apiKey: 'k', collection: 'c' },
      openai: { apiKey: 'openai' },
      embedding: { provider: 'openai', model: 'text-embedding-3-small', dimensions: 1536 },
      indexing: { include: ['src'], exclude: [], extensions: ['.ts'] },
      server: { port: 3000, host: 'localhost' },
    };
    saveConfig(cfgPath, cfg);
    const content = fs.readFileSync(cfgPath, 'utf-8');
    expect(JSON.parse(content)).toEqual(cfg);
  });

  test('validateConfig checks required fields', () => {
    const complete: Config = getDefaultConfig();
    complete.vapi = { publicKey: 'p', privateKey: 's' };
    complete.qdrant = { url: 'u', apiKey: 'a', collection: 'col' };
    complete.openai = { apiKey: 'oi' };
    const errors = validateConfig(complete);
    expect(errors.length).toBe(0);

    const incomplete: Config = getDefaultConfig();
    const errs = validateConfig(incomplete);
    expect(errs.length).toBeGreaterThan(0);
  });

  test('getDefaultConfig returns sensible defaults', () => {
    const def = getDefaultConfig();
    expect(def.embedding?.model).toBe('text-embedding-3-small');
    expect(def.indexing?.exclude).toContain('node_modules');
    expect(def.server?.port).toBe(3000);
  });
});
