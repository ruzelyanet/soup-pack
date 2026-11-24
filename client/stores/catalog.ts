import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api, qs } from '@/services/api'
import type { Banner, Category, HomeSection, OrderSet, Product, ShopContact, SoupVariant } from '@/types'

export interface DeliveryMethodOption {
    id: number
    name: string
    code: string
    price: number
    sort: number
    description?: string | null
    /** Превью лучшей активной скидки, если есть. */
    preview?: {
        benefitType: 'percent' | 'fixed_amount' | 'fixed_price'
        benefitValue: number
        label?: string
        minSubtotal?: number | null
    } | null
}

/** По slug подставить SoupPuck variant + tint (на бэке их пока нет). */
function enrich(p: Product): Product {
    const map: Record<string, { variant: SoupVariant; tint: Product['tint'] }> = {
        'tom-yam':        { variant: 'tom-yam',        tint: 'tom' },
        'chicken-noodle': { variant: 'chicken-noodle', tint: 'chi' },
        'pumpkin-cream':  { variant: 'pumpkin-cream',  tint: 'pum' },
        'lentil':         { variant: 'lentil',         tint: 'len' },
        'spaghetti':      { variant: 'spaghetti',      tint: 'spa' },
        'cola':           { variant: 'cola',           tint: 'col' },
    }
    const m = map[p.slug]
    return m ? { ...p, variant: m.variant, tint: m.tint } : p
}

export const useCatalog = defineStore('catalog', () => {
    const categories = ref<Category[]>([])
    const products   = ref<Product[]>([])
    const sets       = ref<OrderSet[]>([])
    const banners    = ref<Banner[]>([])
    const homeSections = ref<HomeSection[]>([])
    const deliveryMethods = ref<DeliveryMethodOption[]>([])
    const contact    = ref<ShopContact>({ phone: '', workHours: '', city: '' })
    const loading    = ref(false)
    const error      = ref<string | null>(null)
    const loaded     = ref(false)

    async function fetchAll(force = false) {
        if (loaded.value && !force) return
        loading.value = true
        error.value = null
        try {
            const [cRes, pRes, sRes, bRes, hRes, ctRes, dmRes] = await Promise.all([
                api.get('/categories' + qs({ sort: 'sort:asc', 'pagination[pageSize]': 100 })),
                api.get('/products' + qs({
                    populate: ['category', 'image', 'gallery'],
                    sort: 'id:asc',
                    'pagination[pageSize]': 100,
                })),
                api.get('/order-sets' + qs({
                    populate: { items: { populate: { product: { populate: ['image'] } } } },
                    sort: 'createdAt:desc',
                    'pagination[pageSize]': 50,
                })),
                api.get('/banners' + qs({
                    populate: ['image'],
                    sort: 'sort:asc',
                    'filters[active][$eq]': true,
                    'pagination[pageSize]': 50,
                })),
                api.get('/home-sections' + qs({
                    populate: {
                        category: true,
                        products: { populate: ['category', 'image', 'gallery'] },
                    },
                    sort: 'sort:asc',
                    'filters[visible][$eq]': true,
                    'pagination[pageSize]': 50,
                })).catch(() => ({ data: { data: [] } })),
                api.get('/shop-contact').catch(() => ({ data: { data: null } })),
                api.get('/delivery-methods' + qs({
                    sort: 'sort:asc',
                    'filters[active][$eq]': true,
                    'pagination[pageSize]': 50,
                })).catch(() => ({ data: { data: [] } })),
            ])

            categories.value = (cRes.data?.data ?? []) as Category[]
            products.value   = ((pRes.data?.data ?? []) as Product[]).map(enrich)
            banners.value    = (bRes.data?.data ?? []) as Banner[]
            homeSections.value = ((hRes.data?.data ?? []) as HomeSection[]).map(h => ({
                ...h,
                products: (h.products || []).map(enrich),
            }))
            const ct = ctRes.data?.data
            contact.value = {
                phone:     ct?.phone     || '',
                workHours: ct?.workHours || '',
                city:      ct?.city      || '',
            }
            deliveryMethods.value = ((dmRes.data?.data ?? []) as any[]).map((m: any) => ({
                id: m.id,
                name: m.name,
                code: m.code,
                price: Number(m.price || 0),
                sort: Number(m.sort || 0),
                description: m.description || null,
                preview: m.preview || null,
            }))
            sets.value = ((sRes.data?.data ?? []) as any[]).map((s: any) => ({
                id: s.id,
                name: s.name,
                slug: s.slug,
                description: s.description,
                items: (s.items ?? []).map((it: any) => ({
                    product: enrich(it.product as Product),
                    qty: it.qty,
                })),
                pricing: s.pricing || null,
            }))
            loaded.value = true
        } catch (e: any) {
            error.value = e?.message || 'Не удалось загрузить каталог'
        } finally {
            loading.value = false
        }
    }

    function findBySlug(slug: string) {
        return products.value.find((p) => p.slug === slug) || null
    }

    /** Чистые цифры номера для href="tel:…" (`+998 (90) 000-00-00` → `+998900000000`). */
    const phoneTel = computed(() => {
        const raw = (contact.value.phone || '').trim()
        if (!raw) return ''
        const plus = raw.startsWith('+') ? '+' : ''
        return plus + raw.replace(/\D/g, '')
    })

    // В Nuxt авто-fetch при импорте выполнится на сервере и дважды на клиенте.
    // Подгрузку инициирует plugins/catalog.client.ts или страница через useAsyncData.

    return { categories, products, sets, banners, homeSections, deliveryMethods, contact, phoneTel, loading, error, fetchAll, findBySlug }
})
