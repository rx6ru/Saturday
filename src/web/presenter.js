const root = typeof window !== 'undefined' ? window : globalThis;

function extractSourcesFromText(text) {
  const filePattern = /(?:^|[^\w])([\w/-]+\.(?:ts|js|tsx|jsx|py))/gi;
  const matches = text.match(filePattern) || [];
  const seen = new Set();
  const sources = [];

  for (const match of matches) {
    const file = match.trim();
    if (seen.has(file)) continue;
    seen.add(file);
    sources.push({ file });
  }

  return sources;
}

function formatSyncStatus(stats) {
  if (!stats || typeof stats.pointCount !== 'number') {
    return 'No sync data';
  }
  return `${stats.pointCount} chunks indexed`;
}

function formatAssistantLabel(provider, model) {
  if (!provider || !model) {
    return 'Assistant not configured';
  }
  return `${provider} / ${model}`;
}

const presenter = {
  extractSourcesFromText,
  formatSyncStatus,
  formatAssistantLabel,
};

root.SaturdayPresenter = presenter;

if (typeof module !== 'undefined') {
  module.exports = presenter;
}
