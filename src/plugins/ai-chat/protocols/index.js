/* AI Chat - protocol adapter registry & entry points (streamCompletion /
   syncCompletion / fetchRemoteModels). Adapters live in sibling modules. */
const { SSEParser } = require('./sse-parser');
const { OpenAIChatAdapter } = require('./openai-chat');
const { OpenAIResponsesAdapter } = require('./openai-responses');
const { ClaudeMessagesAdapter } = require('./claude-messages');

const PROTOCOLS = {
  'openai-chat': OpenAIChatAdapter,
  'openai-responses': OpenAIResponsesAdapter,
  'claude-messages': ClaudeMessagesAdapter
};

function getAdapter(protocol) {
  return PROTOCOLS[protocol] || OpenAIChatAdapter;
}

/**
 * Execute unified streaming request.
 * Invokes onChunk({ type: 'content' | 'reasoning' | 'tool_calls' | 'usage' | 'done', ... })
 */
async function streamCompletion(opts, onChunk, signal) {
  const adapter = getAdapter(opts.protocol);
  const req = adapter.buildRequest({ ...opts, stream: true });

  const res = await fetch(req.url, {
    method: 'POST',
    headers: req.headers,
    body: req.body,
    signal
  });

  if (!res.ok) {
    let errText = '';
    try { errText = await res.text(); } catch {}
    throw new Error(`AI 请求失败 [${res.status}]: ${errText || res.statusText}`);
  }

  // Fresh assembly state per stream so concurrent streams never share tool-call buffers
  const state = typeof adapter.createStreamState === 'function' ? adapter.createStreamState() : undefined;
  const parser = new SSEParser(event => {
    adapter.handleStreamEvent(event, onChunk, state);
  });

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      parser.feed(decoder.decode(value, { stream: true }));
    }
    parser.finish();
  } finally {
    reader.releaseLock();
  }
}

/**
 * Execute non-streaming request (for workflow action calls or simple evaluations).
 */
async function syncCompletion(opts, signal) {
  const adapter = getAdapter(opts.protocol);
  const req = adapter.buildRequest({ ...opts, stream: false });

  const res = await fetch(req.url, {
    method: 'POST',
    headers: req.headers,
    body: req.body,
    signal
  });

  if (!res.ok) {
    let errText = '';
    try { errText = await res.text(); } catch {}
    throw new Error(`AI 请求失败 [${res.status}]: ${errText || res.statusText}`);
  }

  const json = await res.json();
  return adapter.parseSyncResponse(json);
}

/**
 * Fetches available models from provider's endpoint (GET /models or /api/tags for Ollama).
 */
async function fetchRemoteModels({ protocol, baseUrl, apiKey }, externalSignal) {
  let u = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!u) u = 'https://api.openai.com/v1';
  u = u.replace(/\/(chat\/completions|responses|messages)$/, '');

  const headers = { 'User-Agent': 'Orbit-Toolbox-AI/1.0' };
  if (apiKey) {
    if (protocol === 'claude-messages') {
      headers['x-api-key'] = apiKey;
      headers['anthropic-version'] = '2023-06-01';
    } else {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
  }

  const timeoutCtrl = new AbortController();
  const timer = setTimeout(() => timeoutCtrl.abort(), 8000);
  const onExternalAbort = () => timeoutCtrl.abort();
  if (externalSignal) {
    externalSignal.addEventListener('abort', onExternalAbort, { once: true });
  }

  let res;
  try {
    let url = `${u}/models`;
    try {
      res = await fetch(url, { headers, signal: timeoutCtrl.signal });
    } catch (err) {
      if (u.includes('11434')) {
        const ollamaBase = u.replace(/\/v1$/, '');
        res = await fetch(`${ollamaBase}/api/tags`, { signal: timeoutCtrl.signal });
      } else {
        throw err;
      }
    }

    if (!res.ok) {
      if (res.status === 404 && u.includes('11434')) {
        const ollamaBase = u.replace(/\/v1$/, '');
        const r2 = await fetch(`${ollamaBase}/api/tags`, { signal: timeoutCtrl.signal });
        if (r2.ok) {
          const json2 = await r2.json();
          const list = Array.isArray(json2.models) ? json2.models.map(m => m.name || m.model).filter(Boolean) : [];
          return Array.from(new Set(list));
        }
      }
      let errText = '';
      try { errText = await res.text(); } catch {}
      throw new Error(`获取模型失败 [${res.status}]: ${errText || res.statusText}`);
    }

    const json = await res.json();
    const list = [];
    if (Array.isArray(json.data)) {
      for (const item of json.data) {
        if (item && item.id) list.push(String(item.id));
      }
    } else if (Array.isArray(json.models)) {
      for (const item of json.models) {
        const id = item && (item.name || item.model || item.id);
        if (id) list.push(String(id));
      }
    }
    return Array.from(new Set(list)).sort();
  } finally {
    clearTimeout(timer);
    // 长寿的外部 signal 不会随本函数结束而中止，监听器需主动摘除
    if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort);
  }
}

module.exports = {
  PROTOCOLS,
  getAdapter,
  streamCompletion,
  syncCompletion,
  fetchRemoteModels,
  SSEParser
};
