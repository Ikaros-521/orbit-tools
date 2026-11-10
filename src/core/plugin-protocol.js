/* The plugin:// scheme serves every plugin-owned file (panel scripts, overlay
   windows, icons) from its folder. One code path for built-in and user
   plugins; anything resolving outside the plugin root is a 403.
   `plugin://<id>/@<alias>/<rel>` additionally serves from plugin-registered
   EXTERNAL roots (ctx.addAssetRoot) — the channel for big user-owned assets
   (Live2D models, imported pet packs) that must not enter the plugin folder. */
const fs = require('fs');
const path = require('path');
const { protocol, net } = require('electron');
const { pathToFileURL } = require('url');

function registerPluginProtocol(manager) {
  protocol.handle('plugin', async req => {
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
      const st = await fs.promises.stat(file);
      if (!st.isFile()) return new Response('not found', { status: 404 });
      return await net.fetch(pathToFileURL(file).toString());
    } catch {
      return new Response('not found', { status: 404 });
    }
  });
}

module.exports = { registerPluginProtocol };
