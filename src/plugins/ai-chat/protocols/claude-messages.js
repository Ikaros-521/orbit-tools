/* AI Chat - Anthropic Claude Messages adapter: content blocks, native
   thinking, tool_use assembly and prefix-cache headers. */
const { normalizeUrl, finalizeToolArgs } = require('./shared');

/**
 * Claude Messages API Adapter (/v1/messages)
 */
const ClaudeMessagesAdapter = {
  buildRequest(opts) {
    const url = normalizeUrl(opts.baseUrl || 'https://api.anthropic.com/v1', '/messages');
    const headers = {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'prompt-caching-2024-07-31',
      ...(opts.apiKey ? { 'x-api-key': opts.apiKey } : {}),
      ...(opts.headers || {})
    };

    let systemPrompt = '';
    const messages = [];

    // Tool dialogue arrives in OpenAI-chat shape (assistant.tool_calls +
    // role:'tool' responses). Claude needs tool_use blocks on the assistant
    // turn and tool_result blocks inside a user turn; consecutive tool
    // responses merge into a single user message, as the API requires.
    for (const m of (opts.messages || [])) {
      if (m.role === 'system') {
        systemPrompt += (systemPrompt ? '\n\n' : '') + m.content;
      } else if (m.role === 'tool' && m.tool_call_id) {
        const last = messages[messages.length - 1];
        if (last && last.role === 'user' && Array.isArray(last.content) && last.content[0] && last.content[0].type === 'tool_result') {
          last.content.push({ type: 'tool_result', tool_use_id: m.tool_call_id, content: m.content || '' });
        } else {
          messages.push({
            role: 'user',
            content: [{ type: 'tool_result', tool_use_id: m.tool_call_id, content: m.content || '' }]
          });
        }
      } else if (m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
        const blocks = [];
        if (m.content) blocks.push({ type: 'text', text: m.content });
        for (const tc of m.tool_calls) {
          let inputObj = {};
          try { inputObj = JSON.parse((tc.function && tc.function.arguments) || '{}'); } catch { inputObj = {}; }
          blocks.push({ type: 'tool_use', id: tc.id, name: tc.function ? tc.function.name : '', input: inputObj });
        }
        messages.push({ role: 'assistant', content: blocks });
      } else if (Array.isArray(m.images) && m.images.length > 0) {
        const blocks = [];
        for (const img of m.images) {
          const url = typeof img === 'string' ? img : (img && img.url ? img.url : '');
          if (!url) continue;
          const dataMatch = url.match(/^data:([^;]+);base64,(.+)$/);
          if (dataMatch) {
            blocks.push({
              type: 'image',
              source: {
                type: 'base64',
                media_type: dataMatch[1],
                data: dataMatch[2]
              }
            });
          } else {
            blocks.push({
              type: 'image',
              source: { type: 'url', url }
            });
          }
        }
        if (m.content) blocks.push({ type: 'text', text: String(m.content) });
        messages.push({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: blocks.length > 0 ? blocks : (m.content || '')
        });
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

    if (systemPrompt) {
      if (opts.enablePromptCaching) {
        body.system = [
          {
            type: 'text',
            text: systemPrompt,
            cache_control: { type: 'ephemeral' }
          }
        ];
      } else {
        body.system = systemPrompt;
      }
    }
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
      // 缓存断点 2/2：工具表是仅次于 system 的大块稳定前缀（同一会话内逐字不变），
      // 末项打 ephemeral 断点让 schema 全量命中读缓存（0.1x 计价）
      if (opts.enablePromptCaching) {
        body.tools[body.tools.length - 1].cache_control = { type: 'ephemeral' };
      }
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
        const cached = data.message.usage.cache_read_input_tokens || 0;
        emit({
          type: 'usage',
          usage: {
            promptTokens: data.message.usage.input_tokens || 0,
            completionTokens: 0,
            totalTokens: data.message.usage.input_tokens || 0,
            ...(cached > 0 ? { cachedTokens: cached } : {})
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


module.exports = { ClaudeMessagesAdapter };
