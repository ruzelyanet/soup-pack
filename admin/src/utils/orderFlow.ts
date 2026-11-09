import type { Order, OrderStatus } from '@/services/resources'

export type StageKey = 'created' | 'taken' | 'confirmed' | 'in_progress' | 'paid' | 'done'
export type StageState = 'done' | 'current' | 'upcoming' | 'skipped' | 'canceled'
export type StageActionKind = 'take' | 'confirm' | 'start' | 'pay' | 'finish'

export type StageAction = {
    kind: StageActionKind
    label: string
}

export type Stage = {
    key: StageKey
    title: string
    description: string
    state: StageState
    at: string | null
    actor: { id: number; fullName: string } | null
    durationMin: number | null
    action: StageAction | null
}

/** Подписи статусов для таблицы и чипов (TZ 2.1). */
export const STATUS_LABEL: Record<OrderStatus, string> = {
    new:         'Новый',
    accepted:    'Подтверждён',
    in_progress: 'Готовим и доставляем',
    done:        'Завершён',
    canceled:    'Отменён',
}

/** Пилюля статуса в таблице и шапке панели: bg + text. */
export const STATUS_PILL: Record<OrderStatus, string> = {
    new:         'bg-saffron-300/25 text-saffron-500',
    accepted:    'bg-olive-500/15 text-olive-500',
    in_progress: 'bg-olive-500/15 text-olive-500',
    done:        'bg-olive-500/15 text-olive-500',
    canceled:    'bg-tomato-500/15 text-tomato-500',
}

/** CSS-переменная для акцентной полосы открытой строки (одно значение на статус). */
export const STATUS_ACCENT: Record<OrderStatus, string> = {
    new:         '#e8b824',
    accepted:    '#6b7a3f',
    in_progress: '#6b7a3f',
    done:        '#6b7a3f',
    canceled:    '#d14836',
}

/** Чип текущего этапа (таблица, шапка страницы заказа): «Новый» и «Взят в работу» различаются по сотруднику. */
export function stageChip(order: { status: OrderStatus; employee?: unknown }): { label: string; cls: string } {
    if (order.status === 'canceled') return { label: STATUS_LABEL.canceled, cls: 'bg-tomato-500/15 text-tomato-600' }
    if (order.status === 'new' && order.employee) return { label: 'Взят в работу', cls: 'bg-primary-100 text-primary-700' }
    if (order.status === 'new') return { label: STATUS_LABEL.new, cls: 'bg-saffron-300/25 text-ink-900' }
    if (order.status === 'accepted') return { label: STATUS_LABEL.accepted, cls: 'bg-primary-100 text-primary-700' }
    return { label: STATUS_LABEL[order.status], cls: 'bg-olive-500/15 text-olive-500' }
}

/** Человеческие названия полей заказа для истории «Изменён заказ». */
export const FIELD_LABEL: Record<string, string> = {
    items:          'состав',
    client:         'клиент',
    address:        'адрес',
    deliveryMethod: 'способ доставки',
    deliverySlotAt: 'время доставки',
    paymentMethod:  'способ оплаты',
    comment:        'комментарий',
    lat:            'точка на карте',
    lng:            'точка на карте',
    status:         'статус',
    cancelReason:   'причина отмены',
}

type OrderEvent = {
    id: number
    kind: string
    payload?: any
    note?: string | null
    actor?: { id: number; fullName: string } | null
    publishedAt?: string
    createdAt?: string
}

type OrderLike = {
    id: number
    status: OrderStatus
    createdAt: string
    source: 'catalog' | 'request' | 'manual' | 'telegram'
    cancelReason?: string | null
    employee?: { id?: number; fullName?: string } | null
    request?: { code?: string } | null
    deliveryMethod?: 'courier_now' | 'preorder'
    deliverySlotAt?: string | null
    paymentMethod?: string
    total?: number | string | null
    paidAmount?: number | null
    paymentStatus?: string | null
}

/** Заказ оплачен полностью (оплачен или переплата). */
export function isOrderPaid(order: { total?: number | string | null; paidAmount?: number | null; paymentStatus?: string | null }): boolean {
    if (order.paymentStatus === 'paid' || order.paymentStatus === 'overpaid') return true
    if (order.total == null) return false
    return Number(order.paidAmount ?? 0) >= Number(order.total)
}

const STAGE_TITLES: Record<StageKey, string> = {
    created:     'Поступил',
    taken:       'Взят в работу',
    confirmed:   'Подтверждён клиентом',
    in_progress: 'Готовим и доставляем',
    paid:        'Оплачен',
    done:        'Завершён',
}

/** Описание этапа (с подстановкой данных заказа). */
function describe(key: StageKey, order: OrderLike): string {
    switch (key) {
        case 'created': {
            const src = order.source === 'catalog' ? 'из каталога'
                : order.source === 'telegram' ? 'через Telegram'
                : order.source === 'manual' ? 'вручную'
                : order.request?.code ? `из заявки ${order.request.code}` : 'из заявки'
            return `Заказ оформлен ${src}.`
        }
        case 'taken':
            return 'Сотрудник отвечает за заказ до конца. Пока заказ ничей — его может взять любой.'
        case 'confirmed':
            return 'Позвоните клиенту: проверьте состав, адрес и время доставки, способ оплаты. Подтверждайте после устного согласия клиента.'
        case 'in_progress': {
            if (order.deliveryMethod === 'preorder' && order.deliverySlotAt) {
                const dt = new Date(order.deliverySlotAt).toLocaleString('ru-RU', {
                    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                })
                return `Заказ собирается и передаётся в доставку. Доставка к ${dt}.`
            }
            return 'Заказ собирается и передаётся в доставку.'
        }
        case 'paid': {
            const total = Number(order.total ?? 0)
            const paid = Number(order.paidAmount ?? 0)
            if (isOrderPaid(order)) return `Оплачено ${fmt(paid)}.`
            if (paid > 0) {
                return `Оплачено ${fmt(paid)} из ${fmt(total)}, остаток ${fmt(Math.max(0, total - paid))}. Заказ завершается только после полной оплаты.`
            }
            return `Примите оплату ${fmt(total)}. Заказ завершается только после полной оплаты.`
        }
        case 'done':
            return 'Заказ доставлен и оплачен.'
    }
}

/** Порядковый номер статуса в процессе; -1 = canceled. */
const STATUS_ORDER: Record<OrderStatus, number> = {
    new: 0, accepted: 2, in_progress: 3, done: 4, canceled: -1,
}

/** Хронологический индекс этапа. */
const STAGE_ORDER: Record<StageKey, number> = {
    created: 0, taken: 1, confirmed: 2, in_progress: 3, paid: 4, done: 5,
}

function minutesBetween(a: string | null, b: string | null): number | null {
    if (!a || !b) return null
    return Math.max(0, Math.round((+new Date(b) - +new Date(a)) / 60_000))
}

/** Главная функция: по заказу и его событиям собрать 6 этапов с подписями
 *  (Поступил → Взят → Подтверждён → Готовим и доставляем → Оплачен → Завершён).
 *  Чистая, детерминированная — покрыта тестами. */
export function buildOrderStages(order: OrderLike, events: OrderEvent[], now: Date = new Date()): Stage[] {
    const nowIso = now.toISOString()

    // Привязка «кто/когда» к этапам по событиям.
    const takenEv = events.find((e) => e.kind === 'taken') || null
    const statusEvs = events.filter((e) => e.kind === 'status_changed')
    const confirmedEv = statusEvs.find((e) => e.payload?.to === 'accepted') || null
    const inProgressEv = statusEvs.find((e) => e.payload?.to === 'in_progress') || null
    const doneEv = statusEvs.find((e) => e.payload?.to === 'done') || null
    const canceledEv = statusEvs.find((e) => e.payload?.to === 'canceled') || null
    // «Оплачен» — последний платёж (тот, что закрыл сумму).
    const paymentEvs = events.filter((e) => e.kind === 'payment')
    const paidEv = paymentEvs.length ? paymentEvs[paymentEvs.length - 1] : null

    const createdAt = order.createdAt || null
    const takenAt = takenEv?.publishedAt || takenEv?.createdAt || null
    const confirmedAt = confirmedEv?.publishedAt || confirmedEv?.createdAt || null
    const inProgressAt = inProgressEv?.publishedAt || inProgressEv?.createdAt || null
    const doneAt = doneEv?.publishedAt || doneEv?.createdAt || null
    const canceledAt = canceledEv?.publishedAt || canceledEv?.createdAt || null
    const paidAt = paidEv?.publishedAt || paidEv?.createdAt || null

    const actor = (ev: OrderEvent | null): Stage['actor'] =>
        ev?.actor?.id ? { id: ev.actor.id, fullName: ev.actor.fullName || '' } : null

    const base: Record<StageKey, { at: string | null; actor: Stage['actor'] }> = {
        created:     { at: createdAt, actor: null },
        taken:       {
            at: takenAt,
            actor: actor(takenEv) || (order.employee?.id
                ? { id: order.employee.id, fullName: order.employee.fullName || '' }
                : null),
        },
        confirmed:   { at: confirmedAt, actor: actor(confirmedEv) },
        in_progress: { at: inProgressAt, actor: actor(inProgressEv) },
        paid:        { at: paidAt, actor: actor(paidEv) },
        done:        { at: doneAt, actor: actor(doneEv) },
    }

    // Какие этапы пройдены — считаем сначала без учёта отмены.
    const passedByStatus: Record<StageKey, boolean> = {
        created:     true,
        taken:       !!order.employee,
        confirmed:   STATUS_ORDER[order.status] >= STATUS_ORDER.accepted,
        in_progress: STATUS_ORDER[order.status] >= STATUS_ORDER.in_progress,
        // Оплата может прийти на любом шаге (предоплата) — этап засчитывается по факту полной оплаты.
        paid:        order.status !== 'canceled' && isOrderPaid(order),
        done:        order.status === 'done',
    }

    // Fallback: для старых заказов, где confirmed-события нет, но status уже accepted —
    // берём время/автора из `taken`.
    if (passedByStatus.confirmed && !base.confirmed.at) {
        base.confirmed = { at: takenAt, actor: base.taken.actor }
    }

    const isCanceled = order.status === 'canceled'

    // Ключ текущего этапа (первый незавершённый).
    const stageKeys: StageKey[] = ['created', 'taken', 'confirmed', 'in_progress', 'paid', 'done']
    let currentKey: StageKey | null = null
    for (const k of stageKeys) {
        if (!passedByStatus[k]) { currentKey = k; break }
    }

    // Если заказ отменён — определим этап, на котором отменили (первый непройденный до отмены).
    const canceledOn: StageKey | null = isCanceled ? (currentKey || 'done') : null

    const stages: Stage[] = stageKeys.map((key) => {
        const isPassed = passedByStatus[key]
        let state: StageState = 'upcoming'
        if (isCanceled) {
            if (isPassed) state = 'done'
            else if (key === canceledOn) state = 'canceled'
            else state = 'skipped'
        } else {
            if (isPassed) state = 'done'
            else if (key === currentKey) state = 'current'
            else state = 'upcoming'
        }

        // Длительность: для пройденного — от его `at` до `at` следующего пройденного (или canceledAt).
        let durationMin: number | null = null
        if (state === 'done' && key === 'paid') {
            durationMin = null // оплата не «длится» — время оплаты видно в `at`
        } else if (state === 'done') {
            const idx = STAGE_ORDER[key]
            // Оплата может прийти раньше других шагов — в цепочку длительностей её не берём.
            const nextPassed = stageKeys.find((k) => k !== 'paid' && STAGE_ORDER[k] > idx && (passedByStatus[k] || k === canceledOn))
            const nextAt = nextPassed
                ? (nextPassed === canceledOn ? canceledAt : base[nextPassed].at)
                : null
            durationMin = minutesBetween(base[key].at, nextAt)
        } else if (state === 'current' && key === 'paid') {
            // Ждём оплату с момента передачи в работу (или с создания).
            durationMin = minutesBetween(base.in_progress.at ?? createdAt, nowIso)
        } else if (state === 'current') {
            durationMin = minutesBetween(base[key].at ?? createdAt, nowIso)
        } else if (state === 'canceled') {
            durationMin = minutesBetween(base[key].at ?? createdAt, canceledAt)
        }

        const action: StageAction | null = state === 'current'
            ? stageAction(key)
            : null

        return {
            key,
            title: STAGE_TITLES[key],
            description: describe(key, order),
            state,
            at: base[key].at,
            actor: base[key].actor,
            durationMin,
            action,
        }
    })

    return stages
}

function stageAction(key: StageKey): StageAction | null {
    switch (key) {
        case 'taken':       return { kind: 'take',    label: 'Взять в работу' }
        case 'confirmed':   return { kind: 'confirm', label: 'Клиент подтвердил' }
        case 'in_progress': return { kind: 'start',   label: 'Передать в работу' }
        case 'paid':        return { kind: 'pay',     label: 'Принять оплату' }
        case 'done':        return { kind: 'finish',  label: 'Завершить' }
        case 'created':     return null
    }
}

/** Понятная подпись события истории. */
export type HistoryLine = { kind: string; title: string; detail: string | null; icon: string }
export function historyLineLabel(ev: OrderEvent, order: { cancelReason?: string | null }): HistoryLine {
    switch (ev.kind) {
        case 'created': {
            const src = ev.payload?.source === 'catalog' ? 'из каталога'
                : ev.payload?.source === 'telegram' ? 'через Telegram'
                : ev.payload?.source === 'manual' ? 'вручную'
                : ev.payload?.source === 'request' ? 'из заявки' : ''
            return { kind: 'created', title: 'Заказ создан' + (src ? ' ' + src : ''), detail: null, icon: 'pi-plus-circle' }
        }
        case 'taken':
            return {
                kind: 'taken', title: 'Взят в работу',
                detail: ev.payload?.auto ? 'создатель заказа' : null,
                icon: 'pi-user-plus',
            }
        case 'status_changed': {
            const to = ev.payload?.to as OrderStatus | undefined
            if (to === 'canceled') {
                const reason = ev.payload?.cancelReason || order.cancelReason || ''
                const n = Array.isArray(ev.payload?.cancelledTransactions) ? ev.payload.cancelledTransactions.length : 0
                const detail = [reason, n ? `сторнировано транзакций: ${n}` : ''].filter(Boolean).join(' · ')
                return { kind: 'status_changed', title: 'Отменён', detail: detail || null, icon: 'pi-times-circle' }
            }
            const title =
                to === 'accepted' ? 'Подтверждён клиентом' :
                to === 'in_progress' ? 'Передан в работу' :
                to === 'done' ? 'Завершён' :
                'Статус изменён'
            return { kind: 'status_changed', title, detail: ev.note || null, icon: 'pi-check' }
        }
        case 'payment': {
            const amount = Number(ev.payload?.amount || 0)
            return { kind: 'payment', title: `Оплата +${fmt(amount)}`, detail: ev.payload?.method || null, icon: 'pi-wallet' }
        }
        case 'refund': {
            const amount = Number(ev.payload?.amount || 0)
            return { kind: 'refund', title: `Возврат −${fmt(amount)}`, detail: ev.payload?.method || null, icon: 'pi-undo' }
        }
        case 'tx-cancelled':
            return { kind: 'tx-cancelled', title: `Сторно транзакции ${ev.payload?.code || ''}`, detail: ev.payload?.reason || null, icon: 'pi-ban' }
        case 'updated': {
            const raw: string[] = Array.isArray(ev.payload?.fields) ? ev.payload.fields : []
            const names = Array.from(new Set(raw.map((f) => FIELD_LABEL[f] || f)))
            const before = ev.payload?.totalBefore
            const after = ev.payload?.totalAfter
            const totalPart = before != null && after != null && Number(before) !== Number(after)
                ? `итог ${fmt(Number(before))} → ${fmt(Number(after))}`
                : ''
            const title = raw.includes('items') ? 'Изменён состав заказа' : 'Изменён заказ'
            const detail = [names.join(', '), totalPart].filter(Boolean).join(' · ')
            return { kind: 'updated', title, detail: detail || null, icon: 'pi-pencil' }
        }
        default:
            return { kind: ev.kind, title: ev.kind, detail: ev.note || null, icon: 'pi-circle' }
    }
}

function fmt(n: number): string {
    return new Intl.NumberFormat('ru-RU').format(Math.round(n)) + ' сум'
}
