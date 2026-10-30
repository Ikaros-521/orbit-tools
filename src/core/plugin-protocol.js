/* The plugin:// scheme serves every plugin-owned file (panel scripts, overlay
   windows, icons) from its folder. One code path for built-in and user
   plugins; anything resolving outside the plugin root is a 403.
   `plugin://<id>/@<alias>/<rel>` additionally serves from plugin-registered
   EXTERNAL roots (ctx.addAssetRoot) — the channel for big user-owned assets
   (Live2D models, imported pet packs) that must not enter the plugin folder. */
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
    // @alias/<rel> routes to a plugin-registered external root
    const aliasMatch = rel.match(/^@([a-z][a-z0-9-]*)\/(.*)$/);
    let root = p.root;
    if (aliasMatch) {
      root = manager.extraRoots && manager.extraRoots.get(`${id}/${aliasMatch[1]}`);
      if (!root) return new Response(`unknown asset root "${aliasMatch[1]}"`, { status: 404 });
      rel = aliasMatch[2];
    }
    const file = path.resolve(root, rel);
    if (file !== root && !file.startsWith(root + path.sep)) {
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
