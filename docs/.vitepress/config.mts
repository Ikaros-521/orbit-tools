import { defineConfig } from 'vitepress'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// 站点部署在主仓库 GitHub Pages 的子路径下，base 必须与仓库名一致
const BASE = '/orbit-tools/'
const SITE = `https://ikaros-521.github.io${BASE}`
const DESCRIPTION =
  'Orbit Toolbox（轨道工具箱）官方文档 — 免费开源的 uTools 风格插件化开发者工具箱：截图悬浮、剪贴板历史、AI Agent 对话，插件开发、工作流编排与宿主 API 参考。'
const OG_IMAGE =
  'https://github.com/user-attachments/assets/2eeb16a2-a9ed-4de0-815a-d08721a8f7af'

const pageUrl = (relativePath: string) =>
  SITE + relativePath.replace(/\.md$/, '.html').replace(/(^|\/)index\.html$/, '$1')

const JSON_LD = JSON.stringify({
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      name: 'Orbit Toolbox 官方文档',
      alternateName: 'Orbit Toolbox Docs',
      url: SITE,
      inLanguage: 'zh-CN',
    },
    {
      '@type': 'SoftwareApplication',
      name: 'Orbit Toolbox',
      alternateName: '轨道工具箱',
      applicationCategory: 'DeveloperApplication',
      operatingSystem: 'Windows, macOS, Linux',
      url: SITE,
      downloadUrl: 'https://github.com/Ikaros-521/orbit-tools/releases/latest',
      codeRepository: 'https://github.com/Ikaros-521/orbit-tools',
      license: 'https://www.gnu.org/licenses/agpl-3.0.html',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'CNY' },
      author: {
        '@type': 'Person',
        name: 'Ikaros-521',
        url: 'https://github.com/Ikaros-521',
      },
      description:
        '免费开源的 uTools 风格插件化开发者工具箱：一切工具皆插件，安装即复制文件夹，全局热键呼出，内置 AI Agent 对话。',
      keywords:
        'uTools,开发者工具箱,Electron,插件,截图悬浮,剪贴板历史,JSON编辑器,AI Agent',
    },
  ],
})

export default defineConfig({
  lang: 'zh-CN',
  title: 'Orbit Toolbox',
  description: DESCRIPTION,
  base: BASE,
  lastUpdated: true,
  sitemap: {
    hostname: SITE,
  },
  markdown: {
    lineNumbers: true,
  },
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: `${BASE}logo.svg` }],
    [
      'meta',
      {
        name: 'keywords',
        content:
          'Orbit Toolbox,轨道工具箱,utools,uTools替代品,开发者工具箱,Electron,插件开发,截图悬浮,剪贴板历史,JSON编辑器,AI Agent,MCP',
      },
    ],
    ['meta', { name: 'author', content: 'Ikaros-521' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:site_name', content: 'Orbit Toolbox' }],
    ['meta', { property: 'og:description', content: DESCRIPTION }],
    ['meta', { property: 'og:image', content: OG_IMAGE }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['script', { type: 'application/ld+json' }, JSON_LD],
  ],
  transformHead({ pageData }) {
    const url = pageUrl(pageData.relativePath)
    const title = pageData.title
      ? `${pageData.title} | Orbit Toolbox`
      : 'Orbit Toolbox · 轨道工具箱'
    return [
      ['link', { rel: 'canonical', href: url }],
      ['meta', { property: 'og:url', content: url }],
      ['meta', { property: 'og:title', content: title }],
    ]
  },
  async buildEnd(siteConfig) {
    const rank = (p: string) =>
      p === 'index.md' ? 0 : p.startsWith('guide/') ? 1 : p.startsWith('plugin/') ? 2 : p.startsWith('reference/') ? 3 : 4
    const pages = [...siteConfig.pages].sort(
      (a, b) => rank(a) - rank(b) || a.localeCompare(b),
    )
    const chunks = [
      [
        '# Orbit Toolbox（轨道工具箱）— 完整文档',
        '',
        '> 免费开源、uTools 风格的插件化开发者工具箱（Electron / Windows / macOS / Linux）。',
        '> 本文件聚合官方文档站全部页面，供大语言模型检索与引用；结构化索引见 llms.txt。',
        '> 项目仓库: https://github.com/Ikaros-521/orbit-tools',
      ].join('\n'),
    ]
    for (const p of pages) {
      const text = readFileSync(join(siteConfig.srcDir, p), 'utf8')
        .replace(/^---\r?\n[\s\S]*?\r?\n---\s*/, '')
        .trim()
      if (!text) continue
      chunks.push(`\n\n---\n\n来源: ${pageUrl(p)}\n\n${text}`)
    }
    writeFileSync(join(siteConfig.outDir, 'llms-full.txt'), chunks.join('\n'), 'utf8')
  },
  themeConfig: {
    logo: '/logo.svg',
    nav: [
      { text: '指南', link: '/guide/introduction', activeMatch: '/guide/' },
      { text: '插件开发', link: '/plugin/overview', activeMatch: '/plugin/' },
      { text: '参考', link: '/reference/host-api', activeMatch: '/reference/' },
      { text: 'GitHub', link: 'https://github.com/Ikaros-521/orbit-tools' },
    ],
    sidebar: {
      '/guide/': [
        {
          text: '指南',
          items: [
            { text: '简介', link: '/guide/introduction' },
            { text: '快速开始', link: '/guide/getting-started' },
            { text: '架构总览', link: '/guide/architecture' },
            { text: '安全模型', link: '/guide/security' },
          ],
        },
      ],
      '/plugin/': [
        {
          text: '插件开发',
          items: [
            { text: '插件系统概览', link: '/plugin/overview' },
            { text: '清单规范 plugin.json', link: '/plugin/manifest' },
            { text: '前端面板', link: '/plugin/panel' },
            { text: '后端模块', link: '/plugin/backend' },
            { text: '独立窗口', link: '/plugin/windows' },
            { text: '工作流与能力', link: '/plugin/workflows' },
            { text: '设计系统与主题', link: '/plugin/theming' },
            { text: '调试与测试', link: '/plugin/debugging' },
            { text: 'AI Skill 脚手架', link: '/plugin/ai-skill' },
            { text: '单页完全指南', link: '/plugin-guide' },
          ],
        },
      ],
      '/reference/': [
        {
          text: '参考',
          items: [
            { text: '宿主 API（window.host）', link: '/reference/host-api' },
            { text: '内置插件一览', link: '/reference/builtin-plugins' },
            { text: '常见问题', link: '/reference/faq' },
          ],
        },
      ],
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/Ikaros-521/orbit-tools' },
    ],
    outline: { level: [2, 3], label: '本页目录' },
    search: {
      provider: 'local',
      options: {
        translations: {
          button: { buttonText: '搜索文档', buttonAriaLabel: '搜索文档' },
          modal: {
            noResultsText: '未找到相关结果',
            resetButtonTitle: '清除查询条件',
          },
          footer: {
            selectText: '选择',
            navigateText: '切换',
            closeText: '关闭',
          },
        },
      },
    },
    docFooter: { prev: '上一篇', next: '下一篇' },
    lastUpdated: { text: '最后更新' },
    darkModeSwitchLabel: '主题',
    sidebarMenuLabel: '菜单',
    returnToTopLabel: '回到顶部',
    externalLinkIcon: true,
  },
})