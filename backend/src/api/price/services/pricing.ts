/**
 * Pricing — цены и движок скидок.
 *
 * Фаза 2: отдельная сущность `price` с периодом действия (`resolveBasePrice`, `setPrice`,
 * `migratePricingV1`).
 *
 * Фаза 3: движок скидок — `allocate`, `evaluate` (чистая функция), `quote` (IO: разворачивает
 * корзину, подтягивает активные скидки, вызывает evaluate).
 */

import type { Core } from '@strapi/strapi'
import { errors } from '@strapi/utils'

const { ApplicationError } = errors

const PRICE_UID = 'api::price.price' as const
const PRODUCT_UID = 'api::product.product' as const
const DISCOUNT_UID = 'api::discount.discount' as const
const ORDER_SET_UID = 'api::order-set.order-set' as const

export type PriceRow = {
    id: number
    documentId?: string
    amount: number
    validFrom: string | Date
    validTo: string | Date | null
    comment?: string | null
}

type Deps = { strapi: Core.Strapi }

// ────────── Типы движка скидок ──────────

export type DiscountLevel = 'line' | 'set' | 'order'
export type BenefitType = 'percent' | 'fixed_amount' | 'fixed_price'

export type DiscountTargetSnapshot = {
    targetType: 'product' | 'category' | 'order-set' | 'all-products'
    productId?: number | null
    categoryId?: number | null
    orderSetId?: number | null
    exclude?: boolean
}

export type DiscountSnapshot = {
    id: number
    version: number
    name: string
    publicLabel?: string | null
    level: DiscountLevel
    benefitType: BenefitType
    benefitValue: number
    maxDiscountAmount?: number | null
    conditions?: Record<string, any> | null
    priority: number
    stackable: boolean
    exclusiveGroup?: string | null
    targets: DiscountTargetSnapshot[]
}

export type CartLineSnapshot = {
    lineKey: string
    productId: number | null
    categoryId?: number | null
    name: string
    qty: number
    basePrice: number
    priceId?: number | null
    orderSetId?: number | null
    setInstance?: string | null
}

export type QuoteContext = {
    deliveryMethod?: string | null
    paymentMethod?: string | null
    clientKind?: 'individual' | 'shop' | null
    source: 'catalog' | 'request' | 'manual' | 'telegram'
    at: Date
}

export type QuoteDiscount = {
    discountId: number
    version: number
    name: string
    level: DiscountLevel
    benefitType: BenefitType
    benefitValue: number
    amount: number
}

export type QuoteLine = CartLineSnapshot & {
    unitPrice: number
    orderDiscountAmount: number
    lineTotal: number
    discounts: QuoteDiscount[]
}

export type QuoteHint = {
    code: 'NEXT_TIER'
    discountId: number
    missing: number
    label: string
    benefitType?: 'percent' | 'fixed_amount' | 'fixed_price'
    benefitValue?: number
}
export type QuoteExplanation = { discountId: number; applied: boolean; reason?: string }

export type Quote = {
    lines: QuoteLine[]
    subtotal: number
    discountTotal: number
    total: number
    appliedDiscounts: Array<{ discountId: number; name: string; publicLabel?: string | null; amount: number }>
    hints: QuoteHint[]
    explanations: QuoteExplanation[]
}

export type QuoteInput = {
    items: Array<
        | { type: 'product'; productId: number; qty: number }
        | { type: 'set'; orderSetId: number; qty: number }
    >
    deliveryMethod?: string | null
    paymentMethod?: string | null
    clientId?: number | null
    source?: 'catalog' | 'request' | 'manual' | 'telegram'
    at?: Date | string
    /** Для staff/simulate: подмешать эти скидки в расчёт даже если status != active или период не идёт.
     *  Служит для проверки черновиков из карточки скидки. */
    includeDiscountIds?: number[]
}

// ────────── Pure helpers ──────────

/** Распределить `amount` по строкам пропорционально их базе. Доля округляется вниз,
 *  остаток добавляется строке с наибольшей базой (при равенстве — первой). Сумма долей = amount.
 *  Чистая функция; покрывается unit-тестами. */
export function allocate(amount: number, bases: number[]): number[] {
    const n = bases.length
    if (!n) return []
    const total = bases.reduce((s, b) => s + Math.max(0, b), 0)
    if (total <= 0 || amount <= 0) return new Array(n).fill(0)

    const shares = bases.map((b) => Math.floor((amount * Math.max(0, b)) / total))
    let remainder = amount - shares.reduce((s, x) => s + x, 0)
    if (remainder > 0) {
        // Индексы — упорядочить по базе desc; при равенстве — порядок исходный (стабильно).
        const order = bases.map((b, i) => ({ b, i })).sort((a, b) => (b.b - a.b) || (a.i - b.i))
        let k = 0
        while (remainder > 0) {
            shares[order[k].i] += 1
            remainder -= 1
            k = (k + 1) % n
        }
    }
    return shares
}

/** Проверить, что цель скидки применима к строке (с учётом exclude). */
function targetMatchesLine(target: DiscountTargetSnapshot, line: CartLineSnapshot): boolean {
    if (target.targetType === 'all-products') return true
    if (target.targetType === 'product') return target.productId === line.productId
    if (target.targetType === 'category') return target.categoryId != null && target.categoryId === line.categoryId
    return false
}

function lineInDiscountScope(d: DiscountSnapshot, line: CartLineSnapshot): boolean {
    let include = false
    let excluded = false
    for (const t of d.targets || []) {
        if (!targetMatchesLine(t, line)) continue
        if (t.exclude) { excluded = true; break }
        include = true
    }
    return include && !excluded
}

/** В Asia/Tashkent (UTC+5) — вернуть локальные день недели и минуты от полуночи. */
function tashkentLocal(at: Date): { weekday: number; minutesOfDay: number } {
    // Сдвинем в +05:00 через UTC-методы.
    const shifted = new Date(at.getTime() + 5 * 60 * 60 * 1000)
    return {
        weekday: shifted.getUTCDay() || 7, // 1..7 (Пн..Вс)
        minutesOfDay: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
    }
}

function parseHm(hm: string): number | null {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(hm || '').trim())
    if (!m) return null
    return Number(m[1]) * 60 + Number(m[2])
}

/** Проверка `conditions`. `minSubtotal` сравнивается с переданной текущей суммой контекста. */
function checkConditions(
    conditions: Record<string, any> | null | undefined,
    ctx: QuoteContext & { subtotalForCheck: number; qtyFor: (productId: number) => number },
): { ok: boolean; reason?: string; missing?: { kind: 'minSubtotal'; value: number } } {
    if (!conditions) return { ok: true }

    const KNOWN = new Set([
        'minSubtotal', 'minQty', 'deliveryMethods', 'paymentMethods',
        'clientKinds', 'weekdays', 'timeFrom', 'timeTo', 'sources', 'couponRequired',
    ])
    for (const k of Object.keys(conditions)) {
        if (!KNOWN.has(k)) {
            return { ok: false, reason: `INVALID_CONDITION:${k}` }
        }
    }

    if (conditions.couponRequired) {
        return { ok: false, reason: 'coupon required (not supported yet)' }
    }

    if (typeof conditions.minSubtotal === 'number') {
        const missing = Number(conditions.minSubtotal) - ctx.subtotalForCheck
        if (missing > 0) {
            return { ok: false, reason: 'minSubtotal', missing: { kind: 'minSubtotal', value: missing } }
        }
    }

    if (Array.isArray(conditions.deliveryMethods) && conditions.deliveryMethods.length) {
        if (!ctx.deliveryMethod || !conditions.deliveryMethods.includes(ctx.deliveryMethod)) {
            return { ok: false, reason: 'deliveryMethod' }
        }
    }
    if (Array.isArray(conditions.paymentMethods) && conditions.paymentMethods.length) {
        if (!ctx.paymentMethod || !conditions.paymentMethods.includes(ctx.paymentMethod)) {
            return { ok: false, reason: 'paymentMethod' }
        }
    }
    if (Array.isArray(conditions.clientKinds) && conditions.clientKinds.length) {
        if (!ctx.clientKind || !conditions.clientKinds.includes(ctx.clientKind)) {
            return { ok: false, reason: 'clientKind' }
        }
    }
    if (Array.isArray(conditions.sources) && conditions.sources.length) {
        if (!conditions.sources.includes(ctx.source)) {
            return { ok: false, reason: 'source' }
        }
    }

    if (Array.isArray(conditions.weekdays) && conditions.weekdays.length) {
        const { weekday } = tashkentLocal(ctx.at)
        if (!conditions.weekdays.map(Number).includes(weekday)) {
            return { ok: false, reason: 'weekday' }
        }
    }
    if (conditions.timeFrom || conditions.timeTo) {
        const { minutesOfDay } = tashkentLocal(ctx.at)
        const from = conditions.timeFrom ? parseHm(conditions.timeFrom) : null
        const to = conditions.timeTo ? parseHm(conditions.timeTo) : null
        if (from != null && minutesOfDay < from) return { ok: false, reason: 'timeFrom' }
        if (to != null && minutesOfDay > to) return { ok: false, reason: 'timeTo' }
    }

    if (typeof conditions.minQty === 'number' && conditions.minQty > 1) {
        // minQty для `line` — суммарное qty этого товара в заказе; проверяется извне (нужен lineRef).
    }

    return { ok: true }
}

/** Применить скидку к цене единицы (percent/fixed_amount/fixed_price). Возвращает новую цену (≥1). */
function applyBenefitToUnitPrice(unit: number, d: DiscountSnapshot): number {
    const v = Number(d.benefitValue || 0)
    let next = unit
    if (d.benefitType === 'percent') {
        if (v <= 0 || v >= 100) return unit
        next = Math.round(unit * (1 - v / 100))
    } else if (d.benefitType === 'fixed_amount') {
        next = unit - Math.round(v)
    } else if (d.benefitType === 'fixed_price') {
        next = Math.round(v)
    }
    return Math.max(1, next)
}

/** Главная чистая функция: применяет скидки к снимку корзины. Возвращает полный Quote.
 *  Не делает IO. Весь контекст и список скидок приходят извне. */
export function evaluate(
    cart: CartLineSnapshot[],
    discounts: DiscountSnapshot[],
    ctx: QuoteContext,
): Quote {
    // Готовим рабочие строки.
    const lines: QuoteLine[] = cart.map((l) => ({
        ...l,
        unitPrice: Math.max(1, Math.round(l.basePrice)),
        orderDiscountAmount: 0,
        lineTotal: 0,
        discounts: [],
    }))

    const explanations: QuoteExplanation[] = []
    const hints: QuoteHint[] = []
    const appliedMap = new Map<number, { discountId: number; name: string; publicLabel?: string | null; amount: number }>()
    const trackApplied = (d: DiscountSnapshot, amount: number) => {
        const prev = appliedMap.get(d.id)
        if (prev) prev.amount += amount
        else appliedMap.set(d.id, { discountId: d.id, name: d.name, publicLabel: d.publicLabel, amount })
    }

    const qtyByProduct = (productId: number) =>
        lines.filter((l) => l.productId === productId).reduce((s, l) => s + l.qty, 0)

    // ───── (1) Line-level скидки ─────
    const lineDiscounts = discounts
        .filter((d) => d.level === 'line')
        .sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100))

    for (const line of lines) {
        if (!line.productId) continue
        // Товар, попавший в набор, получает ТОЛЬКО скидку набора (set-level).
        // Line-level скидки на такие строки не применяются — иначе на одну позицию
        // накладывалось бы сразу две скидки (на товар + на набор).
        if (line.setInstance) continue
        const subtotalForLineCheck = line.unitPrice * line.qty
        const candidates: Array<{ d: DiscountSnapshot; benefit: number }> = []
        for (const d of lineDiscounts) {
            if (!lineInDiscountScope(d, line)) continue
            // minQty для line — qty этого товара в заказе ≥ порога.
            if (d.conditions && typeof d.conditions.minQty === 'number' && d.conditions.minQty > 1) {
                if (qtyByProduct(line.productId) < Number(d.conditions.minQty)) {
                    explanations.push({ discountId: d.id, applied: false, reason: 'minQty' })
                    continue
                }
            }
            const check = checkConditions(d.conditions, {
                ...ctx,
                subtotalForCheck: subtotalForLineCheck,
                qtyFor: qtyByProduct,
            })
            if (!check.ok) {
                explanations.push({ discountId: d.id, applied: false, reason: check.reason })
                continue
            }
            const newUnit = applyBenefitToUnitPrice(line.unitPrice, d)
            const benefit = Math.max(0, line.unitPrice - newUnit)
            if (benefit <= 0) {
                explanations.push({ discountId: d.id, applied: false, reason: 'no-benefit' })
                continue
            }
            candidates.push({ d, benefit })
        }
        if (!candidates.length) continue

        // Группировка по exclusiveGroup — одна лучшая на группу.
        const byGroup = new Map<string, { d: DiscountSnapshot; benefit: number }>()
        const freeCandidates: Array<{ d: DiscountSnapshot; benefit: number }> = []
        for (const c of candidates) {
            const g = c.d.exclusiveGroup || ''
            if (!g) { freeCandidates.push(c); continue }
            const prev = byGroup.get(g)
            if (!prev || c.benefit > prev.benefit) byGroup.set(g, c)
        }
        let pool: Array<{ d: DiscountSnapshot; benefit: number }> = [...freeCandidates, ...Array.from(byGroup.values())]
        pool = pool.sort((a, b) => (a.d.priority ?? 100) - (b.d.priority ?? 100))

        // stackable=false → только одна (самая выгодная).
        const hasNonStackable = pool.some((c) => !c.d.stackable)
        if (hasNonStackable) {
            pool.sort((a, b) => b.benefit - a.benefit)
            pool = pool.slice(0, 1)
        }

        // Последовательно применяем, пересчитывая benefit по текущей цене.
        for (const c of pool) {
            const before = line.unitPrice
            const next = applyBenefitToUnitPrice(before, c.d)
            const benefitPerUnit = Math.max(0, before - next)
            if (benefitPerUnit <= 0) {
                explanations.push({ discountId: c.d.id, applied: false, reason: 'no-benefit-after-chain' })
                continue
            }
            line.unitPrice = next
            const lineAmount = benefitPerUnit * line.qty
            line.discounts.push({
                discountId: c.d.id,
                version: c.d.version,
                name: c.d.name,
                level: 'line',
                benefitType: c.d.benefitType,
                benefitValue: c.d.benefitValue,
                amount: lineAmount,
            })
            trackApplied(c.d, lineAmount)
            explanations.push({ discountId: c.d.id, applied: true })
        }
    }

    // ───── (2) Set-level скидки ─────
    const setDiscounts = discounts
        .filter((d) => d.level === 'set')
        .sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100))

    // Сгруппируем строки по setInstance.
    const instancesMap = new Map<string, QuoteLine[]>()
    for (const l of lines) {
        if (!l.setInstance || !l.orderSetId) continue
        const key = `${l.orderSetId}:${l.setInstance}`
        const arr = instancesMap.get(key) || []
        arr.push(l)
        instancesMap.set(key, arr)
    }

    for (const [, instanceLines] of instancesMap) {
        const orderSetId = instanceLines[0].orderSetId!
        const instanceCandidates: Array<{ d: DiscountSnapshot; benefit: number }> = []
        const instanceSubtotal = instanceLines.reduce((s, l) => s + l.unitPrice * l.qty, 0)
        for (const d of setDiscounts) {
            const match = (d.targets || []).some(
                (t) => t.targetType === 'order-set' && t.orderSetId === orderSetId && !t.exclude,
            )
            if (!match) continue
            const check = checkConditions(d.conditions, {
                ...ctx,
                subtotalForCheck: instanceSubtotal,
                qtyFor: qtyByProduct,
            })
            if (!check.ok) {
                explanations.push({ discountId: d.id, applied: false, reason: check.reason })
                continue
            }
            // Выгода набора — считается на всю сумму экземпляра.
            let newInstanceTotal = instanceSubtotal
            if (d.benefitType === 'percent') {
                if (d.benefitValue > 0 && d.benefitValue < 100) {
                    newInstanceTotal = Math.round(instanceSubtotal * (1 - d.benefitValue / 100))
                }
            } else if (d.benefitType === 'fixed_amount') {
                newInstanceTotal = Math.max(instanceLines.length, instanceSubtotal - Math.round(d.benefitValue))
            } else if (d.benefitType === 'fixed_price') {
                newInstanceTotal = Math.max(instanceLines.length, Math.round(d.benefitValue))
            }
            let benefit = instanceSubtotal - newInstanceTotal
            if (d.maxDiscountAmount != null) benefit = Math.min(benefit, Number(d.maxDiscountAmount))
            if (benefit <= 0) continue
            instanceCandidates.push({ d, benefit })
        }
        if (!instanceCandidates.length) continue

        const byGroup = new Map<string, { d: DiscountSnapshot; benefit: number }>()
        const free: Array<{ d: DiscountSnapshot; benefit: number }> = []
        for (const c of instanceCandidates) {
            const g = c.d.exclusiveGroup || ''
            if (!g) { free.push(c); continue }
            const prev = byGroup.get(g)
            if (!prev || c.benefit > prev.benefit) byGroup.set(g, c)
        }
        let pool = [...free, ...Array.from(byGroup.values())]
            .sort((a, b) => (a.d.priority ?? 100) - (b.d.priority ?? 100))
        if (pool.some((c) => !c.d.stackable)) {
            pool.sort((a, b) => b.benefit - a.benefit)
            pool = pool.slice(0, 1)
        }

        for (const c of pool) {
            const bases = instanceLines.map((l) => l.unitPrice * l.qty)
            const shares = allocate(c.benefit, bases)
            instanceLines.forEach((l, idx) => {
                const share = shares[idx] || 0
                if (share <= 0) return
                // Переводим share в скидку на единицу (целыми); округление компенсируется через orderDiscountAmount.
                const perUnit = Math.floor(share / l.qty)
                const rounded = perUnit * l.qty
                const residue = share - rounded
                if (perUnit > 0) {
                    l.unitPrice = Math.max(1, l.unitPrice - perUnit)
                }
                if (residue > 0) {
                    // Остаток кладём в orderDiscountAmount — он уменьшает lineTotal на том же шаге.
                    l.orderDiscountAmount += residue
                }
                if (perUnit > 0 || residue > 0) {
                    l.discounts.push({
                        discountId: c.d.id,
                        version: c.d.version,
                        name: c.d.name,
                        level: 'set',
                        benefitType: c.d.benefitType,
                        benefitValue: c.d.benefitValue,
                        amount: share,
                    })
                }
            })
            trackApplied(c.d, c.benefit)
            explanations.push({ discountId: c.d.id, applied: true })
        }
    }

    // ───── (3) Order-level скидки ─────
    const subtotalAfter = lines.reduce((s, l) => s + l.unitPrice * l.qty - l.orderDiscountAmount, 0)

    const orderDiscounts = discounts
        .filter((d) => d.level === 'order')
        .sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100))

    const orderCandidates: Array<{ d: DiscountSnapshot; benefit: number }> = []
    for (const d of orderDiscounts) {
        const check = checkConditions(d.conditions, {
            ...ctx,
            subtotalForCheck: subtotalAfter,
            qtyFor: qtyByProduct,
        })
        if (!check.ok) {
            if (check.missing?.kind === 'minSubtotal') {
                hints.push({
                    code: 'NEXT_TIER',
                    discountId: d.id,
                    missing: check.missing.value,
                    label: d.publicLabel || d.name,
                    benefitType: d.benefitType,
                    benefitValue: d.benefitValue,
                })
            }
            explanations.push({ discountId: d.id, applied: false, reason: check.reason })
            continue
        }
        let benefit = 0
        if (d.benefitType === 'percent') {
            if (d.benefitValue > 0 && d.benefitValue < 100) {
                benefit = Math.round(subtotalAfter * (d.benefitValue / 100))
            }
        } else if (d.benefitType === 'fixed_amount') {
            benefit = Math.min(subtotalAfter, Math.round(d.benefitValue))
        }
        if (d.maxDiscountAmount != null) benefit = Math.min(benefit, Number(d.maxDiscountAmount))
        if (benefit <= 0) {
            explanations.push({ discountId: d.id, applied: false, reason: 'no-benefit' })
            continue
        }
        orderCandidates.push({ d, benefit })
    }

    const byGroupO = new Map<string, { d: DiscountSnapshot; benefit: number }>()
    const freeO: Array<{ d: DiscountSnapshot; benefit: number }> = []
    for (const c of orderCandidates) {
        const g = c.d.exclusiveGroup || ''
        if (!g) { freeO.push(c); continue }
        const prev = byGroupO.get(g)
        if (!prev || c.benefit > prev.benefit) byGroupO.set(g, c)
    }
    let poolO = [...freeO, ...Array.from(byGroupO.values())]
        .sort((a, b) => (a.d.priority ?? 100) - (b.d.priority ?? 100))
    if (poolO.some((c) => !c.d.stackable)) {
        poolO.sort((a, b) => b.benefit - a.benefit)
        poolO = poolO.slice(0, 1)
    }

    for (const c of poolO) {
        // База для распределения — текущая сумма строки = unitPrice*qty − orderDiscountAmount (уже учтённое set).
        const bases = lines.map((l) => Math.max(0, l.unitPrice * l.qty - l.orderDiscountAmount))
        const shares = allocate(c.benefit, bases)
        lines.forEach((l, idx) => {
            const share = shares[idx] || 0
            if (share <= 0) return
            l.orderDiscountAmount += share
            l.discounts.push({
                discountId: c.d.id,
                version: c.d.version,
                name: c.d.name,
                level: 'order',
                benefitType: c.d.benefitType,
                benefitValue: c.d.benefitValue,
                amount: share,
            })
        })
        trackApplied(c.d, c.benefit)
        explanations.push({ discountId: c.d.id, applied: true })
    }

    // ───── (4) Финальные итоги ─────
    for (const l of lines) {
        l.lineTotal = l.unitPrice * l.qty - l.orderDiscountAmount
        if (l.lineTotal < 0) l.lineTotal = 0
    }
    const subtotal = lines.reduce((s, l) => s + l.basePrice * l.qty, 0)
    const total = lines.reduce((s, l) => s + l.lineTotal, 0)
    const discountTotal = subtotal - total

    // Инвариант: subtotal − discountTotal = total = Σ lineTotal.
    const sumLineTotals = lines.reduce((s, l) => s + l.lineTotal, 0)
    if (sumLineTotals !== total || subtotal - discountTotal !== total) {
        throw new Error('[pricing/evaluate] invariant failed: subtotal/discountTotal/total mismatch')
    }

    return {
        lines,
        subtotal,
        discountTotal,
        total,
        appliedDiscounts: Array.from(appliedMap.values()),
        hints,
        explanations,
    }
}

export default ({ strapi }: Deps) => ({
    // ─────────── Фаза 2 — цены ───────────

    async resolveBasePrice(productId: number, at: Date = new Date()): Promise<{ amount: number; priceId: number | null }> {
        const row = await strapi.db.query(PRICE_UID).findOne({
            where: {
                product: { id: Number(productId) },
                validFrom: { $lte: at },
                $or: [
                    { validTo: { $gt: at } },
                    { validTo: { $null: true } },
                ],
            },
            orderBy: { validFrom: 'desc' },
        })
        if (row) return { amount: Number(row.amount || 0), priceId: Number(row.id) }
        const p = await strapi.db.query(PRODUCT_UID).findOne({
            where: { id: Number(productId) },
            select: ['price'],
        })
        return { amount: Math.round(Number(p?.price || 0)), priceId: null }
    },

    async listPrices(productId: number): Promise<PriceRow[]> {
        const rows = await strapi.db.query(PRICE_UID).findMany({
            where: { product: { id: Number(productId) } },
            orderBy: { validFrom: 'asc' },
            populate: ['createdByEmployee'],
        })
        return (rows || []).map((r: any) => ({
            id: Number(r.id),
            documentId: r.documentId,
            amount: Number(r.amount || 0),
            validFrom: r.validFrom,
            validTo: r.validTo || null,
            comment: r.comment || null,
            createdByEmployee: r.createdByEmployee
                ? { id: r.createdByEmployee.id, fullName: r.createdByEmployee.fullName }
                : null,
        })) as any
    },

    async setPrice(input: {
        productId: number
        amount: number
        validFrom?: Date | string | null
        comment?: string | null
        employeeId?: number | null
    }): Promise<{ created: PriceRow; current: PriceRow }> {
        const productId = Number(input.productId)
        const amount = Math.round(Number(input.amount || 0))
        const comment = input.comment ? String(input.comment).trim() : null
        const now = new Date()
        const validFromRaw = input.validFrom ? new Date(input.validFrom) : now
        if (!(validFromRaw instanceof Date) || isNaN(validFromRaw.getTime())) {
            throw new ApplicationError('invalid validFrom')
        }
        if (!(amount > 0)) throw new ApplicationError('amount must be > 0')

        if (validFromRaw.getTime() < now.getTime() - 60_000) {
            const err: any = new ApplicationError('price cannot start in the past')
            err.details = { code: 'PRICE_IN_PAST' }
            throw err
        }
        const validFrom = validFromRaw < now ? now : validFromRaw

        const product = await strapi.db.query(PRODUCT_UID).findOne({
            where: { id: productId },
            select: ['id', 'documentId'],
        })
        if (!product) throw new ApplicationError('product not found')

        const employee = input.employeeId
            ? await strapi.db.query('api::employee.employee').findOne({
                  where: { id: Number(input.employeeId) },
                  select: ['id', 'documentId'],
              })
            : null

        const all = await strapi.db.query(PRICE_UID).findMany({
            where: { product: { id: productId } },
            orderBy: { validFrom: 'asc' },
        })

        const result = await strapi.db.transaction(async () => {
            for (const row of all) {
                const rFrom = new Date(row.validFrom)
                const rTo = row.validTo ? new Date(row.validTo) : null
                if (rFrom >= validFrom) {
                    const err: any = new ApplicationError('price period overlaps an existing row')
                    err.details = { code: 'PRICE_PERIOD_OVERLAP', conflictPriceId: row.id }
                    throw err
                }
                if (!rTo || rTo > validFrom) {
                    await strapi.db.query(PRICE_UID).update({
                        where: { id: row.id },
                        data: { validTo: validFrom },
                    })
                }
            }

            const createdRaw = await strapi.db.query(PRICE_UID).create({
                data: {
                    product: product.id,
                    amount,
                    validFrom,
                    validTo: null,
                    comment,
                    createdByEmployee: employee?.id ?? null,
                    publishedAt: new Date(),
                },
            })

            const currentNow = await strapi.db.query(PRICE_UID).findOne({
                where: {
                    product: { id: productId },
                    validFrom: { $lte: now },
                    $or: [
                        { validTo: { $gt: now } },
                        { validTo: { $null: true } },
                    ],
                },
                orderBy: { validFrom: 'desc' },
            })
            if (currentNow) {
                await strapi.db.query(PRODUCT_UID).update({
                    where: { id: productId },
                    data: { price: Number(currentNow.amount) },
                })
            }

            return { created: createdRaw, current: currentNow || createdRaw }
        })

        // Цены наборов больше не кешируются в поле `totalPrice` — набор пересчитывается
        // на лету через `catalogPricing`/`quote` при каждом чтении. Поэтому после смены
        // цены продукта никакого обновления связанных order-set не требуется.

        return { created: toRow(result.created), current: toRow(result.current) }
    },

    async cancelFuturePrice(priceId: number): Promise<void> {
        const row = await strapi.db.query(PRICE_UID).findOne({
            where: { id: Number(priceId) },
            populate: ['product'],
        })
        if (!row) throw new ApplicationError('price not found')
        const from = new Date(row.validFrom)
        const now = new Date()
        if (from.getTime() <= now.getTime()) {
            const err: any = new ApplicationError('cannot delete already active or past price')
            err.details = { code: 'PRICE_IN_PAST' }
            throw err
        }
        const productId = Number(row.product?.id)

        await strapi.db.transaction(async () => {
            const prev = await strapi.db.query(PRICE_UID).findOne({
                where: { product: { id: productId }, validTo: from, id: { $ne: row.id } },
                orderBy: { validFrom: 'desc' },
            })
            await strapi.db.query(PRICE_UID).delete({ where: { id: row.id } })
            if (prev) {
                await strapi.db.query(PRICE_UID).update({
                    where: { id: prev.id },
                    data: { validTo: null },
                })
            }
        })
    },

    // ─────────── Фаза 3 — движок скидок ───────────

    /** Загрузить активные скидки с таргетами. Фильтрация по дате и наличию применимых таргетов. */
    async loadActiveDiscounts(opts: {
        at: Date
        productIds?: number[]
        categoryIds?: number[]
        orderSetIds?: number[]
    }): Promise<DiscountSnapshot[]> {
        const atIso = opts.at
        const list = await strapi.db.query(DISCOUNT_UID).findMany({
            where: {
                status: 'active',
                $and: [
                    { $or: [{ startsAt: { $null: true } }, { startsAt: { $lte: atIso } }] },
                    { $or: [{ endsAt: { $null: true } }, { endsAt: { $gt: atIso } }] },
                ],
            },
            populate: {
                targets: {
                    populate: ['product', 'category', 'orderSet'],
                },
            },
            orderBy: { priority: 'asc' },
            limit: 500,
        })
        const prodSet = new Set(opts.productIds || [])
        const catSet = new Set(opts.categoryIds || [])
        const setSet = new Set(opts.orderSetIds || [])
        const result: DiscountSnapshot[] = []
        for (const d of list) {
            const targets: DiscountTargetSnapshot[] = (d.targets || []).map((t: any) => ({
                targetType: t.targetType,
                productId: t.product?.id ?? null,
                categoryId: t.category?.id ?? null,
                orderSetId: t.orderSet?.id ?? null,
                exclude: Boolean(t.exclude),
            }))
            // Для line/set — хотя бы один таргет должен касаться корзины; для order — пропускаем всегда.
            if (d.level !== 'order') {
                const touches = targets.some((t) => {
                    if (t.targetType === 'all-products') return true
                    if (t.targetType === 'product') return prodSet.has(Number(t.productId))
                    if (t.targetType === 'category') return catSet.has(Number(t.categoryId))
                    if (t.targetType === 'order-set') return setSet.has(Number(t.orderSetId))
                    return false
                })
                if (!touches) continue
            }
            result.push({
                id: d.id,
                version: Number(d.version || 1),
                name: d.name,
                publicLabel: d.publicLabel || null,
                level: d.level as DiscountLevel,
                benefitType: d.benefitType as BenefitType,
                benefitValue: Number(d.benefitValue || 0),
                maxDiscountAmount: d.maxDiscountAmount != null ? Number(d.maxDiscountAmount) : null,
                conditions: (d.conditions as any) ?? null,
                priority: Number(d.priority ?? 100),
                stackable: d.stackable !== false,
                exclusiveGroup: d.exclusiveGroup || null,
                targets,
            })
        }
        return result
    },

    /** Рассчитать `pricing` для списка продуктов и/или наборов — для вставки в каталог.
     *  Один пакетный вызов на всю страницу выдачи. */
    async catalogPricing(opts: {
        productIds?: number[]
        orderSetIds?: number[]
        at?: Date
        /** Источник для условий скидок (по умолчанию — витрина сайта). */
        source?: 'catalog' | 'request' | 'manual' | 'telegram'
    }): Promise<{
        products: Record<number, {
            basePrice: number
            finalPrice: number
            discountPercent: number
            label?: string | null
            endsAt?: string | null
            nextPrice?: null
        }>
        orderSets: Record<number, {
            basePrice: number
            finalPrice: number
            discountPercent: number
            label?: string | null
            endsAt?: string | null
            itemsTotal: number
        }>
    }> {
        const at = opts.at || new Date()
        const source = opts.source || 'catalog'
        const productIds = Array.from(new Set((opts.productIds || []).map(Number).filter(Boolean)))
        const orderSetIds = Array.from(new Set((opts.orderSetIds || []).map(Number).filter(Boolean)))

        // Для каждого товара — одноштучная корзина; быстрее одним квотом не выйдет из-за
        // сет-экземпляров/order-уровня, поэтому идём по продуктам поштучно (их десятки).
        // Для рассчёта endsAt — вытащим подробную инфу о скидках.
        const discountDetails = new Map<number, { endsAt: string | null }>()

        const products: Record<number, any> = {}
        for (const pid of productIds) {
            try {
                const q = await this.quote({
                    items: [{ type: 'product', productId: pid, qty: 1 }],
                    source,
                    at,
                })
                const l = q.lines[0]
                const base = l?.basePrice ?? 0
                const fin = l?.lineTotal ?? base
                const pct = base > 0 ? Math.round(((base - fin) / base) * 100) : 0
                const applied = q.appliedDiscounts[0]
                // Для label — предпочитаем publicLabel, иначе name.
                let endsAt: string | null = null
                if (applied?.discountId) {
                    if (!discountDetails.has(applied.discountId)) {
                        const d = await strapi.db.query(DISCOUNT_UID).findOne({
                            where: { id: applied.discountId }, select: ['endsAt'],
                        })
                        discountDetails.set(applied.discountId, { endsAt: d?.endsAt ?? null })
                    }
                    endsAt = discountDetails.get(applied.discountId)!.endsAt
                }
                products[pid] = {
                    basePrice: base,
                    finalPrice: fin,
                    discountPercent: pct > 0 ? pct : 0,
                    label: applied?.publicLabel || applied?.name || null,
                    endsAt,
                    nextPrice: null,
                }
            } catch {
                products[pid] = { basePrice: 0, finalPrice: 0, discountPercent: 0, label: null, endsAt: null, nextPrice: null }
            }
        }

        const orderSets: Record<number, any> = {}
        for (const sid of orderSetIds) {
            try {
                const q = await this.quote({
                    items: [{ type: 'set', orderSetId: sid, qty: 1 }],
                    source,
                    at,
                })
                const base = q.lines.reduce((s, l) => s + l.basePrice * l.qty, 0)
                const fin = q.total
                const pct = base > 0 ? Math.round(((base - fin) / base) * 100) : 0
                const setDiscount = q.appliedDiscounts.find((a) =>
                    q.lines.some((l) => l.discounts.some((d) => d.discountId === a.discountId && d.level === 'set')),
                )
                orderSets[sid] = {
                    basePrice: base,
                    finalPrice: fin,
                    discountPercent: pct > 0 ? pct : 0,
                    label: setDiscount?.publicLabel || setDiscount?.name || null,
                    endsAt: null,
                    itemsTotal: base,
                }
            } catch {
                orderSets[sid] = { basePrice: 0, finalPrice: 0, discountPercent: 0, label: null, endsAt: null, itemsTotal: 0 }
            }
        }

        return { products, orderSets }
    },

    /** Полный расчёт корзины. */
    async quote(input: QuoteInput): Promise<Quote> {
        const at = input.at ? new Date(input.at) : new Date()
        const source = input.source || 'catalog'

        // 1. Развернуть items в CartLineSnapshot[].
        const cart: CartLineSnapshot[] = []
        let keyCounter = 0
        const nextKey = () => `L${++keyCounter}`

        for (const it of input.items || []) {
            if ((it as any).type === 'set') {
                const sid = Number((it as any).orderSetId)
                const times = Math.max(1, Math.floor(Number((it as any).qty) || 1))
                const s = await strapi.db.query(ORDER_SET_UID).findOne({
                    where: { id: sid },
                    populate: { items: { populate: { product: { populate: ['category'] } } } },
                })
                if (!s) {
                    const err: any = new ApplicationError('order-set not found')
                    err.details = { code: 'INVALID_TARGET', orderSetId: sid }
                    throw err
                }
                for (let i = 0; i < times; i++) {
                    const instance = `${sid}-${i + 1}`
                    for (const comp of s.items || []) {
                        const p = comp.product
                        if (!p?.id) continue
                        const { amount, priceId } = await this.resolveBasePrice(p.id, at)
                        if (!(amount > 0)) {
                            const err: any = new ApplicationError('product unavailable or has no price')
                            err.details = { code: 'PRODUCT_UNAVAILABLE', productId: p.id }
                            throw err
                        }
                        cart.push({
                            lineKey: nextKey(),
                            productId: Number(p.id),
                            categoryId: p.category?.id ?? null,
                            name: p.name,
                            qty: Math.max(1, Math.floor(Number(comp.qty || 1))),
                            basePrice: Math.round(amount),
                            priceId,
                            orderSetId: sid,
                            setInstance: instance,
                        })
                    }
                }
            } else {
                const pid = Number((it as any).productId)
                const qty = Math.max(1, Math.floor(Number((it as any).qty) || 1))
                const p = await strapi.db.query(PRODUCT_UID).findOne({
                    where: { id: pid },
                    select: ['id', 'name', 'available'],
                    populate: ['category'],
                })
                if (!p) {
                    const err: any = new ApplicationError('product not found')
                    err.details = { code: 'PRODUCT_UNAVAILABLE', productId: pid }
                    throw err
                }
                if ((p as any).available === false) {
                    const err: any = new ApplicationError('product unavailable')
                    err.details = { code: 'PRODUCT_UNAVAILABLE', productId: pid }
                    throw err
                }
                const { amount, priceId } = await this.resolveBasePrice(pid, at)
                if (!(amount > 0)) {
                    const err: any = new ApplicationError('product has no active price')
                    err.details = { code: 'PRODUCT_UNAVAILABLE', productId: pid }
                    throw err
                }
                // Склеивание одинаковых товаров вне набора.
                const existing = cart.find((l) => l.productId === pid && !l.orderSetId)
                if (existing) {
                    existing.qty += qty
                } else {
                    cart.push({
                        lineKey: nextKey(),
                        productId: pid,
                        categoryId: (p as any).category?.id ?? null,
                        name: p.name,
                        qty,
                        basePrice: Math.round(amount),
                        priceId,
                        orderSetId: null,
                        setInstance: null,
                    })
                }
            }
        }

        // 2. Загрузить скидки.
        const activeDiscounts = await this.loadActiveDiscounts({
            at,
            productIds: Array.from(new Set(cart.map((l) => l.productId).filter(Boolean) as number[])),
            categoryIds: Array.from(new Set(cart.map((l) => l.categoryId).filter(Boolean) as number[])),
            orderSetIds: Array.from(new Set(cart.map((l) => l.orderSetId).filter(Boolean) as number[])),
        })
        if (Array.isArray(input.includeDiscountIds) && input.includeDiscountIds.length) {
            const have = new Set(activeDiscounts.map((d) => d.id))
            const extraIds = input.includeDiscountIds.filter((id) => !have.has(Number(id)))
            if (extraIds.length) {
                const extras = await strapi.db.query(DISCOUNT_UID).findMany({
                    where: { id: { $in: extraIds } },
                    populate: { targets: { populate: ['product', 'category', 'orderSet'] } },
                })
                for (const d of extras) {
                    const targets: DiscountTargetSnapshot[] = (d.targets || []).map((t: any) => ({
                        targetType: t.targetType,
                        productId: t.product?.id ?? null,
                        categoryId: t.category?.id ?? null,
                        orderSetId: t.orderSet?.id ?? null,
                        exclude: Boolean(t.exclude),
                    }))
                    activeDiscounts.push({
                        id: d.id,
                        version: Number(d.version || 1),
                        name: d.name,
                        publicLabel: d.publicLabel || null,
                        level: d.level as DiscountLevel,
                        benefitType: d.benefitType as BenefitType,
                        benefitValue: Number(d.benefitValue || 0),
                        maxDiscountAmount: d.maxDiscountAmount != null ? Number(d.maxDiscountAmount) : null,
                        conditions: (d.conditions as any) ?? null,
                        priority: Number(d.priority ?? 100),
                        stackable: d.stackable !== false,
                        exclusiveGroup: d.exclusiveGroup || null,
                        targets,
                    })
                }
            }
        }

        // Определить клиента (для clientKind, нужен в условиях скидок). Пока только individual.
        let clientKind: 'individual' | 'shop' | null = 'individual'
        if (input.clientId) {
            // В Phase 3 модели ещё нет клиентского вида — оставляем individual.
        }

        const ctx: QuoteContext = {
            deliveryMethod: input.deliveryMethod || null,
            paymentMethod: input.paymentMethod || null,
            clientKind,
            source,
            at,
        }

        return evaluate(cart, activeDiscounts, ctx)
    },

    // ─────────── Миграции ───────────

    async migratePricingV1(): Promise<{ migrated: number; skipped: number }> {
        const store = strapi.store({ type: 'core', name: 'souppack' })
        const flag = await store.get({ key: 'pricing-migrated-v1' })
        if (flag) return { migrated: 0, skipped: 0 }

        const products = await strapi.db.query(PRODUCT_UID).findMany({
            select: ['id', 'price', 'createdAt'],
        })
        let migrated = 0
        let skipped = 0
        for (const p of products) {
            const existing = await strapi.db.query(PRICE_UID).count({
                where: { product: { id: p.id } },
            })
            if (existing > 0) { skipped++; continue }
            const amount = Math.round(Number(p.price || 0))
            if (!(amount > 0)) { skipped++; continue }
            await strapi.db.query(PRICE_UID).create({
                data: {
                    product: p.id,
                    amount,
                    validFrom: p.createdAt || new Date(),
                    validTo: null,
                    comment: 'migration-v1',
                    publishedAt: new Date(),
                },
            })
            migrated++
        }

        await store.set({ key: 'pricing-migrated-v1', value: { at: new Date().toISOString(), migrated } })
        strapi.log.info(`[pricing] migration v1: created ${migrated} price rows (${skipped} skipped)`)
        return { migrated, skipped }
    },

})

function toRow(r: any): PriceRow {
    return {
        id: Number(r.id),
        documentId: r.documentId,
        amount: Number(r.amount || 0),
        validFrom: r.validFrom,
        validTo: r.validTo || null,
        comment: r.comment || null,
    }
}
