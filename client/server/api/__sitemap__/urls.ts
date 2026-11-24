import type { SitemapUrlInput } from '@nuxtjs/sitemap/runtime'

export default defineEventHandler(async (): Promise<SitemapUrlInput[]> => {
    const cfg = useRuntimeConfig()
    const base = ((cfg.apiUrlInternal as string) || (cfg.public.apiUrl as string)).replace(/\/api\/?$/, '')
    const token = (cfg.apiToken as string) || (cfg.public.apiToken as string)
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}

    const fetchSlugs = async (collection: string) => {
        try {
            const res = await $fetch<{ data: Array<{ slug?: string }> }>(
                `${base}/api/${collection}?pagination[pageSize]=200&fields[0]=slug`,
                { headers },
            )
            return (res.data || []).map((x) => x.slug).filter(Boolean) as string[]
        } catch {
            return []
        }
    }

    const [products, categories, sets] = await Promise.all([
        fetchSlugs('products'),
        fetchSlugs('categories'),
        fetchSlugs('order-sets'),
    ])

    return [
        ...products.map((s) => ({ loc: `/product/${s}`, changefreq: 'weekly' as const, priority: 0.8 })),
        ...categories.map((s) => ({ loc: `/category/${s}`, changefreq: 'weekly' as const, priority: 0.7 })),
        ...sets.map((s) => ({ loc: `/set/${s}`, changefreq: 'weekly' as const, priority: 0.8 })),
    ]
})
