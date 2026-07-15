import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const distDir = path.join(root, 'docs', '.vitepress', 'dist')
const siteUrl = 'https://yedsn.github.io/transfer-genie/'

const requiredFiles = [
  'index.html',
  'robots.txt',
  'sitemap.xml',
  'llms.txt',
  'llms-full.txt',
  'download.html',
  'faq.html',
  'guide/installation.html',
  'integrations/http-api.html',
  'integrations/telegram-bridge.html',
  'use-cases/webdav-file-transfer.html',
  'use-cases/nas-webdav-transfer.html',
  'use-cases/cross-device-text-sync.html',
  'use-cases/local-http-api-automation.html',
  'use-cases/telegram-webdav-bridge.html',
  'compare/transfer-genie-vs-airdrop.html',
  'compare/transfer-genie-vs-wechat-file-transfer.html',
  'compare/transfer-genie-vs-syncthing.html',
  'reference/seo-ai-discovery.html',
  'reference/community-promo-kit.html'
]

const requiredSitemapUrls = [
  siteUrl,
  `${siteUrl}download`,
  `${siteUrl}faq`,
  `${siteUrl}guide/installation`,
  `${siteUrl}integrations/http-api`,
  `${siteUrl}integrations/telegram-bridge`,
  `${siteUrl}use-cases/webdav-file-transfer`,
  `${siteUrl}use-cases/nas-webdav-transfer`,
  `${siteUrl}use-cases/cross-device-text-sync`,
  `${siteUrl}use-cases/local-http-api-automation`,
  `${siteUrl}use-cases/telegram-webdav-bridge`,
  `${siteUrl}compare/transfer-genie-vs-airdrop`,
  `${siteUrl}compare/transfer-genie-vs-wechat-file-transfer`,
  `${siteUrl}compare/transfer-genie-vs-syncthing`,
  `${siteUrl}reference/seo-ai-discovery`,
  `${siteUrl}reference/community-promo-kit`
]

const forbiddenSitemapUrls = [
  `${siteUrl}develop/refactor-baseline`,
  `${siteUrl}develop/refactor-progress-2026-05-25`,
  `${siteUrl}develop/refactor-verification-2026-05-26`,
  `${siteUrl}frontend-architecture-refactor`,
  `${siteUrl}guide/setup`,
  `${siteUrl}setup`
]

const noindexFiles = [
  'develop/refactor-baseline.html',
  'develop/refactor-progress-2026-05-25.html',
  'develop/refactor-verification-2026-05-26.html',
  'frontend-architecture-refactor.html',
  'guide/setup.html',
  'setup.html'
]

const requiredLlmSnippets = [
  'Transfer Genie',
  'WebDAV file transfer',
  'cross-device file transfer',
  'Local HTTP API',
  'FAQ',
  'Telegram Bridge',
  'Transfer Genie download',
  'NAS WebDAV file transfer',
  'WeChat File Transfer alternative',
  '微信文件传输助手替代',
  'transfer-genie-vs-airdrop',
  'transfer-genie-vs-wechat-file-transfer',
  'transfer-genie-vs-syncthing',
  'README.en.md'
]

const htmlChecks = [
  ['index.html', 'Transfer Genie 是基于 WebDAV 的跨设备文件传输与文本同步工具'],
  ['download.html', 'Transfer Genie 下载'],
  ['faq.html', 'What is Transfer Genie?'],
  ['integrations/http-api.html', 'POST /api/send-text'],
  ['integrations/telegram-bridge.html', 'Telegram Bridge'],
  ['use-cases/webdav-file-transfer.html', 'WebDAV 变成跨设备文件传输收件箱'],
  ['use-cases/nas-webdav-transfer.html', '用 NAS WebDAV 做自托管传输收件箱'],
  ['compare/transfer-genie-vs-airdrop.html', 'AirDrop 替代'],
  ['compare/transfer-genie-vs-wechat-file-transfer.html', '微信文件传输助手'],
  ['compare/transfer-genie-vs-syncthing.html', '消息流传输'],
  ['reference/seo-ai-discovery.html', 'SEO 与 AI 收录操作清单'],
  ['reference/community-promo-kit.html', '社区发布文案包']
]

const requiredFaqQuestions = [
  'Transfer Genie 是什么？',
  '能在 Windows 和 macOS 之间传文件吗？',
  '可以用 NAS WebDAV 传文件吗？',
  '能替代微信文件传输助手吗？',
  '能把 Telegram 和 WebDAV 连起来吗？',
  'What is Transfer Genie?',
  'Can it transfer files between Windows and macOS?',
  'Can it use NAS WebDAV for file transfer?',
  'Is it a WeChat File Transfer alternative?',
  'Can it automate sending build artifacts or logs?',
  'Can it bridge Telegram and WebDAV?'
]

const requiredSoftwareKeywords = [
  'WebDAV file transfer',
  'cross-device file transfer',
  'NAS WebDAV file transfer',
  'WeChat File Transfer alternative',
  'Telegram WebDAV bridge',
  'local HTTP API automation'
]

const breadcrumbChecks = [
  ['index.html', ['Transfer Genie']],
  ['download.html', ['Transfer Genie', '下载']],
  ['faq.html', ['Transfer Genie', '常见问题']],
  ['use-cases/nas-webdav-transfer.html', ['Transfer Genie', '使用场景', 'NAS WebDAV 传输']],
  ['compare/transfer-genie-vs-wechat-file-transfer.html', ['Transfer Genie', '对比', '对比微信文件传输助手']],
  ['reference/seo-ai-discovery.html', ['Transfer Genie', '参考', 'SEO 与 AI 收录']]
]

const failures = []

function readDistFile(relativePath) {
  const filePath = path.join(distDir, relativePath)

  if (!fs.existsSync(filePath)) {
    failures.push(`Missing file: ${relativePath}`)
    return ''
  }

  return fs.readFileSync(filePath, 'utf8')
}

for (const file of requiredFiles) {
  const filePath = path.join(distDir, file)
  if (!fs.existsSync(filePath)) failures.push(`Missing file: ${file}`)
}

const robots = readDistFile('robots.txt')
if (!robots.includes('Allow: /')) failures.push('robots.txt should allow crawling')
if (!robots.includes(`${siteUrl}sitemap.xml`)) failures.push('robots.txt should point to the production sitemap URL')

const sitemap = readDistFile('sitemap.xml')
for (const url of requiredSitemapUrls) {
  if (!sitemap.includes(`<loc>${url}</loc>`)) failures.push(`sitemap.xml missing URL: ${url}`)
}
for (const url of forbiddenSitemapUrls) {
  if (sitemap.includes(`<loc>${url}</loc>`)) failures.push(`sitemap.xml should not include internal URL: ${url}`)
}
if (sitemap.includes('https://yedsn.github.io/guide/')) {
  failures.push('sitemap.xml contains URLs without /transfer-genie/ prefix')
}

for (const file of noindexFiles) {
  const html = readDistFile(file)
  if (!html.includes('name="robots" content="noindex, follow"')) failures.push(`${file} should be noindex, follow`)
}

const llms = `${readDistFile('llms.txt')}\n${readDistFile('llms-full.txt')}`
for (const snippet of requiredLlmSnippets) {
  if (!llms.includes(snippet)) failures.push(`llms files missing snippet: ${snippet}`)
}

for (const [file, expectedSnippet] of htmlChecks) {
  const html = readDistFile(file)
  if (!html.includes('<meta name="description"')) failures.push(`${file} missing meta description`)
  if (!html.includes('property="og:title"')) failures.push(`${file} missing og:title`)
  if (!html.includes('property="og:description"')) failures.push(`${file} missing og:description`)
  if (!html.includes('rel="canonical"')) failures.push(`${file} missing canonical link`)
  if (file === 'faq.html' && !html.includes('FAQPage')) failures.push('faq.html missing FAQPage structured data')
  if (file === 'faq.html' && !html.includes('Can it transfer files between Windows and macOS?')) failures.push('faq.html missing English FAQ content')
  if (!html.includes(expectedSnippet)) failures.push(`${file} missing expected page content: ${expectedSnippet}`)
}

const faqHtml = readDistFile('faq.html')
const faqPage = parseJsonLd(faqHtml).find((item) => item?.['@type'] === 'FAQPage')

if (!faqPage) {
  failures.push('faq.html missing parseable FAQPage JSON-LD')
} else {
  const questions = new Set((faqPage.mainEntity ?? []).map((item) => item.name))

  for (const question of requiredFaqQuestions) {
    if (!questions.has(question)) failures.push(`FAQPage JSON-LD missing question: ${question}`)
  }
}

const homeStructuredData = parseJsonLd(readDistFile('index.html'))
const softwareApplication = homeStructuredData.find((item) => item?.['@type'] === 'SoftwareApplication')

if (!softwareApplication) {
  failures.push('index.html missing parseable SoftwareApplication JSON-LD')
} else {
  if (softwareApplication.name !== 'Transfer Genie') failures.push('SoftwareApplication name should be Transfer Genie')
  if (softwareApplication.url !== siteUrl) failures.push('SoftwareApplication URL should match production site URL')
  if (softwareApplication.downloadUrl !== 'https://github.com/yedsn/transfer-genie/releases/latest') {
    failures.push('SoftwareApplication missing GitHub Releases downloadUrl')
  }
  if (!Array.isArray(softwareApplication.sameAs) || !softwareApplication.sameAs.includes('https://github.com/yedsn/transfer-genie')) {
    failures.push('SoftwareApplication sameAs should include GitHub repository')
  }
  if (softwareApplication.offers?.price !== '0') failures.push('SoftwareApplication should include a free Offer')

  const keywords = new Set(softwareApplication.keywords ?? [])
  for (const keyword of requiredSoftwareKeywords) {
    if (!keywords.has(keyword)) failures.push(`SoftwareApplication keywords missing: ${keyword}`)
  }
}

for (const [file, expectedNames] of breadcrumbChecks) {
  const breadcrumb = parseJsonLd(readDistFile(file)).find((item) => item?.['@type'] === 'BreadcrumbList')

  if (!breadcrumb) {
    failures.push(`${file} missing parseable BreadcrumbList JSON-LD`)
    continue
  }

  const names = (breadcrumb.itemListElement ?? []).map((item) => item.name)
  for (const expectedName of expectedNames) {
    if (!names.includes(expectedName)) failures.push(`${file} BreadcrumbList missing name: ${expectedName}`)
  }
}

if (failures.length > 0) {
  console.error('Docs SEO verification failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('Docs SEO verification passed.')

function parseJsonLd(html) {
  const matches = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]

  return matches
    .map((match) => {
      try {
        return JSON.parse(match[1])
      } catch {
        return null
      }
    })
    .filter(Boolean)
}
