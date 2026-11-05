/* AI Chat - Server-Sent Events stream parser (protocol-agnostic).
   Event assembly state survives across feed() chunks. */
/**
 * Parses raw SSE text chunks into parsed data events.
 * Handles multiline buffers, "data: [DONE]", and "event: xxx".
 */
class SSEParser {
  constructor(onEvent) {
    this.onEvent = onEvent;
    this.buffer = '';
    // 事件组装状态必须跨 feed() 调用保留：TCP 分块可能把 event:/data:
    // 行切在两个 chunk 里，局部变量会把前半段直接丢掉。
    this.pendingEvent = null;
    this.pendingData = [];
  }

  feed(chunkText) {
    this.buffer += chunkText;
    const lines = this.buffer.split(/\r?\n/);
    // keep incomplete tail in buffer
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        this._flushEvent();
        continue;
      }

      if (line.startsWith('event:')) {
        this.pendingEvent = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        this.pendingData.push(line.slice(5).trim());
      }
    }
  }

  _flushEvent() {
    if (this.pendingData.length === 0) return;
    const rawData = this.pendingData.join('\n');
    const eventName = this.pendingEvent;
    this.pendingData = [];
    this.pendingEvent = null;
    if (rawData === '[DONE]') {
      this.onEvent({ type: 'done' });
    } else {
      try {
        const parsed = JSON.parse(rawData);
        this.onEvent({ type: eventName || 'message', data: parsed });
      } catch {
        this.onEvent({ type: eventName || 'message', raw: rawData });
      }
    }
  }

  finish() {
    if (this.buffer.trim().startsWith('data:')) {
      // 流结束时把残留的未完成行并入待决数据后统一冲刷
      this.pendingData.push(this.buffer.trim().slice(5).trim());
      this.buffer = '';
    }
    this._flushEvent();
  }
}


module.exports = { SSEParser };
