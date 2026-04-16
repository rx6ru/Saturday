const { extractSourcesFromText, formatSyncStatus, formatAssistantLabel } = require('./presenter.js');

describe('web presenter helpers', () => {
  test('extractSourcesFromText returns unique file references', () => {
    expect(
      extractSourcesFromText(
        'See src/auth/login.ts and src/auth/login.ts plus src/server/index.ts for details.',
      ),
    ).toEqual([
      { file: 'src/auth/login.ts' },
      { file: 'src/server/index.ts' },
    ]);
  });

  test('formatSyncStatus renders indexed chunk counts', () => {
    expect(formatSyncStatus({ pointCount: 42, status: 'green' })).toBe('42 chunks indexed');
    expect(formatSyncStatus({})).toBe('No sync data');
  });

  test('formatAssistantLabel renders provider and model', () => {
    expect(formatAssistantLabel('groq', 'llama-3.3-70b-versatile')).toBe('groq / llama-3.3-70b-versatile');
    expect(formatAssistantLabel('', '')).toBe('Assistant not configured');
  });
});
