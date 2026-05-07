import { defineConfig } from 'vitepress'

const githubRepo = 'https://github.com/yedsn/transfer-genie'
const giteeRepo = 'https://gitee.com/hongxiaojian/transfer-genie'
const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? 'transfer-genie'
const base = process.env.DOCS_BASE ?? (process.env.GITHUB_ACTIONS === 'true' ? `/${repoName}/` : '/')

export default defineConfig({
  title: 'Transfer Genie',
  description: '把 WebDAV 变成你的跨设备传输收件箱。',
  lang: 'zh-CN',
  base,
  cleanUrls: true,
  lastUpdated: true,
  head: [
    ['link', { rel: 'icon', type: 'image/png', href: `${base}favicon.png` }],
    ['meta', { name: 'theme-color', content: '#0f766e' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: 'Transfer Genie' }],
    ['meta', { property: 'og:description', content: '一个基于 WebDAV 的跨平台文件与文本传输助手。' }]
  ],
  themeConfig: {
    logo: '/logo.png',
    nav: [
      { text: '首页', link: '/' },
      { text: '安装使用', link: '/guide/quick-start' },
      { text: '本机 HTTP API', link: '/integrations/http-api' },
      { text: 'Telegram Bridge', link: '/integrations/telegram-bridge' },
      { text: '开发文档', link: '/develop/setup' },
      { text: 'GitHub', link: githubRepo }
    ],
    sidebar: {
      '/guide/': [
        {
          text: '使用说明',
          items: [
            { text: '快速开始', link: '/guide/quick-start' },
            { text: '下载安装', link: '/guide/installation' },
            { text: '第一次传输', link: '/guide/first-sync' }
          ]
        }
      ],
      '/develop/': [
        {
          text: '开发说明',
          items: [
            { text: '开发环境', link: '/develop/setup' },
            { text: '构建与发布', link: '/develop/build-and-release' }
          ]
        }
      ],
      '/integrations/': [
        {
          text: '集成能力',
          items: [
            { text: '本机 HTTP API', link: '/integrations/http-api' },
            { text: 'Telegram Bridge', link: '/integrations/telegram-bridge' }
          ]
        }
      ],
      '/reference/': [
        {
          text: '参考',
          items: [
            { text: '项目结构', link: '/reference/project-structure' },
            { text: '站点与发布说明', link: '/reference/site-deployment' }
          ]
        }
      ]
    },
    socialLinks: [
      { icon: 'github', link: githubRepo }
    ],
    search: {
      provider: 'local'
    },
    editLink: {
      pattern: `${githubRepo}/edit/master/docs/:path`,
      text: '在 GitHub 上编辑此页'
    },
    outline: {
      label: '页面导航'
    },
    docFooter: {
      prev: '上一页',
      next: '下一页'
    },
    lastUpdated: {
      text: '最后更新于'
    },
    footer: {
      message: 'Released under AGPL-3.0-or-later.',
      copyright: 'Copyright 2026 Transfer Genie Contributors'
    }
  }
})
