#!/usr/bin/env node
/**
 * Prebuild: тянем список продуктов и категорий из Strapi, собираем sitemap.xml.
 * Если API недоступен — оставляем статический sitemap как есть.
 */
import fs from 'node:fs'
import path from 'node:path'

const API = (process.env.VITE_API_URL || 'https://api.soup-pack.uz').replace(/\/+$/, '')
const BASE = 'https://soup-pack.uz'
const OUT = path.resolve('public/sitemap.xml')

const staticUrls = [
    { loc: '/',          changefreq: 'daily',   priority: '1.0' },
    { loc: '/about',     changefreq: 'monthly', priority: '0.7' },
    { loc: '/chef',      changefreq: 'monthly', priority: '0.7' },
    { loc: '/delivery',  changefreq: 'monthly', priority: '0.8' },
    { loc: '/discounts', changefreq: 'weekly',  priority: '0.8' },
    { loc: '/sets',      changefreq: 'weekly',  priority: '0.8' },
]

async function fetchSlugs(endpoint) {
    try {
        const url = `${API}/${endpoint}?fields[0]=slug&pagination[pageSize]=200`
        const r = await fetch(url, { signal: AbortSignal.timeout(8000) })
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const data = await r.json()
        return (data?.data || [])
            .map((x) => x?.slug ?? x?.attributes?.slug)
            .filter(Boolean)
    } catch (e) {
        console.warn(`[sitemap] ${endpoint} failed: ${e.message} — пропускаю`)
        return []
    }
}

const [products, categories, sets] = await Promise.all([
    fetchSlugs('products'),
    fetchSlugs('categories'),
    fetchSlugs('sets'),
])

const urls = [
    ...staticUrls,
    ...categories.map((s) => ({ loc: `/category/${s}`, changefreq: 'weekly',  priority: '0.7' })),
    ...sets.map((s) =>       ({ loc: `/set/${s}`,      changefreq: 'weekly',  priority: '0.8' })),
    ...products.map((s) =>   ({ loc: `/product/${s}`,  changefreq: 'weekly',  priority: '0.9' })),
]

const body = urls
    .map((u) => `    <url>\n        <loc>${BASE}${u.loc}</loc>\n        <changefreq>${u.changefreq}</changefreq>\n        <priority>${u.priority}</priority>\n    </url>`)
    .join('\n')

const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`

fs.writeFileSync(OUT, xml)
console.log(`[sitemap] ${urls.length} urls → ${OUT}`)
