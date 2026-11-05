/* AI Chat protocol adapters - shared helpers (URL normalization & tool-arg
   finalization used by every adapter). */
function normalizeUrl(baseUrl, defaultEndpoint) {
  let u = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!u) u = 'https://api.openai.com/v1';
  if (u.endsWith('/chat/completions') || u.endsWith('/responses') || u.endsWith('/messages')) {
    return u;
  }
  return `${u}${defaultEndpoint}`;
}

/**
 * Normalizes accumulated streaming tool-call arguments into a valid JSON string.
 * Empty or unparseable JSON degrades to '{}' instead of throwing.
 */
function finalizeToolArgs(rawArgs) {
  if (typeof rawArgs === 'string' && rawArgs.length > 0) {
    try {
      JSON.parse(rawArgs);
      return rawArgs; // valid JSON — keep the model's exact arguments string
    } catch { /* fall through to '{}' */ }
  }
  return '{}';
}

module.exports = { normalizeUrl, finalizeToolArgs };
