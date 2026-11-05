/* AI Chat - OpenAI Chat Completions adapter. */
const { normalizeUrl, finalizeToolArgs } = require('./shared');

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
      let content = m.content || '';
      if (Array.isArray(m.images) && m.images.length > 0) {
        const parts = [];
        if (m.content) parts.push({ type: 'text', text: String(m.content) });
        for (const img of m.images) {
          const url = typeof img === 'string' ? img : (img && img.url ? img.url : '');
          if (url) parts.push({ type: 'image_url', image_url: { url } });
        }
        content = parts;
      } else if (Array.isArray(m.content)) {
        content = m.content;
      }
      const msg = { role: m.role || 'user', content };
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
      const cached = (data.usage.prompt_tokens_details && data.usage.prompt_tokens_details.cached_tokens) ||
                     data.usage.prompt_cache_hit_tokens || 0;
      emit({
        type: 'usage',
        usage: {
          promptTokens: data.usage.prompt_tokens || 0,
          completionTokens: data.usage.completion_tokens || 0,
          totalTokens: data.usage.total_tokens || 0,
          ...(cached > 0 ? { ...(cached > 0 ? { cachedTokens: cached } : {}) } : {})
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
        totalTokens: data.usage.total_tokens || 0,
        cachedTokens: (data.usage.prompt_tokens_details && data.usage.prompt_tokens_details.cached_tokens) || data.usage.prompt_cache_hit_tokens || 0
      } : null
    };
  }
};


module.exports = { OpenAIChatAdapter };
