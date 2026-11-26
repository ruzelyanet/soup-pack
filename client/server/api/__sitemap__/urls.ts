/**
 * Динамические URL для sitemap.xml: товары, категории, наборы.
 * Раньше при любой ошибке запроса к API молча возвращался пустой список — и в карте сайта
 * не было ни одного товара. Теперь пробуем все известные адреса API по очереди и пишем ошибку в лог.
 */
type SitemapUrl = { loc: string; changefreq?: 'daily' | 'weekly' | 'monthly'; priority?: number; lastmod?: string }

export default defineEventHandler(async (): Promise<SitemapUrl[]> => {
    const cfg = useRuntimeConfig()
    const strip = (u?: string) => String(u || '').trim().replace(/\/+$/, '').replace(/\/api$/, '')
    // Внутренний адрес (если задан), публичный из runtimeConfig и тот же, что использует services/api.ts.
    const bases = [...new Set([
        strip(cfg.apiUrlInternal as string),
        strip(cfg.public.apiUrl as string),
        strip(process.env.NUXT_PUBLIC_API_URL),
        strip(process.env.VITE_API_URL),
    ].filter(Boolean))]
    const token = (cfg.apiToken as string) || (cfg.public.apiToken as string) || process.env.NUXT_PUBLIC_API_TOKEN || ''
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}

    const fetchRows = async (collection: string): Promise<Array<{ slug?: string; updatedAt?: string }>> => {
        const errors: string[] = []
        for (const base of bases) {
            try {
                const res = await $fetch<{ data: Array<{ slug?: string; updatedAt?: string }> }>(
                    `${base}/api/${collection}`,
                    { headers, query: { 'pagination[pageSize]': 500, 'fields[0]': 'slug', 'fields[1]': 'updatedAt' }, timeout: 8000 },
                )
                return res.data || []
            } catch (e: any) {
                errors.push(`${base}: ${e?.statusCode || ''} ${e?.message || e}`)
            }
        }
        console.error(`[sitemap] не удалось получить ${collection}:`, errors.join(' | ') || 'нет адреса API')
        return []
    }

    const [products, categories, sets] = await Promise.all([
        fetchRows('products'),
        fetchRows('categories'),
        fetchRows('order-sets'),
    ])
    const lastmod = (r: { updatedAt?: string }) => (r.updatedAt ? { lastmod: r.updatedAt } : {})

    return [
        ...products.filter((r) => r.slug).map((r) => ({ loc: `/product/${r.slug}`, changefreq: 'weekly' as const, priority: 0.8, ...lastmod(r) })),
        ...categories.filter((r) => r.slug).map((r) => ({ loc: `/category/${r.slug}`, changefreq: 'weekly' as const, priority: 0.7, ...lastmod(r) })),
        ...sets.filter((r) => r.slug).map((r) => ({ loc: `/set/${r.slug}`, changefreq: 'weekly' as const, priority: 0.8, ...lastmod(r) })),
    ]
})
