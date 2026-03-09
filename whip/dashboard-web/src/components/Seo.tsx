import { useEffect } from 'react'
import { siteMeta } from '../content/site'
import { trackPageView } from '../lib/analytics'

interface SeoProps {
  title: string
  description: string
  path?: string
  type?: string
  keywords?: string[]
  noindex?: boolean
  imagePath?: string
  jsonLd?: Record<string, unknown> | Record<string, unknown>[]
}

function ensureMeta(selector: string, create: () => HTMLElement): HTMLElement {
  const existing = document.head.querySelector<HTMLElement>(selector)
  if (existing) return existing
  const element = create()
  document.head.appendChild(element)
  return element
}

function setMeta(selector: string, attr: 'name' | 'property', key: string, value: string) {
  const meta = ensureMeta(selector, () => {
    const el = document.createElement('meta')
    el.setAttribute(attr, key)
    return el
  }) as HTMLMetaElement
  meta.content = value
}

export function Seo({
  title,
  description,
  path = '/',
  type = 'website',
  keywords,
  noindex,
  imagePath = siteMeta.ogImagePath,
  jsonLd,
}: SeoProps) {
  useEffect(() => {
    const fullTitle = `${title} · ai-tools`
    const url = new URL(path, siteMeta.origin).toString()
    const imageURL = new URL(imagePath, siteMeta.origin).toString()

    document.title = fullTitle

    setMeta('meta[name="description"]', 'name', 'description', description)
    setMeta('meta[name="author"]', 'name', 'author', 'Airen Kang')
    setMeta('meta[property="og:title"]', 'property', 'og:title', fullTitle)
    setMeta('meta[property="og:description"]', 'property', 'og:description', description)
    setMeta('meta[property="og:type"]', 'property', 'og:type', type)
    setMeta('meta[property="og:url"]', 'property', 'og:url', url)
    setMeta('meta[property="og:site_name"]', 'property', 'og:site_name', siteMeta.name)
    setMeta('meta[property="og:image"]', 'property', 'og:image', imageURL)
    setMeta('meta[property="og:image:alt"]', 'property', 'og:image:alt', 'whip inside ai-tools')
    setMeta('meta[name="twitter:card"]', 'name', 'twitter:card', 'summary')
    setMeta('meta[name="twitter:title"]', 'name', 'twitter:title', fullTitle)
    setMeta('meta[name="twitter:description"]', 'name', 'twitter:description', description)
    setMeta('meta[name="twitter:image"]', 'name', 'twitter:image', imageURL)
    setMeta('meta[name="robots"]', 'name', 'robots', noindex ? 'noindex, nofollow' : 'index, follow')
    if (keywords && keywords.length > 0) {
      setMeta('meta[name="keywords"]', 'name', 'keywords', keywords.join(', '))
    }

    const canonical = ensureMeta('link[rel="canonical"]', () => {
      const el = document.createElement('link')
      el.setAttribute('rel', 'canonical')
      return el
    }) as HTMLLinkElement
    canonical.href = url

    const existingScripts = Array.from(document.head.querySelectorAll('script[data-seo-json-ld="true"]'))
    existingScripts.forEach(script => script.remove())

    const payloads = Array.isArray(jsonLd) ? jsonLd : jsonLd ? [jsonLd] : []
    payloads.forEach(payload => {
      const script = document.createElement('script')
      script.type = 'application/ld+json'
      script.dataset.seoJsonLd = 'true'
      script.text = JSON.stringify(payload)
      document.head.appendChild(script)
    })

    trackPageView(path, fullTitle, url)
  }, [description, imagePath, jsonLd, keywords, noindex, path, title, type])

  return null
}
