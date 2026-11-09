/** Единственный источник текстов о скидке в админке. См. docs/discount-card.md §6.4. */

import type { Discount, DiscountLevel, DiscountStatus, DiscountTarget } from '@/services/resources'

export type DisplayState = 'draft' | 'scheduled' | 'active' | 'ended' | 'paused' | 'archived'

export const LEVEL_LABEL: Record<DiscountLevel, string> = {
    line: 'На товары',
    set: 'На набор',
    order: 'На весь чек',
}
export function levelLabel(l: DiscountLevel): string {
    return LEVEL_LABEL[l] || l
}

export const STATUS_LABEL: Record<DiscountStatus, string> = {
    draft: 'Черновик',
    active: 'Активна',
    paused: 'Пауза',
    archived: 'Архив',
}
export function statusLabel(s: DiscountStatus): string {
    return STATUS_LABEL[s] || s
}

export const DISPLAY_STATE_LABEL: Record<DisplayState, string> = {
    draft: 'Черновик',
    scheduled: 'Запланирована',
    active: 'Активна',
    ended: 'Завершилась',
    paused: 'На паузе',
    archived: 'В архиве',
}
export const DISPLAY_STATE_COLOR: Record<DisplayState, string> = {
    draft: 'bg-ink-100 text-ink-700',
    scheduled: 'bg-sky-100 text-sky-800',
    active: 'bg-green-500/15 text-green-700',
    ended: 'bg-ink-100 text-ink-500 ring-1 ring-ink-200',
    paused: 'bg-saffron-300/30 text-ink-900',
    archived: 'bg-ink-100 text-ink-500',
}

export function benefitLabel(d: { benefitType: string; benefitValue: number }): string {
    if (d.benefitType === 'percent') return `−${d.benefitValue}%`
    const fmt = (v: number) => new Intl.NumberFormat('ru-RU').format(v) + ' сум'
    if (d.benefitType === 'fixed_amount') return `−${fmt(d.benefitValue)}`
    return `Цена ${fmt(d.benefitValue)}`
}

/** Отображаемое состояние по статусу + периоду. Должно совпадать с бэкендом (`backend/src/api/discount/lifecycle.ts`). */
export function displayState(
    d: { status: DiscountStatus; startsAt?: string | null; endsAt?: string | null },
    now: Date = new Date(),
): DisplayState {
    if (d.status === 'draft') return 'draft'
    if (d.status === 'paused') return 'paused'
    if (d.status === 'archived') return 'archived'
    if (d.startsAt && new Date(d.startsAt).getTime() > now.getTime()) return 'scheduled'
    if (d.endsAt && new Date(d.endsAt).getTime() <= now.getTime()) return 'ended'
    return 'active'
}

const WEEKDAY_NAMES = ['', 'понедельник', 'вторник', 'среду', 'четверг', 'пятницу', 'субботу', 'воскресенье']
const DELIVERY_LABEL: Record<string, string> = { courier_now: 'Курьером сейчас', preorder: 'Предзаказ' }
const PAYMENT_LABEL: Record<string, string> = { cash: 'Наличными', card: 'Картой', click: 'Click', payme: 'Payme', transfer: 'Переводом' }

function fmtMoney(v: number) {
    return new Intl.NumberFormat('ru-RU').format(v) + ' сум'
}
function fmtDate(d: string | null | undefined) {
    if (!d) return ''
    return new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** Условия словами. Пустые условия → `[]`. */
export function describeConditions(c?: Record<string, any> | null): string[] {
    if (!c) return []
    const parts: string[] = []
    if (typeof c.minSubtotal === 'number' && c.minSubtotal > 0) parts.push(`сумма заказа не меньше ${fmtMoney(c.minSubtotal)}`)
    if (typeof c.minQty === 'number' && c.minQty > 1) parts.push(`не меньше ${c.minQty} шт. этого товара`)
    if (Array.isArray(c.deliveryMethods) && c.deliveryMethods.length) {
        parts.push('при доставке «' + c.deliveryMethods.map((m: string) => DELIVERY_LABEL[m] || m).join('», «') + '»')
    }
    if (Array.isArray(c.paymentMethods) && c.paymentMethods.length) {
        parts.push('при оплате «' + c.paymentMethods.map((m: string) => PAYMENT_LABEL[m] || m).join('», «') + '»')
    }
    if (Array.isArray(c.weekdays) && c.weekdays.length) {
        const names = c.weekdays.map((n: number) => WEEKDAY_NAMES[n] || n)
        parts.push('в ' + names.join(', '))
    }
    if (c.timeFrom || c.timeTo) {
        parts.push('с ' + (c.timeFrom || '00:00') + ' до ' + (c.timeTo || '24:00'))
    }
    return parts
}

/** Одна фраза для hero/итога формы/строки списка. */
export function describeDiscount(
    d: Partial<Discount>,
    refs?: { productName?: (id: number) => string | null; categoryName?: (id: number) => string | null; orderSetName?: (id: number) => string | null },
): string {
    const bits: string[] = []
    bits.push(benefitLabel({ benefitType: d.benefitType || 'percent', benefitValue: d.benefitValue || 0 }))

    const targets = d.targets || []
    const includes = targets.filter((t) => !t.exclude)
    const excludes = targets.filter((t) => t.exclude)

    if (d.level === 'line') {
        const chunks: string[] = []
        for (const t of includes) {
            if (t.targetType === 'all-products') chunks.push('все товары')
            else if (t.targetType === 'product') chunks.push('«' + (refs?.productName?.(Number(t.product?.id)) || t.product?.name || 'товар') + '»')
            else if (t.targetType === 'category') chunks.push('категорию «' + (refs?.categoryName?.(Number(t.category?.id)) || t.category?.name || 'категория') + '»')
        }
        if (chunks.length) bits.push('на ' + chunks.join(', '))
        if (excludes.length) {
            const ex = excludes.map((t) => '«' + (t.product?.name || 'товар') + '»').join(', ')
            bits.push('кроме ' + ex)
        }
    } else if (d.level === 'set') {
        const chunks = includes.filter((t) => t.targetType === 'order-set')
            .map((t) => '«' + (refs?.orderSetName?.(Number(t.orderSet?.id)) || t.orderSet?.name || 'набор') + '»')
        if (chunks.length) bits.push('на ' + chunks.join(', '))
    } else if (d.level === 'order') {
        bits.push('на весь чек')
    }

    const cond = describeConditions(d.conditions as any)
    if (cond.length) bits.push(cond.join('; '))

    if (d.startsAt || d.endsAt) {
        const from = d.startsAt ? 'с ' + fmtDate(d.startsAt) : ''
        const to = d.endsAt ? 'по ' + fmtDate(d.endsAt) : ''
        bits.push([from, to].filter(Boolean).join(' '))
    }

    return bits.filter(Boolean).join('; ')
}

/** Коды «не применена» из explanations → по-человечески. */
const REASON_LABEL: Record<string, string> = {
    minQty: 'не набрано минимальное количество',
    minSubtotal: 'не достигнута минимальная сумма',
    deliveryMethod: 'другой способ доставки',
    paymentMethod: 'другой способ оплаты',
    clientKind: 'другой тип клиента',
    source: 'другой источник заказа',
    weekday: 'не тот день недели',
    timeFrom: 'ещё не время',
    timeTo: 'время уже прошло',
    'no-benefit': 'выгоды нет (цена ниже скидки)',
    'no-benefit-after-chain': 'после других скидок уже нулевая',
}
export function reasonLabel(code?: string | null): string {
    if (!code) return 'не применена'
    if (code in REASON_LABEL) return REASON_LABEL[code]
    if (code.startsWith('INVALID_CONDITION')) return 'неверное условие'
    return code
}

/** Форма формы — наборы `MultiSelect` → targets[]. */
export type DraftTargetsForm = {
    allProducts: boolean
    productIds: number[]
    categoryIds: number[]
    excludeProductIds: number[]
    orderSetIds: number[]
}
export function targetsToForm(targets: DiscountTarget[] | undefined): DraftTargetsForm {
    const t = targets || []
    return {
        allProducts: t.some((x) => !x.exclude && x.targetType === 'all-products'),
        productIds: t.filter((x) => !x.exclude && x.targetType === 'product').map((x) => Number(x.product?.id)).filter(Boolean),
        categoryIds: t.filter((x) => !x.exclude && x.targetType === 'category').map((x) => Number(x.category?.id)).filter(Boolean),
        excludeProductIds: t.filter((x) => x.exclude && x.targetType === 'product').map((x) => Number(x.product?.id)).filter(Boolean),
        orderSetIds: t.filter((x) => !x.exclude && x.targetType === 'order-set').map((x) => Number(x.orderSet?.id)).filter(Boolean),
    }
}
export function formToTargets(form: DraftTargetsForm, level: DiscountLevel): Array<{
    targetType: 'product' | 'category' | 'order-set' | 'all-products'
    product?: number | null
    category?: number | null
    orderSet?: number | null
    exclude: boolean
}> {
    if (level === 'order') return []
    if (level === 'set') return form.orderSetIds.map((id) => ({ targetType: 'order-set' as const, orderSet: id, exclude: false }))
    const out: ReturnType<typeof formToTargets> = []
    if (form.allProducts) out.push({ targetType: 'all-products', exclude: false })
    for (const pid of form.productIds) out.push({ targetType: 'product', product: pid, exclude: false })
    for (const cid of form.categoryIds) out.push({ targetType: 'category', category: cid, exclude: false })
    for (const pid of form.excludeProductIds) out.push({ targetType: 'product', product: pid, exclude: true })
    return out
}
