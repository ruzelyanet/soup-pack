import type { OrderSet, Product } from '@/types'

/** Общие типы и хелперы для страниц /discounts и /discounts/[id]. */

export interface DiscountTarget {
    targetType: 'product' | 'category' | 'order-set' | 'all-products'
    product?: { id: number; slug?: string; name?: string } | null
    category?: { id: number; slug?: string; name?: string } | null
    orderSet?: { id: number; slug?: string; name?: string } | null
    exclude?: boolean
}

export interface PublicDiscount {
    id: number
    name: string
    publicLabel?: string | null
    description?: string | null
    level: 'line' | 'set' | 'order'
    benefitType: 'percent' | 'fixed_amount' | 'fixed_price'
    benefitValue: number
    startsAt?: string | null
    endsAt?: string | null
    conditions?: Record<string, any> | null
    targets?: DiscountTarget[]
}

export type Tint = NonNullable<Product['tint']>

export const TINT_BG: Record<Tint, string> = {
    tom: 'bg-tint-tom', chi: 'bg-tint-chi', pum: 'bg-tint-pum',
    len: 'bg-tint-len', spa: 'bg-tint-spa', col: 'bg-tint-col',
}

export function fmtNum(v: number) {
    return new Intl.NumberFormat('ru-RU').format(v)
}
export function fmt(v: number) {
    return fmtNum(v) + ' сум'
}
export function fmtDate(d?: string | null) {
    if (!d) return ''
    return new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
}

/** Крупное значение выгоды: { main: '−15', unit: '%' } / { main: '−8 000', unit: 'сум' } / { main: 'за 10 000', unit: 'сум' }. */
export function benefitParts(d: PublicDiscount): { main: string; unit: string } {
    if (d.benefitType === 'percent') return { main: `−${d.benefitValue}`, unit: '%' }
    if (d.benefitType === 'fixed_amount') return { main: `−${fmtNum(d.benefitValue)}`, unit: 'сум' }
    return { main: `за ${fmtNum(d.benefitValue)}`, unit: 'сум' }
}
export function benefitText(d: PublicDiscount): string {
    const p = benefitParts(d)
    return d.benefitType === 'percent' ? `${p.main}${p.unit}` : `${p.main} ${p.unit}`
}

function plural(n: number, one: string, few: string, many: string) {
    const m10 = n % 10, m100 = n % 100
    if (m10 === 1 && m100 !== 11) return one
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few
    return many
}
export const pluralDishes = (n: number) => plural(n, 'блюдо', 'блюда', 'блюд')
export const pluralSets = (n: number) => plural(n, 'набор', 'набора', 'наборов')

function activeTargets(d: PublicDiscount) {
    return (d.targets || []).filter((x) => !x.exclude)
}

/** Товары каталога, на которые действует скидка. */
export function matchProducts(d: PublicDiscount, products: Product[]): Product[] {
    const t = activeTargets(d)
    const productIds = new Set<number>()
    const categoryIds = new Set<number>()
    let takeAll = false
    for (const x of t) {
        if (x.targetType === 'all-products') takeAll = true
        if (x.targetType === 'product' && x.product?.id) productIds.add(x.product.id)
        if (x.targetType === 'category' && x.category?.id) categoryIds.add(x.category.id)
    }
    if (!takeAll && !productIds.size && !categoryIds.size) return []
    return products.filter((p) =>
        takeAll || productIds.has(p.id) || (p.category?.id != null && categoryIds.has(p.category.id)))
}

/** Наборы каталога, на которые действует скидка. Для level=set без конкретных targets — все наборы. */
export function matchSets(d: PublicDiscount, sets: OrderSet[]): OrderSet[] {
    const t = activeTargets(d)
    const ids = new Set<number>()
    for (const x of t) if (x.targetType === 'order-set' && x.orderSet?.id) ids.add(x.orderSet.id)
    if (!ids.size) return d.level === 'set' ? sets : []
    return sets.filter((s) => ids.has(s.id))
}

export function matchCategories(d: PublicDiscount) {
    return activeTargets(d)
        .filter((x) => x.targetType === 'category' && x.category)
        .map((x) => x.category!) as Array<{ id: number; slug?: string; name?: string }>
}

/** Короткая подпись охвата для чипа: «все блюда», «категория», «3 блюда», «1 набор». */
export function scopeChip(d: PublicDiscount, matched: Product[], sets: OrderSet[]): string {
    const t = activeTargets(d)
    if (d.level === 'order') return 'весь заказ'
    if (d.level === 'set') return sets.length ? `${sets.length} ${pluralSets(sets.length)}` : 'наборы'
    if (t.some((x) => x.targetType === 'all-products')) return 'всё меню'
    const cats = t.filter((x) => x.targetType === 'category')
    if (cats.length === 1) return cats[0].category?.name?.toLowerCase() || 'категория'
    if (matched.length) return `${matched.length} ${pluralDishes(matched.length)}`
    return 'блюда'
}

/** Подзаголовок карточки: перечисление блюд или описание охвата. */
export function scopeLine(d: PublicDiscount, matched: Product[]): string {
    if (d.publicLabel && d.publicLabel !== d.name) return d.publicLabel
    if (!matched.length) return ''
    const names = matched.slice(0, 3).map((p) => p.name)
    const rest = matched.length - names.length
    return rest > 0 ? `${names.join(', ')} и ещё ${rest}` : names.join(', ')
}

/** Условия по-человечески, каждое отдельной строкой. */
export function conditionList(d: PublicDiscount): Array<{ icon: string; text: string }> {
    const c = d.conditions || {}
    const out: Array<{ icon: string; text: string }> = []
    if (c.minSubtotal) out.push({ icon: 'receipt', text: `Заказ от ${fmt(Number(c.minSubtotal))}` })
    if (c.minQty) out.push({ icon: 'bag', text: `От ${c.minQty} позиций в заказе` })
    if (Array.isArray(c.deliveryMethods) && c.deliveryMethods.length) {
        out.push({ icon: 'map-pin', text: `Способ получения: ${c.deliveryMethods.join(', ')}` })
    }
    if (Array.isArray(c.paymentMethods) && c.paymentMethods.length) {
        out.push({ icon: 'receipt', text: `Оплата: ${c.paymentMethods.join(', ')}` })
    }
    return out
}

/** Меньше суток до конца — подсвечиваем как «горит». */
export function endsSoon(d: PublicDiscount): boolean {
    if (!d.endsAt) return false
    const left = new Date(d.endsAt).getTime() - Date.now()
    return left > 0 && left < 86_400_000
}

/** Вес для сортировки: процент или фикс. сумма (условно 1% ≈ 1 000 сум). */
export function weight(d: PublicDiscount): number {
    return d.benefitType === 'percent' ? d.benefitValue : d.benefitValue / 1000
}
