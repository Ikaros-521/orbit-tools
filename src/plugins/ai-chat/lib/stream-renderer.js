/* AI Chat - Incremental Streaming Markdown Renderer
   deepseek-harness style delta fast-path: settled block prefix renders once and
   is never touched again; only the active tail re-renders, coalesced per frame.

   Safety model (matches lib/markdown-renderer.js, a purely line-based engine):
   - fenced code blocks are the only construct that may legally contain blank
     lines, so boundaries are only taken while no fence is open;
   - tables and lists span contiguous non-blank lines, so a boundary right after
     a blank line can never cut them in half;
   - every settled delta therefore renders standalone into the same HTML blocks
     a full-document render would produce. */
(() => {
  const FENCE_RE = /^\s*(```|~~~)/;

  /**
   * Split streaming markdown into a settled prefix and an active tail.
   * The boundary is placed right after the last blank line that sits outside
   * any open code fence; the fence-open prefix is kept so the tail re-render
   * keeps highlighting the streaming code block.
   *
   * @param {string} text full markdown received so far
   * @returns {{ settled: string, active: string }}
   */
  function splitSettledPrefix(text) {
    const str = typeof text === 'string' ? text : String(text || '');
    if (!str) return { settled: '', active: '' };

    const lines = str.split(/\r?\n/);
    let fenceOpen = false;
    let boundary = -1; // index in `lines` AFTER which content is settled
    let offset = 0;
    let prevBlank = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineLen = line.length + 1; // + consumed newline
      const trimmed = line.trim();

      if (!fenceOpen && FENCE_RE.test(line)) {
        fenceOpen = true;
      } else if (fenceOpen && FENCE_RE.test(line)) {
        fenceOpen = false;
        // A just-closed fence is a complete block; the following blank line
        // (or stream end) will carry the boundary.
      }

      const isBlank = trimmed === '';
      if (!fenceOpen && isBlank && prevBlank !== null) {
        // boundary right after this blank line (collapse runs of blanks:
        // keep advancing while blank lines continue)
        boundary = i;
      }
      prevBlank = isBlank;
      offset += lineLen;
    }

    if (boundary < 0) return { settled: '', active: str };

    // Re-join preserving original line text; settled includes the blank line.
    const settled = lines.slice(0, boundary + 1).join('\n');
    const active = lines.slice(boundary + 1).join('\n');
    return { settled, active };
  }

  /**
   * A StreamSlot owns one streaming markdown block (one assistant round).
   * settledEl renders appended deltas incrementally; activeEl re-renders the
   * tail. finalize() falls back to one full-document render so the final DOM
   * is byte-identical with the non-streaming path.
   */
  class StreamSlot {
    /**
     * @param {HTMLElement} host element that will contain the two layers
     * @param {(raw: string) => string} renderFn markdown -> html
     */
    constructor(host, renderFn) {
      this.host = host;
      this.renderFn = renderFn;
      this.settledLen = 0;
      this.lastText = '';
      this.finalized = false;

      this.settledEl = document.createElement('div');
      this.settledEl.className = 'ai-stream-settled';
      this.activeEl = document.createElement('div');
      this.activeEl.className = 'ai-stream-active';
      host.appendChild(this.settledEl);
      host.appendChild(this.activeEl);
    }

    /** Record new full text; renders are coalesced by the caller via rAF. */
    update(fullText) {
      if (this.finalized) return;
      this.lastText = typeof fullText === 'string' ? fullText : String(fullText || '');
      const { settled, active } = splitSettledPrefix(this.lastText);

      if (settled.length > this.settledLen) {
        const delta = settled.slice(this.settledLen);
        this.settledLen = settled.length;
        // Deltas always start right after a blank-line boundary, so rendering
        // them standalone yields the same blocks a full render would.
        const html = this.renderFn(delta);
        if (html) this.settledEl.insertAdjacentHTML('beforeend', html);
      }

      this.activeEl.innerHTML = this.renderFn(active);
    }

    /** One-shot full render; returns the host element for post-passes. */
    finalize() {
      if (this.finalized) return this.host;
      this.finalized = true;
      this.host.innerHTML = this.renderFn(this.lastText || '');
      return this.host;
    }
  }

  /**
   * Coalesce high-frequency calls into one per animation frame
   * (deepseek-harness 'animation-frame' publish tier).
   */
  function rafThrottle(fn) {
    let queued = false;
    let lastArgs = null;
    const run = () => {
      queued = false;
      fn(...lastArgs);
    };
    return (...args) => {
      lastArgs = args;
      if (queued) return;
      queued = true;
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
      else setTimeout(run, 16);
    };
  }

  const exportsObj = { splitSettledPrefix, StreamSlot, rafThrottle };

  if (typeof window !== 'undefined') {
    window.AiChatStreamRenderer = exportsObj;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;
  }
})();
