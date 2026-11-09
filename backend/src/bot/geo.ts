/**
 * Координаты из текста: для клиентов, у которых кнопка «Поделиться локацией» не работает
 * (Telegram Desktop / macOS / Web не умеют отправлять геопозицию по кнопке).
 * Принимаем: «41.311, 69.279», ссылки Google Maps, Яндекс Карт, 2ГИС, OpenStreetMap, Apple Maps
 * и их короткие ссылки (maps.app.goo.gl, yandex.uz/maps/-/…, go.2gis.com) — их раскрываем по редиректу.
 */

export type LatLng = { lat: number; lng: number }

const NUM = '(-?\\d{1,3}(?:[.,]\\d+)?)'
const SEP = '\\s*(?:,|%2C|\\s)\\s*'

/** Примерные границы Узбекистана — чтобы угадать порядок «долгота, широта» у Яндекса/2ГИС. */
function inUzbekistan(p: LatLng) {
    return p.lat >= 37 && p.lat <= 46 && p.lng >= 55 && p.lng <= 74
}

function valid(p: LatLng) {
    return Number.isFinite(p.lat) && Number.isFinite(p.lng) &&
        Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180 && !(p.lat === 0 && p.lng === 0)
}

function num(s: string) {
    return Number(s.replace(',', '.'))
}

/** a, b в порядке «широта, долгота» (lonFirst — наоборот). Если перепутан порядок — поправим по границам. */
function pair(a: string, b: string, lonFirst = false): LatLng | null {
    let p: LatLng = lonFirst ? { lat: num(b), lng: num(a) } : { lat: num(a), lng: num(b) }
    const swapped = { lat: p.lng, lng: p.lat }
    if (!inUzbekistan(p) && inUzbekistan(swapped)) p = swapped
    return valid(p) ? p : null
}

export function parseLatLng(input: string | null | undefined): LatLng | null {
    const raw = String(input || '').trim()
    if (!raw) return null
    let text = raw
    try { text = decodeURIComponent(raw) } catch { /* битая ссылка — разбираем как есть */ }

    // Яндекс: ll= / pt= / whatshere[point]= — порядок «долгота,широта».
    let m = text.match(new RegExp(`(?:[?&](?:ll|pt|whatshere\\[point\\])=)${NUM}${SEP}${NUM}`))
    if (m && /yandex|ya\.ru/i.test(text)) return pair(m[1], m[2], true)
    // 2ГИС: /geo/lon,lat или m=lon,lat
    m = text.match(new RegExp(`2gis[^\\s]*?(?:/geo/|[?&]m=)${NUM}${SEP}${NUM}`, 'i'))
    if (m) return pair(m[1], m[2], true)
    // Google: @lat,lng  |  !3dLAT!4dLNG  |  q= / query= / ll= / destination=
    m = text.match(new RegExp(`!3d${NUM}!4d${NUM}`))
    if (m) return pair(m[1], m[2])
    m = text.match(new RegExp(`@${NUM}${SEP}${NUM}`))
    if (m) return pair(m[1], m[2])
    m = text.match(new RegExp(`[?&](?:q|query|ll|destination|daddr|sll)=(?:loc:)?${NUM}${SEP}${NUM}`))
    if (m) return pair(m[1], m[2], /yandex/i.test(text))
    // OpenStreetMap: #map=zoom/lat/lng или mlat=..&mlon=..
    m = text.match(new RegExp(`#map=\\d+/${NUM}/${NUM}`))
    if (m) return pair(m[1], m[2])
    m = text.match(new RegExp(`mlat=${NUM}&mlon=${NUM}`))
    if (m) return pair(m[1], m[2])
    // Просто «41.311081, 69.279737» (с точкой в дробной части, чтобы не спутать с номером дома).
    m = text.match(/^\s*(-?\d{1,3}\.\d{3,})\s*[,;\s]\s*(-?\d{1,3}\.\d{3,})\s*$/)
    if (m) return pair(m[1], m[2])
    return null
}

const SHORT_LINK = /https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs|(?:www\.)?yandex\.[a-z]+\/maps\/-\/|go\.2gis\.com|2gis\.[a-z]+\/\w+\/firm|maps\.apple\.com)[^\s]*/i

export function findShortLink(text: string): string | null {
    return String(text || '').match(SHORT_LINK)?.[0] ?? null
}

/** Раскрыть короткую ссылку (до 5 редиректов) и достать координаты из конечного адреса или страницы. */
export async function resolveLatLng(
    text: string,
    fetchImpl: typeof fetch = fetch,
): Promise<LatLng | null> {
    const direct = parseLatLng(text)
    if (direct) return direct
    let url = findShortLink(text)
    if (!url) return null
    try {
        for (let hop = 0; hop < 5 && url; hop++) {
            const res = await fetchImpl(url, {
                redirect: 'manual',
                headers: { 'User-Agent': 'Mozilla/5.0 (SoupPack bot)' },
                signal: AbortSignal.timeout(5000),
            })
            const next = res.headers.get('location')
            if (next) {
                url = new URL(next, url).toString()
                const p = parseLatLng(url)
                if (p) return p
                continue
            }
            // Конечная страница: координаты бывают в мета-тегах/скриптах.
            const p = parseLatLng(url)
            if (p) return p
            const html = (await res.text()).slice(0, 200_000)
            const m = html.match(/(?:center|ll|@)[=:"\s[]*(-?\d{1,3}\.\d{4,})\s*(?:,|%2C)\s*(-?\d{1,3}\.\d{4,})/)
            return m ? pair(m[1], m[2], /yandex/i.test(url)) : null
        }
    } catch {
        return null
    }
    return null
}
