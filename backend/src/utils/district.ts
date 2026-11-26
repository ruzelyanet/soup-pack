/**
 * Район заказа: сначала из текста адреса (бесплатно, мгновенно), иначе — обратный геокодинг
 * через HTTP-геокодер Яндекса по координатам. Ключ: переменная окружения YANDEX_GEOCODER_KEY
 * (ключ продукта «JavaScript API и HTTP Геокодер» — тот же, что у клиента в VITE_YANDEX_GEOCODER_KEY).
 *
 * Список районов держать в синхроне с admin/src/services/districts.ts.
 */

/** 12 районов Ташкента: каноническое имя + варианты написания (рус / узб. латиница / англ.). */
const TASHKENT_DISTRICTS: Array<{ name: string; re: RegExp }> = [
    { name: 'Мирзо-Улугбекский', re: /мирзо[\s-]*улугбек|mirzo[\s-]*ulug\S?\s*bek/i },
    { name: 'Юнусабадский',      re: /юнусабад|yunus[oa]bod|yunusabad/i },
    { name: 'Чиланзарский',      re: /чиланзар|chilonzor|chilanzar/i },
    { name: 'Мирабадский',       re: /мирабад|mirobod|mirabad/i },
    { name: 'Яккасарайский',     re: /яккасарай|yakkasaro[yi]|yakkasaray/i },
    { name: 'Яшнабадский',       re: /яшнабад|yashnobod|yashnabad/i },
    { name: 'Шайхантахурский',   re: /шайхантах|shayx[oa]nt[oa]hur|shaykhantak?hur|shayhontohur/i },
    { name: 'Алмазарский',       re: /алмазар|олмазор|olmazor|almazar/i },
    { name: 'Учтепинский',       re: /учтеп|uchtepa/i },
    { name: 'Сергелийский',      re: /сергел|sergeli/i },
    { name: 'Бектемирский',      re: /бектемир|bektemir/i },
    { name: 'Янгихаётский',      re: /янгиха[её]т|yangihayot|yangikhayot/i },
]

/** Район из произвольного текста. Ташкентские — к каноническому имени; «…ский район/туман» области — как есть. */
export function districtFromText(text?: string | null): string | null {
    if (!text) return null
    for (const d of TASHKENT_DISTRICTS) if (d.re.test(text)) return d.name
    const m = text.match(/([А-ЯЁA-Z][\p{L}-]+(?:ский|цкий|ий)\s+(?:район|туман))/u)
    if (m) return m[1].replace(/\s+(район|туман)$/i, '')
    return null
}

export class GeocoderError extends Error {
    constructor(message: string, public status?: number) { super(message) }
}

export function geocoderConfigured(): boolean {
    return Boolean(process.env.YANDEX_GEOCODER_KEY)
}

/**
 * Обратный геокодинг: район по координатам. `null` — Яндекс ответил, но района не нашёл.
 * Бросает GeocoderError, если ключа нет / он отклонён / сеть недоступна — тогда не помечаем заказ как проверенный.
 */
export async function districtByCoords(lat: number, lng: number): Promise<string | null> {
    const key = process.env.YANDEX_GEOCODER_KEY
    if (!key) throw new GeocoderError('YANDEX_GEOCODER_KEY не задан')
    const url = 'https://geocode-maps.yandex.ru/1.x/?' + new URLSearchParams({
        apikey: key,
        geocode: `${lng},${lat}`, // Яндекс ждёт «долгота,широта»
        kind: 'district',
        format: 'json',
        lang: 'ru_RU',
        results: '5',
    }).toString()

    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 5000)
    let res: Response
    try {
        res = await fetch(url, { signal: ctrl.signal })
    } catch (e: any) {
        throw new GeocoderError(`геокодер недоступен: ${e?.name === 'AbortError' ? 'таймаут' : e?.message || e}`)
    } finally {
        clearTimeout(timer)
    }
    if (!res.ok) throw new GeocoderError(`геокодер ответил ${res.status}`, res.status)

    const json: any = await res.json().catch(() => null)
    const members: any[] = json?.response?.GeoObjectCollection?.featureMember ?? []
    const texts: string[] = []
    for (const m of members) {
        const g = m?.GeoObject
        if (!g) continue
        texts.push(String(g.name || ''))
        texts.push(String(g.metaDataProperty?.GeocoderMetaData?.text || ''))
        for (const c of g.metaDataProperty?.GeocoderMetaData?.Address?.Components ?? []) {
            if (c?.kind === 'district') texts.push(String(c.name || ''))
        }
    }
    for (const t of texts) {
        const d = districtFromText(t)
        if (d) return d
    }
    return null
}

/** Район заказа: адрес → координаты. Пустая строка — «проверили, района нет» (чтобы не спрашивать снова). */
export async function resolveOrderDistrict(o: { address?: string | null; lat?: any; lng?: any }): Promise<string> {
    const fromAddr = districtFromText(o.address)
    if (fromAddr) return fromAddr
    const lat = o.lat != null ? Number(o.lat) : NaN
    const lng = o.lng != null ? Number(o.lng) : NaN
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return ''
    return (await districtByCoords(lat, lng)) ?? ''
}
