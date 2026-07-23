import { defineConfig } from 'vitepress'

const githubRepo = 'https://github.com/yedsn/transfer-genie'
const giteeRepo = 'https://gitee.com/hongxiaojian/transfer-genie'
const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? 'transfer-genie'
const base = process.env.DOCS_BASE ?? (process.env.GITHUB_ACTIONS === 'true' ? `/${repoName}/` : '/')
const siteUrl = 'https://yedsn.github.io/transfer-genie/'
const siteOrigin = new URL(siteUrl).origin
const sitePath = new URL(siteUrl).pathname.replace(/\/$/, '')
const siteTitle = 'Transfer Genie - 基于 WebDAV 的跨设备文件传输与文本同步工具'
const siteDescription = 'Transfer Genie 是一个基于 Tauri、Rust 和 WebDAV 的桌面传输工具，支持跨设备发送文本、文件同步、本机 HTTP API 自动化和 Telegram Bridge。'
const pageLabels: Record<string, string> = {
  'download.md': '下载',
  'faq.md': '常见问题',
  'guide/installation.md': '下载安装',
  'guide/quick-start.md': '快速开始',
  'guide/first-sync.md': '第一次传输',
  'integrations/http-api.md': '本机 HTTP API',
  'integrations/telegram-bridge.md': 'Telegram Bridge',
  'use-cases/webdav-file-transfer.md': 'WebDAV 跨设备传文件',
  'use-cases/nas-webdav-transfer.md': 'NAS WebDAV 传输',
  'use-cases/cross-device-text-sync.md': '跨设备文本同步',
  'use-cases/local-http-api-automation.md': 'HTTP API 自动化发送',
  'use-cases/telegram-webdav-bridge.md': 'Telegram 与 WebDAV 同步',
  'compare/transfer-genie-vs-airdrop.md': '对比 AirDrop',
  'compare/transfer-genie-vs-wechat-file-transfer.md': '对比微信文件传输助手',
  'compare/transfer-genie-vs-syncthing.md': '对比 Syncthing',
  'reference/seo-ai-discovery.md': 'SEO 与 AI 收录',
  'reference/community-promo-kit.md': '社区发布文案包',
  'reference/site-deployment.md': '站点与发布说明'
}
const sectionLabels: Record<string, string> = {
  guide: '使用说明',
  integrations: '扩展接入',
  'use-cases': '使用场景',
  compare: '对比',
  reference: '参考',
  develop: '开发文档'
}
const indexedPages = new Set([
  '',
  'download',
  'faq',
  'guide/installation',
  'guide/quick-start',
  'guide/first-sync',
  'guide/backup-restore',
  'integrations/http-api',
  'integrations/telegram-bridge',
  'use-cases/webdav-file-transfer',
  'use-cases/nas-webdav-transfer',
  'use-cases/cross-device-text-sync',
  'use-cases/local-http-api-automation',
  'use-cases/telegram-webdav-bridge',
  'compare/transfer-genie-vs-airdrop',
  'compare/transfer-genie-vs-wechat-file-transfer',
  'compare/transfer-genie-vs-syncthing',
  'reference/seo-ai-discovery',
  'reference/community-promo-kit',
  'reference/site-deployment',
  'reference/project-structure',
  'reference/code-architecture-flow',
  'develop/setup',
  'develop/build-and-release'
])
const faqStructuredData = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'Transfer Genie 是什么？',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Transfer Genie 是一个基于 WebDAV 的跨设备文件传输与文本同步桌面应用。它把一个 WebDAV 目录变成共享收件箱，适合在 Windows、macOS 和自托管存储之间传文本、文件和自动化结果。'
      }
    },
    {
      '@type': 'Question',
      name: 'Transfer Genie 适合替代什么？',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Transfer Genie 适合替代跨平台场景下的 AirDrop、聊天软件文件助手、只保留最近内容的剪贴板同步，也可以作为目录同步工具的轻量补充。'
      }
    },
    {
      '@type': 'Question',
      name: '能在 Windows 和 macOS 之间传文字吗？',
      acceptedAnswer: {
        '@type': 'Answer',
        text: '可以。你可以在一台设备发送文本、链接、Markdown 或命令片段，另一台设备同步后在同一条消息流里看到这些内容。'
      }
    },
    {
      '@type': 'Question',
      name: '能在 Windows 和 macOS 之间传文件吗？',
      acceptedAnswer: {
        '@type': 'Answer',
        text: '可以。Transfer Genie 会把文件上传到当前活动 WebDAV 端点，另一台设备同步后即可查看和下载。'
      }
    },
    {
      '@type': 'Question',
      name: '可以用 NAS WebDAV 传文件吗？',
      acceptedAnswer: {
        '@type': 'Answer',
        text: '可以。只要 NAS 提供可访问的 WebDAV 地址，你就可以在多台设备上配置同一个端点，把 NAS 变成 Transfer Genie 的自托管传输收件箱。'
      }
    },
    {
      '@type': 'Question',
      name: '能替代微信文件传输助手吗？',
      acceptedAnswer: {
        '@type': 'Answer',
        text: '如果你想把文件放在自己的 WebDAV 或 NAS 里，并且需要 Windows、macOS、历史记录、标签和本机 HTTP API 自动化，Transfer Genie 更适合作为微信文件传输助手的替代方案。'
      }
    },
    {
      '@type': 'Question',
      name: '能自动发送构建产物或日志吗？',
      acceptedAnswer: {
        '@type': 'Answer',
        text: '可以。Transfer Genie 内置本机 HTTP API，默认监听 127.0.0.1:6011，支持 POST /api/send-text 和 POST /api/send-file，适合脚本、定时任务或本地程序自动投递文本和文件。'
      }
    },
    {
      '@type': 'Question',
      name: '能把 Telegram 和 WebDAV 连起来吗？',
      acceptedAnswer: {
        '@type': 'Answer',
        text: '可以。Telegram Bridge 支持把 Telegram 会话中的文本和文件同步到 WebDAV，也可以把 WebDAV 中的新消息转发到 Telegram。'
      }
    },
    {
      '@type': 'Question',
      name: '需要自己搭服务器吗？',
      acceptedAnswer: {
        '@type': 'Answer',
        text: '不一定。只要你有一个可用的 WebDAV 端点即可。它可以来自 NAS、网盘服务、自建存储或其他支持 WebDAV 的服务。'
      }
    },
    {
      '@type': 'Question',
      name: 'What is Transfer Genie?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Transfer Genie is a WebDAV-based desktop app for cross-device file transfer and text sync.'
      }
    },
    {
      '@type': 'Question',
      name: 'Can it transfer files between Windows and macOS?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes. It uploads files to a WebDAV endpoint and lets another device sync and download them.'
      }
    },
    {
      '@type': 'Question',
      name: 'Can it use NAS WebDAV for file transfer?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes. If your NAS exposes a WebDAV endpoint, Transfer Genie can use it as the shared transfer inbox.'
      }
    },
    {
      '@type': 'Question',
      name: 'Is it a WeChat File Transfer alternative?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'It can be, especially when you want files to stay in your own WebDAV or NAS storage and need desktop history, tags, and local HTTP API automation.'
      }
    },
    {
      '@type': 'Question',
      name: 'Can it automate sending build artifacts or logs?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes. Use the local HTTP API to post text or files from scripts and scheduled jobs.'
      }
    },
    {
      '@type': 'Question',
      name: 'Can it bridge Telegram and WebDAV?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes. Telegram Bridge syncs Telegram messages and files with a WebDAV endpoint.'
      }
    }
  ]
}

function pageToUrl(page: string) {
  const path = page.replace(/(^|\/)index\.md$/, '').replace(/\.md$/, '')
  return new URL(path, siteUrl).href
}

function pagePath(page: string) {
  return page.replace(/(^|\/)index\.md$/, '').replace(/\.md$/, '')
}

function breadcrumbStructuredData(page: string) {
  const currentPath = pagePath(page)
  const segments = currentPath.split('/').filter(Boolean)
  const itemListElement = [
    {
      '@type': 'ListItem',
      position: 1,
      name: 'Transfer Genie',
      item: siteUrl
    }
  ]

  if (segments.length > 1) {
    const section = segments[0]
    itemListElement.push({
      '@type': 'ListItem',
      position: itemListElement.length + 1,
      name: sectionLabels[section] ?? section
    })
  }

  if (currentPath) {
    itemListElement.push({
      '@type': 'ListItem',
      position: itemListElement.length + 1,
      name: pageLabels[page] ?? segments[segments.length - 1] ?? 'Transfer Genie',
      item: pageToUrl(page)
    })
  }

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement
  }
}

export default defineConfig({
  title: siteTitle,
  description: siteDescription,
  lang: 'zh-CN',
  base,
  cleanUrls: true,
  lastUpdated: true,
  sitemap: {
    hostname: siteOrigin,
    transformItems(items) {
      return items.flatMap((item) => {
        const itemPath = item.url.replace(/^\//, '')

        if (!indexedPages.has(itemPath)) return []

        return {
          ...item,
          url: itemPath ? `${sitePath}/${itemPath}` : `${sitePath}/`
        }
      })
    }
  },
  transformHead({ page, title, description }) {
    const url = pageToUrl(page)
    const currentPath = pagePath(page)
    const head = [
      ['link', { rel: 'canonical', href: url }],
      ['meta', { property: 'og:title', content: title }],
      ['meta', { property: 'og:description', content: description }],
      ['meta', { property: 'og:url', content: url }],
      ['meta', { name: 'twitter:title', content: title }],
      ['meta', { name: 'twitter:description', content: description }],
      ['script', { type: 'application/ld+json' }, JSON.stringify(breadcrumbStructuredData(page))]
    ]

    if (!indexedPages.has(currentPath)) {
      head.push(['meta', { name: 'robots', content: 'noindex, follow' }])
    }

    if (page === 'faq.md') {
      head.push(['script', { type: 'application/ld+json' }, JSON.stringify(faqStructuredData)])
    }

    return head
  },
  head: [
    ['link', { rel: 'icon', type: 'image/png', href: `${base}favicon.png` }],
    ['link', { rel: 'alternate', type: 'text/plain', title: 'llms.txt', href: `${base}llms.txt` }],
    ['meta', { name: 'theme-color', content: '#0f766e' }],
    ['meta', { name: 'keywords', content: 'Transfer Genie, WebDAV 文件传输, 跨设备传文件, 文本同步, Tauri 桌面应用, Rust 桌面应用, HTTP API 自动化, Telegram Bridge, 自托管文件传输, Windows macOS 文件传输' }],
    ['meta', { name: 'robots', content: 'index, follow' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:site_name', content: 'Transfer Genie' }],
    ['meta', { property: 'og:image', content: `${siteUrl}logo.png` }],
    ['meta', { name: 'twitter:card', content: 'summary' }],
    ['script', { type: 'application/ld+json' }, JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'Transfer Genie',
      alternateName: '传输小精灵',
      applicationCategory: 'UtilitiesApplication',
      applicationSubCategory: 'File transfer utility',
      operatingSystem: 'Windows, macOS',
      description: siteDescription,
      url: siteUrl,
      sameAs: [githubRepo, giteeRepo],
      downloadUrl: 'https://github.com/yedsn/transfer-genie/releases/latest',
      codeRepository: githubRepo,
      license: 'https://www.gnu.org/licenses/agpl-3.0.html',
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD'
      },
      programmingLanguage: ['Rust', 'JavaScript'],
      keywords: [
        'WebDAV file transfer',
        'cross-device file transfer',
        'NAS WebDAV file transfer',
        'WeChat File Transfer alternative',
        'text sync',
        'self-hosted transfer tool',
        'Telegram WebDAV bridge',
        'local HTTP API automation'
      ]
    })]
  ],
  themeConfig: {
    logo: '/logo.png',
    nav: [
      { text: '首页', link: '/' },
      { text: '下载', link: '/download' },
      { text: '使用说明', link: '/guide/quick-start' },
      { text: '使用场景', link: '/use-cases/webdav-file-transfer' },
      { text: '对比', link: '/compare/transfer-genie-vs-airdrop' },
      { text: 'FAQ', link: '/faq' },
      { text: 'SEO 清单', link: '/reference/seo-ai-discovery' },
      { text: '开发文档', link: '/develop/setup' },
      { text: 'GitHub', link: githubRepo }
    ],
    sidebar: {
      '/guide/': [
        {
          text: '使用说明',
          items: [
            { text: '快速开始', link: '/guide/quick-start' },
            { text: '下载', link: '/download' },
            { text: '下载安装', link: '/guide/installation' },
            { text: '第一次传输', link: '/guide/first-sync' }
          ]
        },
        {
          text: '扩展接入',
          items: [
            { text: '本机 HTTP API', link: '/integrations/http-api' },
            { text: 'Telegram Bridge', link: '/integrations/telegram-bridge' }
          ]
        },
        {
          text: '使用场景',
          items: [
            { text: 'WebDAV 跨设备传文件', link: '/use-cases/webdav-file-transfer' },
            { text: 'NAS WebDAV 传输', link: '/use-cases/nas-webdav-transfer' },
            { text: '跨设备文本同步', link: '/use-cases/cross-device-text-sync' },
            { text: 'HTTP API 自动化发送', link: '/use-cases/local-http-api-automation' },
            { text: 'Telegram 与 WebDAV 同步', link: '/use-cases/telegram-webdav-bridge' }
          ]
        },
        {
          text: '对比',
          items: [
            { text: '对比 AirDrop', link: '/compare/transfer-genie-vs-airdrop' },
            { text: '对比微信文件传输助手', link: '/compare/transfer-genie-vs-wechat-file-transfer' },
            { text: '对比 Syncthing', link: '/compare/transfer-genie-vs-syncthing' }
          ]
        }
      ],
      '/integrations/': [
        {
          text: '使用说明',
          items: [
            { text: '快速开始', link: '/guide/quick-start' },
            { text: '下载', link: '/download' },
            { text: '下载安装', link: '/guide/installation' },
            { text: '第一次传输', link: '/guide/first-sync' }
          ]
        },
        {
          text: '扩展接入',
          items: [
            { text: '本机 HTTP API', link: '/integrations/http-api' },
            { text: 'Telegram Bridge', link: '/integrations/telegram-bridge' }
          ]
        },
        {
          text: '使用场景',
          items: [
            { text: 'WebDAV 跨设备传文件', link: '/use-cases/webdav-file-transfer' },
            { text: 'NAS WebDAV 传输', link: '/use-cases/nas-webdav-transfer' },
            { text: '跨设备文本同步', link: '/use-cases/cross-device-text-sync' },
            { text: 'HTTP API 自动化发送', link: '/use-cases/local-http-api-automation' },
            { text: 'Telegram 与 WebDAV 同步', link: '/use-cases/telegram-webdav-bridge' }
          ]
        },
        {
          text: '对比',
          items: [
            { text: '对比 AirDrop', link: '/compare/transfer-genie-vs-airdrop' },
            { text: '对比微信文件传输助手', link: '/compare/transfer-genie-vs-wechat-file-transfer' },
            { text: '对比 Syncthing', link: '/compare/transfer-genie-vs-syncthing' }
          ]
        }
      ],
      '/use-cases/': [
        {
          text: '使用场景',
          items: [
            { text: 'WebDAV 跨设备传文件', link: '/use-cases/webdav-file-transfer' },
            { text: 'NAS WebDAV 传输', link: '/use-cases/nas-webdav-transfer' },
            { text: '跨设备文本同步', link: '/use-cases/cross-device-text-sync' },
            { text: 'HTTP API 自动化发送', link: '/use-cases/local-http-api-automation' },
            { text: 'Telegram 与 WebDAV 同步', link: '/use-cases/telegram-webdav-bridge' }
          ]
        },
        {
          text: '继续阅读',
          items: [
            { text: '下载', link: '/download' },
            { text: '下载安装', link: '/guide/installation' },
            { text: '第一次传输', link: '/guide/first-sync' },
            { text: '本机 HTTP API', link: '/integrations/http-api' },
            { text: 'Telegram Bridge', link: '/integrations/telegram-bridge' }
          ]
        }
      ],
      '/compare/': [
        {
          text: '对比',
          items: [
            { text: '对比 AirDrop', link: '/compare/transfer-genie-vs-airdrop' },
            { text: '对比微信文件传输助手', link: '/compare/transfer-genie-vs-wechat-file-transfer' },
            { text: '对比 Syncthing', link: '/compare/transfer-genie-vs-syncthing' }
          ]
        },
        {
          text: '继续阅读',
          items: [
            { text: 'WebDAV 跨设备传文件', link: '/use-cases/webdav-file-transfer' },
            { text: 'NAS WebDAV 传输', link: '/use-cases/nas-webdav-transfer' },
            { text: '跨设备文本同步', link: '/use-cases/cross-device-text-sync' },
            { text: 'HTTP API 自动化发送', link: '/use-cases/local-http-api-automation' },
            { text: '下载安装', link: '/guide/installation' }
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
      '/reference/': [
        {
          text: '参考',
          items: [
            { text: '项目结构', link: '/reference/project-structure' },
            { text: '代码架构与流程', link: '/reference/code-architecture-flow' },
            { text: '站点与发布说明', link: '/reference/site-deployment' },
            { text: 'SEO 与 AI 收录', link: '/reference/seo-ai-discovery' },
            { text: '社区发布文案包', link: '/reference/community-promo-kit' }
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
