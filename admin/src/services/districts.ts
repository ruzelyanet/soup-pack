/** Районы Ташкента: распознавание по тексту адреса. По координатам район определяет сервер
 *  (backend/src/utils/district.ts) — список районов держать в синхроне. */

export const UNKNOWN_DISTRICT = 'Район не определён'

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

/** Район из текста адреса. Ташкентские — к каноническому имени; иначе «…ский район» как есть (область). */
export function districtFromText(text?: string | null): string | null {
    if (!text) return null
    for (const d of TASHKENT_DISTRICTS) if (d.re.test(text)) return d.name
    const m = text.match(/([А-ЯЁA-Z][\p{L}-]+(?:ский|цкий|ий)\s+(?:район|туман))/u)
    if (m) return m[1].replace(/\s+(район|туман)$/i, '')
    return null
}
