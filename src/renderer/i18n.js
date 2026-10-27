/* Host-shell strings. Plugins carry their own text; this dict only covers
   the shell (palette, settings, chrome) so a language switch repaints it. */
window.I18N = (() => {
  const DICT = {
    zh: {
      subtitle: '插件化开发工具箱',
      searchPh: '搜索工具…（名称 / 关键词）',
      tabTools: '工具', tabSettings: '设置',
      back: '返回',
      empty: '没有匹配的工具',
      noTools: '所有插件都被禁用了，到设置里开启',
      deckMeta: '{n} 个工具',
      setGeneral: '／ 通用', setPlugins: '／ 插件', setAbout: '／ 关于',
      hotkey: '呼出热键', hotkeyHint: '显示 / 隐藏工具箱的全局快捷键',
      hotkeyRecord: '点击后按下组合键', hotkeyBad: '注册失败，可能被占用',
      conflictWith: '与「{name}」冲突',
      apply: '应用', clearHotkey: '清除',
      langLabel: '语言', themeLabel: '主题',
      themeAuto: '跟随系统', themeLight: '浅色', themeDark: '深色',
      rescan: '重新扫描插件', openUserPlugins: '打开用户插件目录',
      userPluginsHint: '把插件文件夹放进该目录即可安装；同名 id 会覆盖内置插件。禁用的插件不会加载后端代码。',
      sourceBuiltin: '内置', sourceUser: '用户',
      loadError: '加载出错', actions: '动作热键',
      noHotkey: '未设置',
      version: '版本',
    },
    en: {
      subtitle: 'pluggable developer toolbox',
      searchPh: 'Search tools… (name / keyword)',
      tabTools: 'Tools', tabSettings: 'Settings',
      back: 'Back',
      empty: 'No tool matches',
      noTools: 'Every plugin is disabled — turn some on in Settings',
      deckMeta: '{n} tools',
      setGeneral: '／ General', setPlugins: '／ Plugins', setAbout: '／ About',
      hotkey: 'Summon hotkey', hotkeyHint: 'Global shortcut to show / hide the toolbox',
      hotkeyRecord: 'Click, then press a combo', hotkeyBad: 'Register failed — likely taken',
      conflictWith: 'conflicts with "{name}"',
      apply: 'Apply', clearHotkey: 'Clear',
      langLabel: 'Language', themeLabel: 'Theme',
      themeAuto: 'Auto', themeLight: 'Light', themeDark: 'Dark',
      rescan: 'Rescan plugins', openUserPlugins: 'Open user plugins folder',
      userPluginsHint: 'Drop a plugin folder there to install it; a matching id overrides the built-in. Disabled plugins never load their backend.',
      sourceBuiltin: 'built-in', sourceUser: 'user',
      loadError: 'load error', actions: 'Action hotkeys',
      noHotkey: 'none',
      version: 'Version',
    },
  };
  let lang = 'zh';

  const t = (k, p) => {
    let s = (DICT[lang] && DICT[lang][k]) ?? (DICT.zh[k]) ?? k;
    if (p) for (const [key, val] of Object.entries(p)) s = s.replace(`{${key}}`, val);
    return s;
  };
  const applyStatic = root => {
    root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
    root.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
  };
  return {
    get lang() { return lang; },
    setLang(l) { if (DICT[l]) lang = l; },
    t, applyStatic,
  };
})();
