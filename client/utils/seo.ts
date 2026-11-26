/** Общие SEO-тексты и картинки превью ссылок (Telegram, WhatsApp, соцсети, поисковики). */
import type { Product } from '@/types'
import { mediaUrl } from '@/services/api'

export const SITE_NAME = 'SOUP PACK'
/** <title> главной и страниц без своего заголовка. */
export const SITE_TITLE = 'SOUP PACK — Вкусная замороженная ресторанная еда от шеф-повара'
/** meta description главной и страниц без своего описания. */
export const SITE_DESCRIPTION = 'SOUP PACK — готовые супы с доставкой в Ташкенте · Том ям, борщ, лагман'
/** Картинки превью — в client/public/og (1200×630). */
export const OG_LOGO = '/og/og-logo.jpg'
export const OG_CHEF = '/og/og-chef.jpg'

/** Адрес сайта для canonical / og:url / картинок превью. localhost на проде — ошибка настройки
 *  (например, NUXT_PUBLIC_SITE_URL скопирован из .env.example) — тогда берём боевой домен. */
const PROD_URL = 'https://soup-pack.uz'
export function seoSiteUrl(): string {
    const configured = String(useRuntimeConfig().public.siteUrl || '').replace(/\/$/, '')
    return !import.meta.dev && (!configured || /localhost|127\.0\.0\.1/.test(configured)) ? PROD_URL : configured
}

export function fmtSum(v: number) {
    return new Intl.NumberFormat('ru-RU').format(Math.round(v)) + ' сум'
}

/** Цена товара для превью и разметки: со скидкой, если она есть. */
export function productPrice(p: Product): { price: number; base: number | null } {
    const pricing = p.pricing
    const price = Number(pricing?.finalPrice ?? p.price ?? 0)
    const base = pricing?.discountPercent ? Number(pricing.basePrice) : null
    return { price, base }
}

export function compositionText(p: Product): string {
    const c = p.composition
    if (!c) return ''
    return (Array.isArray(c) ? c : String(c).split(/,\s*/)).map((x) => String(x).trim()).filter(Boolean).join(', ')
}

/** Описание товара для превью: описание · состав · цена. */
export function productShareDescription(p: Product): string {
    const { price, base } = productPrice(p)
    const parts: string[] = []
    if (p.description) parts.push(p.description.trim().replace(/\.?$/, '.'))
    const comp = compositionText(p)
    if (comp) parts.push(`Состав: ${comp}.`)
    if (price) parts.push(`Цена: ${fmtSum(price)}${base && base > price ? ` (вместо ${fmtSum(base)})` : ''}.`)
    return parts.join(' ')
}

/** Картинка товара для превью: уменьшенная копия из Strapi (large → medium), чтобы мессенджеры её точно загрузили. */
export function productShareImage(p: Product): string {
    const img: any = p.image
    if (!img) return ''
    if (typeof img === 'string') return mediaUrl(img)
    const f = img.formats || {}
    return mediaUrl(f.large?.url || f.medium?.url || img.url)
}
