import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:1337'
const API_TOKEN = import.meta.env.VITE_API_TOKEN || ''

/** Корень Strapi без `/api` — для абсолютных ссылок на медиа. */
export const SERVER_URL = API_URL.replace(/\/api\/?$/, '')

/** Strapi возвращает relative URL (/uploads/...). Делаем абсолютным. */
export function mediaUrl(url?: string | null): string {
    if (!url) return ''
    if (/^(https?:)?\/\//.test(url)) return url
    return SERVER_URL + url
}

/** Достать абсолютный URL главной картинки продукта (image | string | null) → string. */
export function productImg(p?: { image?: { url?: string } | string | null } | null): string {
    if (!p?.image) return ''
    if (typeof p.image === 'string') return mediaUrl(p.image)
    return mediaUrl(p.image.url)
}

// Расчёт скидок удалён — все цены и скидки приходят от сервера в объекте `pricing`.
// (`product.pricing.{basePrice, finalPrice, discountPercent, label, endsAt}`,
//  `cart.quote.{subtotal, total, discountTotal, lines, hints}`).

export const api = axios.create({
    baseURL: API_URL,
    headers: API_TOKEN ? { Authorization: `Bearer ${API_TOKEN}` } : {},
})

api.interceptors.response.use(
    (res) => res,
    (err) => {
        if (import.meta.env.DEV) {
            console.error('[API error]', err?.response?.data || err.message)
        }
        return Promise.reject(err)
    },
)

/** Strapi 5 возвращает плоские объекты (без `attributes`). Утилита для безопасного извлечения. */
export function extract<T = any>(res: { data: { data: T; meta?: any } }): T {
    return res.data?.data as T
}

/** Собрать URL c populate / sort / filters по-страпи-сишему. */
export function qs(params: Record<string, any>): string {
    const parts: string[] = []
    const walk = (prefix: string, v: any) => {
        if (v == null) return
        if (Array.isArray(v)) {
            v.forEach((val, i) => walk(`${prefix}[${i}]`, val))
        } else if (typeof v === 'object') {
            for (const k of Object.keys(v)) walk(`${prefix}[${k}]`, v[k])
        } else {
            parts.push(`${encodeURIComponent(prefix)}=${encodeURIComponent(String(v))}`)
        }
    }
    for (const k of Object.keys(params)) walk(k, params[k])
    return parts.length ? '?' + parts.join('&') : ''
}
