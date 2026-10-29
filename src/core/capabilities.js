/* Capability Registry & Smart Peek Engine.
   Detects structured data envelopes (timestamps, ports, JWTs, Base64, URLs)
   and maps them to enabled plugin capabilities without hardcoding. */

const DETECTORS = {
  'math/expression': {
    /* Arithmetic-only charset (digits + operators); letters, braces, URLs
       never match, so math is the most specific probe in every chain.
       Date / phone / version shapes are excluded on purpose — they parse as
       arithmetic but read as data ("2026-10-29", "138-1234-5678"). */
    test: text => {
      const t = text.trim();
      if (t.length < 3 || t.length > 200) return false;
      if (!/^[\d\s+\-*/().%^,×÷−]+$/.test(t)) return false;
      if (!/[+\-*/%^×÷−]/.test(t)) return false;
      if (t.replace(/[^\d]/g, '').length < 2) return false;
      const compact = t.replace(/\s/g, '');
      if (/^\d{1,4}[-/.]\d{1,4}([-/.]\d{1,4})?$/.test(compact)) return false;
      if (/^\d{2,4}(-\d{2,4}){2,}$/.test(compact)) return false;
      return true;
    },
    resolve: (text) => {
      // same engine the calculator panel & backend use — one truth everywhere
      let engine = null;
      try { engine = require('../plugins/calculator/eval'); } catch { return null; }
      const res = engine.evaluate(text.trim());
      if (!res || !res.ok) return null;
      return {
        type: 'math/expression',
        badge: '算式求值',
        preview: `= ${res.display}`,
        copyValue: res.display,
        subText: `${text.trim()} = ${res.display} · Enter 复制结果`,
        targetAction: 'openPanel',
      };
    }
  },
  'text/timestamp': {
    test: text => /^\d{10}(\d{3})?$/.test(text.trim()),
    resolve: (text) => {
      const trimmed = text.trim();
      let ms = Number(trimmed);
      const isSec = trimmed.length === 10;
      if (isSec) ms *= 1000;
      const d = new Date(ms);
      if (isNaN(d.getTime())) return null;
      const year = d.getFullYear();
      if (year < 1970 || year > 2100) return null;

      const pad = n => String(n).padStart(2, '0');
      const formatted = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
      const utc = d.toISOString().replace('.000Z', 'Z');
      const diffSec = Math.round((Date.now() - d.getTime()) / 1000);
      let relative = '';
      if (Math.abs(diffSec) < 60) relative = '刚刚';
      else if (diffSec > 0 && diffSec < 3600) relative = `${Math.floor(diffSec / 60)}分钟前`;
      else if (diffSec > 0 && diffSec < 86400) relative = `${Math.floor(diffSec / 3600)}小时前`;
      else if (diffSec > 0) relative = `${Math.floor(diffSec / 86400)}天前`;
      else if (diffSec < 0 && Math.abs(diffSec) < 3600) relative = `${Math.floor(Math.abs(diffSec) / 60)}分钟后`;
      else if (diffSec < 0) relative = `${Math.floor(Math.abs(diffSec) / 86400)}天后`;

      return {
        type: 'text/timestamp',
        badge: isSec ? '时间戳 (秒)' : '时间戳 (毫秒)',
        preview: formatted,
        copyValue: formatted,
        subText: `${utc} · ${relative}`,
        targetAction: 'openPanel',
      };
    }
  },

  'system/port': {
    test: text => /^:?([1-9]\d{0,3}|[1-5]\d{4}|6[0-4]\d{3}|65[0-4]\d{2}|655[0-2]\d|6553[0-5])$/.test(text.trim()),
    resolve: (text) => {
      const port = Number(text.trim().replace(/^:/, ''));
      return {
        type: 'system/port',
        badge: `端口 ${port}`,
        preview: `正在探测端口 :${port} 占用状态…`,
        copyValue: String(port),
        subText: '按 Enter 复制端口号，按 Tab 直达端口排查',
        asyncProbe: {
          pluginId: 'port-scope',
          method: 'inspectPort',
          args: { port }
        },
        targetAction: 'openPanel',
      };
    }
  },

  'text/jwt': {
    test: text => /^ey[A-Za-z0-9_-]+\.ey[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(text.trim()),
    resolve: (text) => {
      try {
        const parts = text.trim().split('.');
        const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const jsonStr = Buffer.from(b64, 'base64').toString('utf8');
        const payload = JSON.parse(jsonStr);
        let expText = '';
        if (payload.exp) {
          const expMs = payload.exp * 1000;
          const isExpired = Date.now() > expMs;
          const expDate = new Date(expMs).toLocaleString();
          expText = isExpired ? `已过期 (${expDate})` : `有效至 ${expDate}`;
        }
        const preview = JSON.stringify(payload);
        return {
          type: 'text/jwt',
          badge: 'JWT Token',
          preview: preview.length > 70 ? preview.slice(0, 70) + '…' : preview,
          copyValue: JSON.stringify(payload, null, 2),
          subText: expText || `包含 ${Object.keys(payload).length} 个字段`,
          targetAction: 'openPanel',
        };
      } catch {
        return null;
      }
    }
  },

  'text/base64': {
    test: text => {
      const t = text.trim();
      if (t.length < 8 || t.length % 4 !== 0) return false;
      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(t)) return false;
      if (/^[a-zA-Z]+$/.test(t) && t.length < 16) return false;
      return true;
    },
    resolve: (text) => {
      try {
        const decoded = Buffer.from(text.trim(), 'base64').toString('utf8');
        if (!decoded || /[\x00-\x08\x0E-\x1F]/.test(decoded)) return null;
        return {
          type: 'text/base64',
          badge: 'Base64 解码',
          preview: decoded.length > 70 ? decoded.slice(0, 70) + '…' : decoded,
          copyValue: decoded,
          subText: `原长 ${text.trim().length} 字符 · 解码后 ${decoded.length} 字符`,
          targetAction: 'openPanel',
        };
      } catch {
        return null;
      }
    }
  },

  'text/url': {
    test: text => /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(text.trim()),
    resolve: (text) => {
      try {
        const u = new URL(text.trim());
        const paramCount = [...u.searchParams.keys()].length;
        return {
          type: 'text/url',
          badge: `${u.protocol.replace(':', '')} 链接`,
          preview: `${u.hostname}${u.pathname}`,
          copyValue: text.trim(),
          subText: paramCount > 0 ? `包含 ${paramCount} 个参数 · ${u.hostname}` : u.hostname,
          targetAction: 'openPanel',
        };
      } catch {
        return null;
      }
    }
  },

  'text/hex': {
    test: text => {
      const t = text.trim();
      if (t.length < 8) return false;
      const bare = t.replace(/0x/gi, '').replace(/[\s,:;-]+/g, '');
      if (bare.length < 8 || bare.length % 2 !== 0) return false;
      if (!/^[0-9a-f]+$/i.test(bare)) return false;
      // pure digits read as a number/timestamp — demand at least one a-f digit
      if (!/[a-f]/i.test(bare)) return false;
      return true;
    },
    resolve: (text) => {
      try {
        const bare = text.trim().replace(/0x/gi, '').replace(/[\s,:;-]+/g, '');
        const decoded = Buffer.from(bare, 'hex').toString('utf8');
        if (!decoded || /[\x00-\x08\x0E-\x1F]/.test(decoded)) return null;
        return {
          type: 'text/hex',
          badge: `Hex 解码 (${bare.length / 2} 字节)`,
          preview: decoded.length > 70 ? decoded.slice(0, 70) + '…' : decoded,
          copyValue: decoded,
          subText: `原长 ${text.trim().length} 字符 · 解码后 ${decoded.length} 字符`,
          targetAction: 'openPanel',
        };
      } catch {
        return null;
      }
    }
  },
  'text/unicode': {
    test: text => {
      const t = text.trim();
      if (t.length < 6) return false;
      const m = t.match(/\\u\{[0-9a-fA-F]{1,6}\}|\\u[0-9a-fA-F]{4}|&#x[0-9a-fA-F]+;|\\x[0-9a-fA-F]{2}/g);
      if (!m) return false;
      // escapes must dominate the text, otherwise it's prose quoting an escape
      return m.join('').length / t.length >= 0.5;
    },
    resolve: (text) => {
      try {
        const decoded = text.trim().replace(
          /\\u\{([0-9a-fA-F]+)\}|\\u([0-9a-fA-F]{4})|&#x([0-9a-fA-F]+);|\\x([0-9a-fA-F]{2})/g,
          (whole, b1, b2, b3, b4) => {
            const cp = parseInt(b1 || b2 || b3 || b4, 16);
            try { return String.fromCodePoint(cp); } catch { return whole; }
          }
        );
        if (!decoded || decoded === text.trim()) return null;
        return {
          type: 'text/unicode',
          badge: 'Unicode 解码',
          preview: decoded.length > 70 ? decoded.slice(0, 70) + '…' : decoded,
          copyValue: decoded,
          subText: `原长 ${text.trim().length} 字符 · 解码后 ${decoded.length} 字符`,
          targetAction: 'openPanel',
        };
      } catch {
        return null;
      }
    }
  },
  'application/json': {
    test: text => {
      const t = text.trim();
      if ((!t.startsWith('{') || !t.endsWith('}')) && (!t.startsWith('[') || !t.endsWith(']'))) return false;
      if (t.length < 4 || t.length > 50000) return false;
      try {
        JSON.parse(t);
        return true;
      } catch {
        return false;
      }
    },
    resolve: (text) => {
      try {
        const obj = JSON.parse(text.trim());
        const isArr = Array.isArray(obj);
        const count = isArr ? obj.length : Object.keys(obj).length;
        const formatted = JSON.stringify(obj, null, 2);
        const sub = isArr ? `JSON 数组 · 共 ${count} 项` : `JSON 对象 · 共 ${count} 个键`;
        const preview = JSON.stringify(obj);
        return {
          type: 'application/json',
          badge: isArr ? 'JSON 数组' : 'JSON 对象',
          preview: preview.length > 70 ? preview.slice(0, 70) + '…' : preview,
          copyValue: formatted,
          subText: `${sub} · 按 Enter 复制格式化缩进`,
          targetAction: 'openPanel',
        };
      } catch {
        return null;
      }
    }
  }
};

class CapabilityRouter {
  constructor(manager) {
    this.manager = manager;
  }

  detect(rawText) {
    if (!rawText || typeof rawText !== 'string') return null;
    const text = rawText.trim();
    if (!text || text.length > 10000) return null;

    // Collect all active capabilities from ENABLED plugins only
    for (const plugin of this.manager.plugins.values()) {
      if (!plugin.enabled) continue;
      const caps = Array.isArray(plugin.manifest.capabilities) ? plugin.manifest.capabilities : [];
      for (const cap of caps) {
        const detector = DETECTORS[cap.type];
        if (!detector) continue;
        if (detector.test(text)) {
          const res = detector.resolve(text);
          if (res) {
            return {
              ...res,
              capabilityId: cap.id,
              pluginId: plugin.id,
              pluginName: plugin.manifest.name,
              rawInput: text,
            };
          }
        }
      }
    }
    return null;
  }

  getPipelineActions(envelope) {
    if (!envelope || !envelope.type) return [];
    const actions = [];
    for (const plugin of this.manager.plugins.values()) {
      if (!plugin.enabled) continue;
      const m = plugin.manifest;
      const consumes = Array.isArray(m.consumes) ? m.consumes : [];
      const capConsumes = Array.isArray(m.capabilities)
        ? m.capabilities.map(c => c.type).filter(Boolean)
        : [];
      const allConsumes = new Set([...consumes, ...capConsumes]);

      let matched = allConsumes.has(envelope.type);
      if (!matched && envelope.type.startsWith('text/') && allConsumes.has('text/plain')) {
        matched = true;
      }
      if (matched) {
        actions.push({
          pluginId: plugin.id,
          pluginName: plugin.manifest.name,
          title: {
            zh: `发送到 ${m.name.zh || plugin.id}`,
            en: `Send to ${m.name.en || plugin.id}`,
          },
          targetAction: 'openPanel',
          envelope,
        });
      }
    }
    return actions;
  }
}

module.exports = {
  CapabilityRouter,
  DETECTORS,
};
