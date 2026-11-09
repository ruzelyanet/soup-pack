/** In-memory rate-limiter по ключу (IP). Для продакшена заменить на Redis. */

const buckets = new Map<string, number[]>()

export function allow(key: string, limit = 10, windowMs = 10 * 60 * 1000): boolean {
    const now = Date.now()
    const list = (buckets.get(key) || []).filter((t) => now - t < windowMs)
    if (list.length >= limit) {
        buckets.set(key, list)
        return false
    }
    list.push(now)
    buckets.set(key, list)
    return true
}
