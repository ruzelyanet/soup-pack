/** Чистые функции жизненного цикла скидки — используются в контроллере и тестируются отдельно. */

export type DiscountStatus = 'draft' | 'active' | 'paused' | 'archived'
export type DisplayState = 'draft' | 'scheduled' | 'active' | 'ended' | 'paused' | 'archived'

export type ReadinessProblem = { field: string; code: string; message: string }

/** Матрица допустимых переходов. Отсутствие в массиве = запрет. */
export const STATUS_TRANSITIONS: Record<DiscountStatus, DiscountStatus[]> = {
    draft: ['active', 'archived'],
    active: ['paused', 'archived'],
    paused: ['active', 'archived'],
    archived: [],
}

export function canTransition(from: DiscountStatus, to: DiscountStatus): boolean {
    return (STATUS_TRANSITIONS[from] || []).includes(to)
}

/** Готовность скидки к активации (3.2). Пустой массив = готова. */
export function checkReadiness(
    d: {
        name?: string | null
        level: 'line' | 'set' | 'order'
        benefitType: 'percent' | 'fixed_amount' | 'fixed_price'
        benefitValue?: number
        startsAt?: Date | string | null
        endsAt?: Date | string | null
        conditions?: Record<string, any> | null
    },
    targets: Array<{ targetType: string; exclude?: boolean }>,
    opts: { allowAlreadyEnded?: boolean; now?: Date } = {},
): ReadinessProblem[] {
    const problems: ReadinessProblem[] = []
    const now = opts.now || new Date()
    if (!d.name || !String(d.name).trim()) {
        problems.push({ field: 'name', code: 'NAME_REQUIRED', message: 'Укажите название' })
    }
    const bv = Number(d.benefitValue || 0)
    if (d.benefitType === 'percent') {
        if (!(bv >= 1 && bv <= 99)) problems.push({ field: 'benefitValue', code: 'BENEFIT_INVALID', message: 'Неверный размер скидки' })
    } else {
        if (!(bv > 0)) problems.push({ field: 'benefitValue', code: 'BENEFIT_INVALID', message: 'Неверный размер скидки' })
    }
    if (d.level === 'line') {
        const hasInclude = targets.some((t) => !t.exclude && ['product', 'category', 'all-products'].includes(t.targetType))
        if (!hasInclude) problems.push({ field: 'targets', code: 'TARGETS_REQUIRED', message: 'Выберите товары или категории' })
    } else if (d.level === 'set') {
        const hasSet = targets.some((t) => !t.exclude && t.targetType === 'order-set')
        if (!hasSet) problems.push({ field: 'targets', code: 'TARGETS_REQUIRED', message: 'Выберите набор' })
    }
    if (d.endsAt && !opts.allowAlreadyEnded) {
        if (new Date(d.endsAt).getTime() <= now.getTime()) {
            problems.push({ field: 'endsAt', code: 'ALREADY_ENDED', message: 'Дата окончания уже прошла' })
        }
    }
    if (d.startsAt && d.endsAt && new Date(d.startsAt).getTime() >= new Date(d.endsAt).getTime()) {
        problems.push({ field: 'startsAt', code: 'PERIOD_INVALID', message: 'Начало позже окончания' })
    }
    const hm = /^\d{1,2}:\d{2}$/
    const c = d.conditions
    if (c?.timeFrom && !hm.test(String(c.timeFrom))) {
        problems.push({ field: 'conditions.timeFrom', code: 'TIME_INVALID', message: 'Неверное время' })
    }
    if (c?.timeTo && !hm.test(String(c.timeTo))) {
        problems.push({ field: 'conditions.timeTo', code: 'TIME_INVALID', message: 'Неверное время' })
    }
    return problems
}

/** Отображаемое состояние скидки (3.3). Вычислимо, в БД не хранится. */
export function displayState(
    d: { status: DiscountStatus; startsAt?: Date | string | null; endsAt?: Date | string | null },
    now: Date,
): DisplayState {
    if (d.status === 'draft') return 'draft'
    if (d.status === 'paused') return 'paused'
    if (d.status === 'archived') return 'archived'
    if (d.startsAt && new Date(d.startsAt).getTime() > now.getTime()) return 'scheduled'
    if (d.endsAt && new Date(d.endsAt).getTime() <= now.getTime()) return 'ended'
    return 'active'
}
