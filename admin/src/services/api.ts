import axios from 'axios'
import { useAuth } from '@/stores/auth'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:1337/api'

/** Корень Strapi без `/api` — для абсолютных ссылок на медиа. */
export const SERVER_URL = API_URL.replace(/\/api\/?$/, '')

export const api = axios.create({ baseURL: API_URL })

/** Подставляем Bearer от залогиненного сотрудника. */
api.interceptors.request.use((config) => {
    const auth = useAuth()
    if (auth.token) {
        config.headers = config.headers || {}
        config.headers.Authorization = `Bearer ${auth.token}`
    }
    return config
})

/** 401 — токен невалиден: сброс сессии и редирект на логин. */
api.interceptors.response.use(
    (res) => res,
    (err) => {
        const status = err?.response?.status
        if (status === 401) {
            const auth = useAuth()
            auth.logout()
            if (!location.pathname.endsWith('/login')) {
                location.href = '/admin/login'
            }
        }
        if (import.meta.env.DEV) {
            const cfg = err?.config
            const url = cfg ? `${(cfg.method || 'get').toUpperCase()} ${cfg.baseURL || ''}${cfg.url || ''}` : ''
            console.error('[API error]', status, url, err?.response?.data || err.message)
        }
        return Promise.reject(err)
    },
)

/** Загрузить файл в Strapi media library → id созданного медиа. */
export async function uploadMedia(file: File): Promise<{ id: number; url: string }> {
    const form = new FormData()
    form.append('files', file, file.name)
    // Прокси upload через наш staff-роут (is-staff), а не публичный /api/upload.
    const res = await api.post('/staff/upload', form)
    const first = Array.isArray(res.data) ? res.data[0] : res.data
    return { id: first.id, url: first.url }
}

/** Strapi возвращает relative URL (/uploads/...). Делаем абсолютным. */
export function mediaUrl(url?: string | null): string {
    if (!url) return ''
    if (/^(https?:)?\/\//.test(url)) return url
    return SERVER_URL + url
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

/** Удобная обёртка над коллекцией Strapi.
 * ВАЖНО: в Strapi 5 /api/<name>/:id ждёт documentId (string), а НЕ числовой id. */
export type PaginatedResult<T> = {
    data: T[]
    meta: { pagination: { page: number; pageSize: number; pageCount: number; total: number } }
}

export function resource<T extends { id: number; documentId: string }>(name: string) {
    return {
        async list(params: Record<string, any> = {}): Promise<T[]> {
            const res = await api.get(`/${name}${qs({ 'pagination[pageSize]': 100, ...params })}`)
            return (res.data?.data ?? []) as T[]
        },
        /** Серверная пагинация: вернёт `{ data, meta }`. Strapi 5 умеет `pagination[withCount]`. */
        async listPaged(params: Record<string, any> = {}): Promise<PaginatedResult<T>> {
            const res = await api.get(`/${name}${qs({ 'pagination[withCount]': true, ...params })}`)
            return {
                data: (res.data?.data ?? []) as T[],
                meta: res.data?.meta ?? { pagination: { page: 1, pageSize: 0, pageCount: 1, total: 0 } },
            }
        },
        async get(documentId: string, params: Record<string, any> = {}): Promise<T> {
            const res = await api.get(`/${name}/${documentId}${qs(params)}`)
            return res.data?.data as T
        },
        async create(data: Partial<T>): Promise<T> {
            const res = await api.post(`/${name}`, { data })
            return res.data?.data as T
        },
        async update(documentId: string, data: Partial<T>): Promise<T> {
            const res = await api.put(`/${name}/${documentId}`, { data })
            return res.data?.data as T
        },
        async remove(documentId: string): Promise<void> {
            await api.delete(`/${name}/${documentId}`)
        },
    }
}
