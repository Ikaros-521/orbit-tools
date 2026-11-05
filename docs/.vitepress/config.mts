import { defineConfig } from 'vitepress'

// 站点部署在主仓库 GitHub Pages 的子路径下，base 必须与仓库名一致
const BASE = '/orbit-tools/'

export default defineConfig({
  lang: 'zh-CN',
  title: 'Orbit Toolbox',
  description:
    'uTools 风格的插件化开发者工具箱 — 官方开发文档：架构总览、插件开发、工作流编排、宿主 API 参考。',
  base: BASE,
  lastUpdated: true,
  markdown: {
    lineNumbers: true,
  },
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: `${BASE}logo.svg` }],
  ],
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
            footer: {
              selectText: '选择',
              navigateText: '切换',
              closeText: '关闭',
            },
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
