# 设计系统与主题

宿主提供一套 CSS 变量令牌体系，深浅两套主题全部经由 `light-dark()` 函数定义。**插件直接引用令牌即可自动适配主题**，这是插件样式的第一原则。

## 主题机制

- 根元素通过 `data-theme` 属性切换 `light` / `dark`（可在设置页切换，默认跟随系统）；
- 所有颜色令牌用 CSS `light-dark()` 双值声明，同一条样式规则同时覆盖两个主题；
- **禁止写死单主题颜色**（如固定 `#1e1e1e` 背景）—— 换主题时就会穿帮。

## 颜色令牌

| 令牌 | 用途 |
|---|---|
| `var(--bg)` | 页面底色 |
| `var(--bg-card)` | 卡片 / 面板底色 |
| `var(--bg-glass)` | 毛玻璃 / 浮层底色 |
| `var(--ink)` | 主文字 |
| `var(--ink-dim)` | 次要说明文字 |
| `var(--ink-faint)` | 弱提示 / 占位符 |
| `var(--amber)` | 强调色（琥珀金 `#ffab2e` 系） |
| `var(--amber-soft)` | 强调色柔和版（高亮背景等） |
| `var(--line)` | 常规边框 |
| `var(--line-strong)` | 强边框 |
| `var(--line-subtle)` | 弱分隔线 |

## 圆角令牌

| 令牌 | 值 |
|---|---|
| `var(--r-sm)` | 6px |
| `var(--r-md)` | 10px |
| `var(--r-lg)` | 14px |

## 公共类名

宿主全局样式表提供可直接复用的组件类：

| 类名 | 用途 |
|---|---|
| `.btn` / `.btn.ghost` / `.btn.small` | 按钮（实心 / 幽灵 / 紧凑） |
| `.input` | 输入框 / 文本域 |
| `.mono` | 等宽字体（代码、hash、端口号） |
| `.chip` | 分类胶囊标签 |

## 示例

```css
/* panel.css */
.my-container {
  background: var(--bg-card);
  color: var(--ink);
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  padding: 12px;
}

.my-container .hint {
  color: var(--ink-dim);
}

.my-container .highlight {
  color: var(--amber);
  background: var(--amber-soft);
}
```

```html
<div class="my-container">
  <div class="tool-bar">
    <button type="button" class="btn">转换</button>
    <button type="button" class="btn ghost small">复制</button>
  </div>
  <input class="input mono" placeholder="粘贴内容..." />
  <span class="hint">结果自动匹配当前主题</span>
</div>
```

## 样式作用域建议

插件样式注入在宿主文档流内，与宿主样式共存：

- 类名加插件前缀（`.codec-` / `.memo-`）避免与宿主或其他插件撞名；
- 选择器尽量从面板根（`el` 是 `panel-root` 子元素）出发，控制影响范围；
- 需要全屏/置顶浮层时优先开独立窗口（见[独立窗口](/plugin/windows)），而不是把 fixed 层挂在宿主页面里。

## 双主题验证

交付前分别在浅色与深色主题下过一遍界面，重点检查：

- 文字对比度（`--ink-faint` 只用于真正弱的提示）；
- 浮层 / 下拉是否有**实底背景**（用 `--bg-card` / `--bg-glass`，透明浮层会透出下层内容）；
- 代码高亮等自定义配色是否也走令牌（参考 ai-chat 插件的 hljs 令牌配色做法）。
