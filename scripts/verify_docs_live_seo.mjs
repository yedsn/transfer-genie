const defaultSiteUrl = 'https://yedsn.github.io/transfer-genie/'
const siteUrl = normalizeSiteUrl(process.env.SITE_URL ?? defaultSiteUrl)

const pageChecks = [
  {
    path: '',
    snippets: [
      'Transfer Genie',
      '基于 WebDAV 的跨设备文件传输与文本同步工具',
      'SoftwareApplication'
    ]
  },
  {
    path: 'robots.txt',
    snippets: [
      'Allow: /',
      `${siteUrl}sitemap.xml`
    ]
  },
  {
    path: 'sitemap.xml',
    snippets: [
      `<loc>${siteUrl}</loc>`,
      `<loc>${siteUrl}download</loc>`,
      `<loc>${siteUrl}faq</loc>`,
      `<loc>${siteUrl}integrations/http-api</loc>`,
      `<loc>${siteUrl}integrations/telegram-bridge</loc>`,
      `<loc>${siteUrl}use-cases/webdav-file-transfer</loc>`,
      `<loc>${siteUrl}use-cases/nas-webdav-transfer</loc>`,
      `<loc>${siteUrl}use-cases/cross-device-text-sync</loc>`,
      `<loc>${siteUrl}use-cases/local-http-api-automation</loc>`,
      `<loc>${siteUrl}use-cases/telegram-webdav-bridge</loc>`,
      `<loc>${siteUrl}compare/transfer-genie-vs-airdrop</loc>`,
      `<loc>${siteUrl}compare/transfer-genie-vs-wechat-file-transfer</loc>`,
      `<loc>${siteUrl}compare/transfer-genie-vs-syncthing</loc>`
    ]
  },
  {
    path: 'llms.txt',
    snippets: [
      'Transfer Genie',
      'WebDAV file transfer',
      'cross-device file transfer',
      'Local HTTP API',
      'Telegram Bridge',
      'NAS WebDAV file transfer',
      'WeChat File Transfer alternative'
    ]
  },
  {
    path: 'llms-full.txt',
    snippets: [
      'Transfer Genie',
      '基于 WebDAV',
      'Transfer Genie 下载',
      '微信文件传输助手替代',
      'What is Transfer Genie?',
      'Can it transfer files between Windows and macOS?'
    ]
  },
  {
    path: 'faq',
    snippets: [
      'FAQPage',
      'What is Transfer Genie?',
      'Can it transfer files between Windows and macOS?',
      'Can it use NAS WebDAV for file transfer?',
      'Is it a WeChat File Transfer alternative?',
      '能替代微信文件传输助手吗？',
      '能把 Telegram 和 WebDAV 连起来吗？'
    ]
  },
  {
    path: 'download',
    snippets: ['Transfer Genie 下载', 'GitHub Releases']
  },
  {
    path: 'use-cases/webdav-file-transfer',
    snippets: ['WebDAV 变成跨设备文件传输收件箱']
  },
  {
    path: 'use-cases/nas-webdav-transfer',
    snippets: ['用 NAS WebDAV 做自托管传输收件箱']
  },
  {
    path: 'use-cases/cross-device-text-sync',
    snippets: ['跨设备文本同步']
  },
  {
    path: 'use-cases/local-http-api-automation',
    snippets: ['Local HTTP API']
  },
  {
    path: 'use-cases/telegram-webdav-bridge',
    snippets: ['Telegram Bridge']
  },
  {
    path: 'compare/transfer-genie-vs-airdrop',
    snippets: ['AirDrop 替代', 'Transfer Genie']
  },
  {
    path: 'compare/transfer-genie-vs-wechat-file-transfer',
    snippets: ['微信文件传输助手', 'Transfer Genie']
  },
  {
    path: 'compare/transfer-genie-vs-syncthing',
    snippets: ['Syncthing', '消息流传输']
  }
]

const failures = []

for (const check of pageChecks) {
  const url = new URL(check.path, siteUrl).href
  const html = await fetchText(url)

  if (!html) continue

  for (const snippet of check.snippets) {
    if (!html.includes(snippet)) failures.push(`${url} missing snippet: ${snippet}`)
  }
}

if (failures.length > 0) {
  console.error(`Live docs SEO verification failed for ${siteUrl}`)
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(`Live docs SEO verification passed for ${siteUrl}`)

async function fetchText(url) {
  try {
    const response = await fetch(url, {
      headers: {
        'user-agent': 'transfer-genie-seo-check/1.0'
      },
      signal: AbortSignal.timeout(15000)
    })

    if (!response.ok) {
      failures.push(`${url} returned HTTP ${response.status}`)
      return ''
    }

    return await response.text()
  } catch (error) {
    failures.push(`${url} request failed: ${error.message}`)
    return ''
  }
}

function normalizeSiteUrl(value) {
  const parsedUrl = new URL(value)
  if (!parsedUrl.pathname.endsWith('/')) parsedUrl.pathname = `${parsedUrl.pathname}/`
  return parsedUrl.href
}
