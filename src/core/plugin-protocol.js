/* The plugin:// scheme serves every plugin-owned file (panel scripts, overlay
   windows, icons) from its folder. One code path for built-in and user
   plugins; anything resolving outside the plugin root is a 403. */
const fs = require('fs');
const path = require('path');
const { protocol } = require('electron');

const MIME = {
  '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.html': 'text/html', '.htm': 'text/html', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.json': 'application/json', '.woff2': 'font/woff2', '.txt': 'text/plain',
  '.webm': 'video/webm', '.mp4': 'video/mp4', '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4',
};

function registerPluginProtocol(manager) {
  protocol.handle('plugin', req => {
    let url;
    try { url = new URL(req.url); } catch { return new Response('bad url', { status: 400 }); }
    const id = url.hostname;
    const p = manager && manager.plugins.get(id);
    if (!p) return new Response(`unknown plugin "${id}"`, { status: 404 });
    let rel;
    try {
      rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    } catch {
      return new Response('bad percent-encoding', { status: 400 });
    }
    const file = path.resolve(p.root, rel);
    if (file !== p.root && !file.startsWith(p.root + path.sep)) {
      return new Response('forbidden', { status: 403 });
    }
    try {
      const body = fs.readFileSync(file);
      return new Response(body, { headers: { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' } });
    } catch {
      return new Response('not found', { status: 404 });
    }
  });
}

module.exports = { registerPluginProtocol };
