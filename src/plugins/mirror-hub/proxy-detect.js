/* mirror-hub proxy detection helper:
   Automatically detects local machine proxy configuration (Windows Registry, macOS scutil,
   Linux gsettings / env vars, and active local proxy client ports like v2rayN, Clash, sing-box). */
const net = require('net');
const { spawnSync } = require('child_process');

const DEFAULT_PROXY = 'http://127.0.0.1:7890';

const CANDIDATE_PORTS = [
  10808, // v2rayN / Xray mixed
  7890,  // Clash / Clash for Windows
  7897,  // Clash Verge / Mihomo Party
  10809, // v2rayN http
  20171, // sing-box
  1080,  // Shadowsocks / socks5 default
  8118,  // Privoxy
  7891,  // Clash socks
];

function parseProxyUrl(input, fallbackScheme = 'http') {
  if (!input) return null;
  const raw = String(input).trim();
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `${fallbackScheme}://${raw}`;
  try {
    const u = new URL(withScheme);
    const port = Number(u.port) || (u.protocol === 'socks5:' ? 1080 : 80);
    const scheme = u.protocol.replace(':', '').toLowerCase();
    // Default to http:// for command generation unless user specified otherwise
    const normalizedScheme = scheme === 'socks5' ? 'socks5' : 'http';
    return {
      host: u.hostname,
      port,
      scheme: normalizedScheme,
      raw: withScheme,
      url: `${normalizedScheme}://${u.hostname}:${port}`,
    };
  } catch {
    return null;
  }
}

function getWinSystemProxy() {
  try {
    const r = spawnSync('reg', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'], { encoding: 'utf8', timeout: 3000 });
    const text = r.stdout || '';
    if (!/ProxyEnable\s+REG_DWORD\s+0x1/.test(text)) return null;
    const m = text.match(/ProxyServer\s+REG_SZ\s+(.+)/);
    if (!m) return null;
    const raw = m[1].trim();
    for (const part of raw.split(';')) {
      const kv = part.includes('=') ? part.split('=') : ['http', part];
      const proto = (kv[0] || '').trim().toLowerCase();
      const addr = (kv[1] || '').trim();
      if (!addr) continue;
      const parsed = parseProxyUrl(addr, proto === 'socks' ? 'socks5' : 'http');
      if (parsed) return parsed;
    }
    return parseProxyUrl(raw, 'http');
  } catch {
    return null;
  }
}

function getMacSystemProxy() {
  try {
    const r = spawnSync('scutil', ['--proxy'], { encoding: 'utf8', timeout: 3000 });
    const text = r.stdout || '';
    const get = k => (text.match(new RegExp(`${k}\\s*:\\s*(.+)`)) || [])[1]?.trim();
    for (const scheme of ['HTTP', 'HTTPS', 'SOCKS']) {
      if (get(`${scheme}Enable`) === '1') {
        const host = get(`${scheme}Proxy`);
        const port = get(`${scheme}Port`);
        if (host && port) {
          return parseProxyUrl(`${scheme.toLowerCase() === 'socks' ? 'socks5' : 'http'}://${host}:${port}`);
        }
      }
    }
  } catch {}
  return null;
}

function getLinuxSystemProxy() {
  try {
    const gs = (schema, key) => {
      const r = spawnSync('gsettings', ['get', schema, key], { encoding: 'utf8', timeout: 2000 });
      return r.status === 0 ? (r.stdout || '').replace(/[']:|'/g, '').trim() : '';
    };
    const mode = gs('org.gnome.system.proxy', 'mode');
    if (mode && mode !== 'none') {
      const host = gs('org.gnome.system.proxy.http', 'host');
      const port = gs('org.gnome.system.proxy.http', 'port');
      if (host && port && port !== '0') return parseProxyUrl(`http://${host}:${port}`);
    }
  } catch {}
  return null;
}

function getSystemProxy() {
  if (process.platform === 'win32') return getWinSystemProxy();
  if (process.platform === 'darwin') return getMacSystemProxy();
  return getLinuxSystemProxy();
}

function getEnvProxy() {
  const envVars = [
    process.env.HTTPS_PROXY, process.env.https_proxy,
    process.env.HTTP_PROXY, process.env.http_proxy,
    process.env.ALL_PROXY, process.env.all_proxy,
  ];
  for (const v of envVars) {
    if (v && typeof v === 'string' && v.trim()) {
      const parsed = parseProxyUrl(v.trim());
      if (parsed) return parsed;
    }
  }
  return null;
}

function isPortOpen(host, port, timeout = 300) {
  return new Promise(resolve => {
    const sock = net.connect({ host: host || '127.0.0.1', port, timeout });
    sock.on('connect', () => {
      sock.destroy();
      resolve(true);
    });
    sock.on('error', () => {
      sock.destroy();
      resolve(false);
    });
    sock.on('timeout', () => {
      sock.destroy();
      resolve(false);
    });
  });
}

async function detectLocalProxy() {
  // 1. Check system proxy
  const sys = getSystemProxy();
  if (sys) {
    const open = await isPortOpen(sys.host, sys.port);
    if (open) {
      return { url: sys.url, source: 'system' };
    }
  }

  // 2. Check environment variables
  const env = getEnvProxy();
  if (env) {
    const open = await isPortOpen(env.host, env.port);
    if (open) {
      return { url: env.url, source: 'env' };
    }
  }

  // 3. Scan common local proxy client ports in parallel
  const checks = await Promise.all(
    CANDIDATE_PORTS.map(async port => ({ port, open: await isPortOpen('127.0.0.1', port) }))
  );
  const found = checks.find(c => c.open);
  if (found) {
    return { url: `http://127.0.0.1:${found.port}`, source: 'port-scan' };
  }

  // 4. If system proxy was configured but port check was unreachable, still prefer it
  if (sys && sys.url) {
    return { url: sys.url, source: 'system-fallback' };
  }

  // 5. Default fallback
  return { url: DEFAULT_PROXY, source: 'default' };
}

module.exports = {
  DEFAULT_PROXY,
  detectLocalProxy,
  parseProxyUrl,
  isPortOpen,
};
