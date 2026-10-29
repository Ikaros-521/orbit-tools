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
          promptTokens: data.usage.input_tokens || data.usage.prompt_tokens || 0,
          completionTokens: data.usage.output_tokens || data.usage.completion_tokens || 0,
          totalTokens: data.usage.total_tokens || 0
        }
      });
    }

    // Responses API event structure
    if (data.delta && data.delta.text) {
      emit({ type: 'content', delta: data.delta.text });
    } else if (data.delta && data.delta.reasoning) {
      emit({ type: 'reasoning', delta: data.delta.reasoning });
    } else if (data.response && data.response.output_item) {
      const item = data.response.output_item;
      if (item.content) emit({ type: 'content', delta: item.content });
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

    // Anthropic Native Thinking (CoT)
    if (opts.enableReasoning) {
      body.thinking = {
        type: 'enabled',
        budget_tokens: Math.max(1024, Number(opts.thinkingBudget) || 2048)
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

  handleStreamEvent(event, emit) {
    const data = event.data;
    if (!data) return;

    if (data.type === 'message_start' && data.message && data.message.usage) {
      emit({
        type: 'usage',
        usage: {
          promptTokens: data.message.usage.input_tokens || 0,
          completionTokens: 0,
          totalTokens: data.message.usage.input_tokens || 0
        }
      });
    }

    if (data.type === 'content_block_delta' && data.delta) {
      if (data.delta.type === 'thinking_delta') {
        emit({ type: 'reasoning', delta: data.delta.thinking });
      } else if (data.delta.type === 'text_delta') {
        emit({ type: 'content', delta: data.delta.text });
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

  const parser = new SSEParser(event => {
    adapter.handleStreamEvent(event, onChunk);
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

module.exports = {
  PROTOCOLS,
  getAdapter,
  streamCompletion,
  syncCompletion,
  SSEParser
};
