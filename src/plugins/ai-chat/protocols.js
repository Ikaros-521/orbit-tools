/* Protocol Adapters for AI Models:
   - OpenAI Chat Completions (/v1/chat/completions)
   - OpenAI Responses API (/v1/responses)
   - Anthropic Claude Messages (/v1/messages)
   Zero external dependencies, built on native fetch & SSE stream parsing. */

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

/**
 * Parses raw SSE text chunks into parsed data events.
 * Handles multiline buffers, "data: [DONE]", and "event: xxx".
 */
class SSEParser {
  constructor(onEvent) {
    this.onEvent = onEvent;
    this.buffer = '';
  }

  feed(chunkText) {
    this.buffer += chunkText;
    const lines = this.buffer.split(/\r?\n/);
    // keep incomplete tail in buffer
    this.buffer = lines.pop() || '';

    let currentEvent = null;
    let currentData = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        if (currentData.length > 0) {
          const rawData = currentData.join('\n');
          if (rawData === '[DONE]') {
            this.onEvent({ type: 'done' });
          } else {
            try {
              const parsed = JSON.parse(rawData);
              this.onEvent({ type: currentEvent || 'message', data: parsed });
            } catch {
              this.onEvent({ type: currentEvent || 'message', raw: rawData });
            }
          }
          currentData = [];
          currentEvent = null;
        }
        continue;
      }

      if (line.startsWith('event:')) {
        currentEvent = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        currentData.push(line.slice(5).trim());
      }
    }
  }

  finish() {
    if (this.buffer.trim().startsWith('data:')) {
      const raw = this.buffer.trim().slice(5).trim();
      if (raw === '[DONE]') {
        this.onEvent({ type: 'done' });
      } else {
        try { this.onEvent({ type: 'message', data: JSON.parse(raw) }); } catch {}
      }
    }
  }
}

/**
 * OpenAI Chat Completions Adapter
 */
const OpenAIChatAdapter = {
  buildRequest(opts) {
    const url = normalizeUrl(opts.baseUrl, '/chat/completions');
    const headers = {
      'Content-Type': 'application/json',
      ...(opts.apiKey ? { 'Authorization': `Bearer ${opts.apiKey}` } : {}),
      ...(opts.headers || {})
    };

    const messages = (opts.messages || []).map(m => {
      const msg = { role: m.role || 'user', content: m.content || '' };
      if (m.name) msg.name = m.name;
      if (m.tool_call_id) msg.tool_call_id = m.tool_call_id;
      if (m.tool_calls) msg.tool_calls = m.tool_calls;
      return msg;
    });

    const body = {
      model: opts.model || 'gpt-4o-mini',
      messages,
      temperature: typeof opts.temperature === 'number' ? opts.temperature : 0.7,
      stream: opts.stream !== false
    };

    if (opts.stream !== false) {
      body.stream_options = { include_usage: true };
    }
    if (opts.maxTokens) body.max_tokens = Number(opts.maxTokens);
    if (Array.isArray(opts.tools) && opts.tools.length > 0) {
      body.tools = opts.tools;
      body.tool_choice = 'auto';
    }
    // Thinking level (o-series / GPT-5 style): 'low' | 'medium' | 'high'
    if (opts.enableReasoning && ['low', 'medium', 'high'].includes(opts.thinkingLevel)) {
      body.reasoning_effort = opts.thinkingLevel;
    }

    return { url, headers, body: JSON.stringify(body) };
  },

  handleStreamEvent(event, emit) {
    if (event.type === 'done') {
      emit({ type: 'done' });
      return;
    }
    const data = event.data;
    if (!data) return;

    if (data.usage) {
      emit({
        type: 'usage',
        usage: {
          promptTokens: data.usage.prompt_tokens || 0,
          completionTokens: data.usage.completion_tokens || 0,
          totalTokens: data.usage.total_tokens || 0
        }
      });
    }

    const choice = data.choices && data.choices[0];
    if (!choice || !choice.delta) return;
    const delta = choice.delta;

    // DeepSeek / Qwen reasoning content (CoT)
    if (delta.reasoning_content) {
      emit({ type: 'reasoning', delta: delta.reasoning_content });
    }
    // DeepSeek / Ollama <think> tags in regular content
    if (delta.content) {
      emit({ type: 'content', delta: delta.content });
    }
    // Tool calls
    if (Array.isArray(delta.tool_calls)) {
      emit({ type: 'tool_calls', delta: delta.tool_calls });
    }
  },

  parseSyncResponse(data) {
    const choice = data && data.choices && data.choices[0];
    const msg = choice ? choice.message : {};
    return {
      content: msg.content || '',
      reasoning: msg.reasoning_content || '',
      toolCalls: msg.tool_calls || null,
      usage: data && data.usage ? {
        promptTokens: data.usage.prompt_tokens || 0,
        completionTokens: data.usage.completion_tokens || 0,
        totalTokens: data.usage.total_tokens || 0
      } : null
    };
  }
};

/**
 * OpenAI Responses API Adapter (/v1/responses)
 */
const OpenAIResponsesAdapter = {
  buildRequest(opts) {
    const url = normalizeUrl(opts.baseUrl, '/responses');
    const headers = {
      'Content-Type': 'application/json',
      ...(opts.apiKey ? { 'Authorization': `Bearer ${opts.apiKey}` } : {}),
      ...(opts.headers || {})
    };

    // Convert messages to Responses API input format
    const input = (opts.messages || []).map(m => ({
      role: m.role || 'user',
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
    }));

    const body = {
      model: opts.model || 'gpt-4o',
      input,
      stream: opts.stream !== false
    };

    if (typeof opts.temperature === 'number') body.temperature = opts.temperature;
    if (Array.isArray(opts.tools) && opts.tools.length > 0) {
      body.tools = opts.tools;
    }
    // Thinking level for reasoning models
    if (opts.enableReasoning && ['low', 'medium', 'high'].includes(opts.thinkingLevel)) {
      body.reasoning = { effort: opts.thinkingLevel };
    }

    return { url, headers, body: JSON.stringify(body) };
  },

  // Per-stream assembly state for function_call items (one streamCompletion call = one state)
  createStreamState() {
    return { byItem: new Map(), byOutput: new Map(), finalizedTools: [] };
  },

  _lookupToolEntry(st, data) {
    const itemId = data.item_id || (data.item && data.item.id);
    if (itemId && st.byItem.has(itemId)) return st.byItem.get(itemId);
    if (typeof data.output_index === 'number' && st.byOutput.has(data.output_index)) {
      return st.byOutput.get(data.output_index);
    }
    return null;
  },

  // Finalize a function_call entry and emit it in the same delta shape as openai-chat,
  // so backend.js assembles it identically ({type:'tool_calls', delta:[{index,id,function:{name,arguments}}]}).
  _emitFinalizedTool(entry, st, emit) {
    entry.arguments = finalizeToolArgs(entry.args);
    const idx = st.finalizedTools.length;
    st.finalizedTools.push(entry);
    emit({
      type: 'tool_calls',
      delta: [{ index: idx, id: entry.id, type: 'function', function: { name: entry.name, arguments: entry.arguments } }]
    });
  },

  handleStreamEvent(event, emit, state) {
    if (event.type === 'done') {
      emit({ type: 'done' });
      return;
    }
    const data = event.data;
    if (!data) return;

    const st = state || this._defaultStreamState || (this._defaultStreamState = this.createStreamState());
    const type = data.type || '';

    // New stream starts — reset any leftover assembly state
    if (type === 'response.created') {
      st.byItem.clear();
      st.byOutput.clear();
      st.finalizedTools.length = 0;
    }

    // Usage: real streams carry it in response.completed (data.response.usage);
    // keep the direct data.usage form for compatibility with non-typed payloads.
    const usageSrc = (data.response && data.response.usage) || data.usage;
    if (usageSrc) {
      const promptTokens = usageSrc.input_tokens || usageSrc.prompt_tokens || 0;
      const completionTokens = usageSrc.output_tokens || usageSrc.completion_tokens || 0;
      emit({
        type: 'usage',
        usage: {
          promptTokens,
          completionTokens,
          totalTokens: usageSrc.total_tokens || (promptTokens + completionTokens)
        }
      });
    }

    // Text deltas — delta is a plain string in real Responses streams
    if (type === 'response.output_text.delta') {
      const text = typeof data.delta === 'string' ? data.delta : (data.delta && data.delta.text);
      if (text) emit({ type: 'content', delta: text });
      return;
    }

    // Function call assembly
    if (type === 'response.output_item.added' && data.item && data.item.type === 'function_call') {
      const entry = {
        id: data.item.call_id || data.item.id || `call_${st.finalizedTools.length}`,
        name: data.item.name || '',
        args: typeof data.item.arguments === 'string' ? data.item.arguments : ''
      };
      if (data.item.id) st.byItem.set(data.item.id, entry);
      if (typeof data.output_index === 'number') st.byOutput.set(data.output_index, entry);
      return;
    }

    if (type === 'response.function_call_arguments.delta' || type === 'response.function_call_arguments_delta') {
      const entry = this._lookupToolEntry(st, data);
      if (entry && typeof data.delta === 'string') entry.args += data.delta;
      return;
    }

    if (type === 'response.function_call_arguments.done') {
      const entry = this._lookupToolEntry(st, data);
      if (entry && typeof data.arguments === 'string' && data.arguments) entry.args = data.arguments;
      return;
    }

    if (type === 'response.output_item.done' && data.item && data.item.type === 'function_call') {
      let entry = this._lookupToolEntry(st, data);
      if (!entry) {
        // added event was never seen — synthesize the entry from the completed item
        entry = {
          id: data.item.call_id || data.item.id || `call_${st.finalizedTools.length}`,
          name: data.item.name || '',
          args: ''
        };
      }
      if (typeof data.item.arguments === 'string' && data.item.arguments) entry.args = data.item.arguments;
      if (data.item.id) st.byItem.delete(data.item.id);
      if (typeof data.output_index === 'number') st.byOutput.delete(data.output_index);
      this._emitFinalizedTool(entry, st, emit);
      return;
    }

    // Terminal events: flush any function calls that never received output_item.done
    if (type === 'response.completed' || type === 'response.incomplete' || type === 'response.failed') {
      const pending = new Set([...st.byItem.values(), ...st.byOutput.values()]);
      if (pending.size > 0) {
        st.byItem.clear();
        st.byOutput.clear();
        for (const entry of pending) {
          this._emitFinalizedTool(entry, st, emit);
        }
      }
      return;
    }

    // Legacy / untyped payload compat (providers that omit event type fields)
    if (!type) {
      if (typeof data.delta === 'string') {
        emit({ type: 'content', delta: data.delta });
      } else if (data.delta && data.delta.text) {
        emit({ type: 'content', delta: data.delta.text });
      } else if (data.delta && data.delta.reasoning) {
        emit({ type: 'reasoning', delta: data.delta.reasoning });
      } else if (data.response && data.response.output_item) {
        const item = data.response.output_item;
        if (item.content) emit({ type: 'content', delta: item.content });
      }
    }
  },

  parseSyncResponse(data) {
    let content = '';
    let reasoning = '';
    if (data && data.output) {
      if (typeof data.output === 'string') content = data.output;
      else if (Array.isArray(data.output)) {
        content = data.output.map(o => o.text || o.content || '').join('');
      }
    }
    return {
      content,
      reasoning,
      toolCalls: data && data.tool_calls ? data.tool_calls : null,
      usage: data && data.usage ? {
        promptTokens: data.usage.input_tokens || 0,
        completionTokens: data.usage.output_tokens || 0,
        totalTokens: (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0)
      } : null
    };
  }
};

/**
 * Claude Messages API Adapter (/v1/messages)
 */
const ClaudeMessagesAdapter = {
  buildRequest(opts) {
    const url = normalizeUrl(opts.baseUrl || 'https://api.anthropic.com/v1', '/messages');
    const headers = {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      ...(opts.apiKey ? { 'x-api-key': opts.apiKey } : {}),
      ...(opts.headers || {})
    };

    let systemPrompt = '';
    const messages = [];

    for (const m of (opts.messages || [])) {
      if (m.role === 'system') {
        systemPrompt += (systemPrompt ? '\n\n' : '') + m.content;
      } else {
        messages.push({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content || ''
        });
      }
    }

    const body = {
      model: opts.model || 'claude-3-7-sonnet-20250219',
      messages: messages.length ? messages : [{ role: 'user', content: 'Hello' }],
      max_tokens: opts.maxTokens || 4096,
      stream: opts.stream !== false
    };

    if (systemPrompt) body.system = systemPrompt;
    if (typeof opts.temperature === 'number' && !opts.enableReasoning) {
      body.temperature = opts.temperature;
    }

    // Anthropic Native Thinking (CoT) — thinking level maps to a token budget:
    // low ≈ 2048, medium ≈ 8192, high ≈ 16384; 'auto' keeps the legacy thinkingBudget config.
    if (opts.enableReasoning) {
      const levelBudgets = { low: 2048, medium: 8192, high: 16384 };
      const budget = Math.max(1024, levelBudgets[opts.thinkingLevel] || Number(opts.thinkingBudget) || 2048);
      body.thinking = {
        type: 'enabled',
        budget_tokens: budget
      };
      // Claude requires max_tokens > budget_tokens
      if (body.max_tokens <= body.thinking.budget_tokens) {
        body.max_tokens = body.thinking.budget_tokens + 2048;
      }
    }

    if (Array.isArray(opts.tools) && opts.tools.length > 0) {
      body.tools = opts.tools.map(t => ({
        name: t.function ? t.function.name : t.name,
        description: t.function ? t.function.description : t.description,
        input_schema: t.function ? t.function.parameters : (t.parameters || {})
      }));
    }

    return { url, headers, body: JSON.stringify(body) };
  },

  // Per-stream assembly state for tool_use blocks (one streamCompletion call = one state)
  createStreamState() {
    return { pendingTools: new Map(), finalizedTools: [] };
  },

  handleStreamEvent(event, emit, state) {
    const st = state || this._defaultStreamState || (this._defaultStreamState = this.createStreamState());
    const data = event.data;
    if (!data) return;

    if (data.type === 'message_start') {
      // New stream starts — reset any leftover assembly state
      st.pendingTools.clear();
      st.finalizedTools.length = 0;
      if (data.message && data.message.usage) {
        emit({
          type: 'usage',
          usage: {
            promptTokens: data.message.usage.input_tokens || 0,
            completionTokens: 0,
            totalTokens: data.message.usage.input_tokens || 0
          }
        });
      }
    }

    if (data.type === 'content_block_start' && data.content_block && data.content_block.type === 'tool_use') {
      st.pendingTools.set(data.index, {
        id: data.content_block.id || `toolu_${st.finalizedTools.length}`,
        name: data.content_block.name || '',
        args: ''
      });
    }

    if (data.type === 'content_block_delta' && data.delta) {
      if (data.delta.type === 'thinking_delta') {
        emit({ type: 'reasoning', delta: data.delta.thinking });
      } else if (data.delta.type === 'text_delta') {
        emit({ type: 'content', delta: data.delta.text });
      } else if (data.delta.type === 'input_json_delta') {
        const entry = st.pendingTools.get(data.index);
        if (entry && data.delta.partial_json) entry.args += data.delta.partial_json;
      }
    }

    if (data.type === 'content_block_stop') {
      const entry = st.pendingTools.get(data.index);
      if (entry) {
        st.pendingTools.delete(data.index);
        // Emit in the same delta shape as openai-chat so backend.js assembles it identically:
        // {type:'tool_calls', delta:[{index, id, type:'function', function:{name, arguments}}]}
        entry.arguments = finalizeToolArgs(entry.args);
        const idx = st.finalizedTools.length;
        st.finalizedTools.push(entry);
        emit({
          type: 'tool_calls',
          delta: [{ index: idx, id: entry.id, type: 'function', function: { name: entry.name, arguments: entry.arguments } }]
        });
      }
    }

    if (data.type === 'message_delta' && data.usage) {
      emit({
        type: 'usage_delta',
        usage: {
          completionTokens: data.usage.output_tokens || 0
        }
      });
    }

    if (data.type === 'message_stop') {
      // Flush any tool_use blocks that never received content_block_stop
      if (st.pendingTools.size > 0) {
        const deltas = [];
        for (const entry of st.pendingTools.values()) {
          entry.arguments = finalizeToolArgs(entry.args);
          deltas.push({
            index: st.finalizedTools.length,
            id: entry.id,
            type: 'function',
            function: { name: entry.name, arguments: entry.arguments }
          });
          st.finalizedTools.push(entry);
        }
        st.pendingTools.clear();
        emit({ type: 'tool_calls', delta: deltas });
      }
      emit({ type: 'done' });
    }
  },

  parseSyncResponse(data) {
    let content = '';
    let reasoning = '';
    const toolCalls = [];

    if (data && Array.isArray(data.content)) {
      for (const block of data.content) {
        if (block.type === 'text') content += block.text;
        else if (block.type === 'thinking') reasoning += block.thinking;
        else if (block.type === 'tool_use') {
          toolCalls.push({
            id: block.id,
            type: 'function',
            function: { name: block.name, arguments: JSON.stringify(block.input) }
          });
        }
      }
    }

    return {
      content,
      reasoning,
      toolCalls: toolCalls.length ? toolCalls : null,
      usage: data && data.usage ? {
        promptTokens: data.usage.input_tokens || 0,
        completionTokens: data.usage.output_tokens || 0,
        totalTokens: (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0)
      } : null
    };
  }
};

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
  if (externalSignal) {
    externalSignal.addEventListener('abort', () => timeoutCtrl.abort(), { once: true });
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
