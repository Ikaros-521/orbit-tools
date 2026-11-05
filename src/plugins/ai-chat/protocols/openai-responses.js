/* AI Chat - OpenAI Responses API adapter: input items use function_call /
   function_call_output shapes and tools use the FLAT schema (converted from
   the chat-nested form used everywhere else in the agent). */
const { normalizeUrl, finalizeToolArgs } = require('./shared');

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

    // Convert messages to Responses API input items. Tool dialogue (assistant
    // tool_calls + role:'tool' responses, OpenAI-chat shape) maps to typed
    // items (function_call / function_call_output) — without this the agent
    // loop's follow-up rounds would silently drop all tool context.
    const input = [];
    for (const m of (opts.messages || [])) {
      const contentText = typeof m.content === 'string' ? m.content : (m.content ? JSON.stringify(m.content) : '');
      if (m.role === 'tool' && m.tool_call_id) {
        input.push({ type: 'function_call_output', call_id: m.tool_call_id, output: contentText || '' });
      } else if (m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
        if (contentText) input.push({ role: 'assistant', content: contentText });
        for (const tc of m.tool_calls) {
          input.push({
            type: 'function_call',
            call_id: tc.id,
            name: tc.function ? tc.function.name : '',
            arguments: (tc.function && tc.function.arguments) || '{}'
          });
        }
      } else if (Array.isArray(m.images) && m.images.length > 0) {
        const contentParts = [];
        if (m.content) contentParts.push({ type: 'input_text', text: String(m.content) });
        for (const img of m.images) {
          const url = typeof img === 'string' ? img : (img && img.url ? img.url : '');
          if (url) contentParts.push({ type: 'input_image', image_url: url });
        }
        input.push({ role: m.role || 'user', content: contentParts });
      } else {
        input.push({ role: m.role || 'user', content: contentText });
      }
    }

    const body = {
      model: opts.model || 'gpt-4o',
      input,
      stream: opts.stream !== false
    };

    if (typeof opts.temperature === 'number') body.temperature = opts.temperature;
    if (Array.isArray(opts.tools) && opts.tools.length > 0) {
      // Tool definitions arrive in OpenAI-chat nested shape ({type:'function',
      // function:{...}}); the Responses API requires the flat shape — without
      // this mapping the API rejects every agent request with a 400.
      body.tools = opts.tools
        .filter(t => t && t.type === 'function' && t.function)
        .map(t => ({
          type: 'function',
          name: t.function.name,
          description: t.function.description,
          parameters: t.function.parameters
        }));
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
      const cached = (usageSrc.input_token_details && usageSrc.input_token_details.cached_tokens) ||
                     (usageSrc.prompt_tokens_details && usageSrc.prompt_tokens_details.cached_tokens) ||
                     usageSrc.prompt_cache_hit_tokens || 0;
      emit({
        type: 'usage',
        usage: {
          promptTokens,
          completionTokens,
          totalTokens: usageSrc.total_tokens || (promptTokens + completionTokens),
          ...(cached > 0 ? { cachedTokens: cached } : {})
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
    let toolCalls = null;
    if (data && data.output) {
      if (typeof data.output === 'string') content = data.output;
      else if (Array.isArray(data.output)) {
        const textParts = [];
        const calls = [];
        for (const o of data.output) {
          if (!o) continue;
          if (o.type === 'function_call') {
            // Restore typed items to the OpenAI-chat tool_calls shape the agent
            // loop consumes, mirroring buildRequest's outgoing mapping.
            calls.push({
              id: o.call_id || o.id || `call_${calls.length}`,
              type: 'function',
              function: { name: o.name || '', arguments: o.arguments || '{}' }
            });
          } else if (o.type === 'reasoning' && o.summary) {
            reasoning += o.summary.map(s => (s && s.text) || '').join('');
          } else if (o.text || o.content) {
            textParts.push(o.text || o.content);
          }
        }
        content = textParts.join('');
        if (calls.length > 0) toolCalls = calls;
      }
    }
    return {
      content,
      reasoning,
      toolCalls: toolCalls || (data && data.tool_calls ? data.tool_calls : null),
      usage: data && data.usage ? {
        promptTokens: data.usage.input_tokens || 0,
        completionTokens: data.usage.output_tokens || 0,
        totalTokens: (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0)
      } : null
    };
  }
};


module.exports = { OpenAIResponsesAdapter };
