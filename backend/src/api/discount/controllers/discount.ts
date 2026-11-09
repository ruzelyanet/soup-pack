import { factories } from '@strapi/strapi'
import { errors } from '@strapi/utils'
import { evaluate, type DiscountSnapshot, type DiscountLevel, type BenefitType, type CartLineSnapshot, type QuoteContext } from '../../price/services/pricing'
import { checkReadiness, displayState, STATUS_TRANSITIONS } from '../lifecycle'

const { ApplicationError } = errors

const DISCOUNT_UID = 'api::discount.discount' as const
const TARGET_UID = 'api::discount-target.discount-target' as const
const EVENT_UID = 'api::discount-event.discount-event' as const

const KNOWN_CONDITION_KEYS = new Set([
    'minSubtotal', 'minQty', 'deliveryMethods', 'paymentMethods',
    'clientKinds', 'weekdays', 'timeFrom', 'timeTo', 'sources', 'couponRequired',
])

// ─────────── Валидация ───────────

function validateConditions(conditions: any): string | null {
    if (conditions == null) return null
    if (typeof conditions !== 'object' || Array.isArray(conditions)) return 'conditions must be an object'
    for (const k of Object.keys(conditions)) {
        if (!KNOWN_CONDITION_KEYS.has(k)) return `unknown condition: ${k}`
    }
    return null
}

function validateTargets(level: string, targets: any[] | undefined): string | null {
    if (!Array.isArray(targets)) return null
    if (level === 'line') {
        for (const t of targets) {
            if (!['product', 'category', 'all-products'].includes(t.targetType)) {
                return `invalid target for level=line: ${t.targetType}`
            }
            if (t.targetType === 'product' && !t.product) return 'product target requires product'
            if (t.targetType === 'category' && !t.category) return 'category target requires category'
        }
    } else if (level === 'set') {
        for (const t of targets) {
            if (t.targetType !== 'order-set' || !t.orderSet) {
                return `set-level discount target must be order-set`
            }
        }
    } else if (level === 'order') {
        if (targets.length) return 'order-level discount must have no targets (use conditions)'
    }
    return null
}

// ─────────── Жизненный цикл ───────────

async function recordEvent(
    strapi: any,
    discountId: number,
    data: { type: string; fromStatus?: string | null; toStatus?: string | null; payload?: any; comment?: string | null; employeeId?: number | null },
) {
    try {
        await strapi.db.query(EVENT_UID).create({
            data: {
                discount: discountId,
                type: data.type,
                fromStatus: data.fromStatus ?? null,
                toStatus: data.toStatus ?? null,
                payload: data.payload ?? null,
                comment: data.comment ?? null,
                employee: data.employeeId ?? null,
                publishedAt: new Date(),
            },
        })
    } catch (e: any) {
        strapi.log?.warn?.(`[discount-event] write failed: ${e?.message || e}`)
    }
}

/** Собрать цепочку версий (previousVersion). Возвращает по возрастанию версии. */
async function versionChain(strapi: any, id: number): Promise<Array<{ id: number; version: number; status: string; createdAt: any; previousVersionId: number | null }>> {
    const all = new Map<number, any>()
    // Идём вверх по previousVersion.
    let cur: any = await strapi.db.query(DISCOUNT_UID).findOne({ where: { id }, populate: ['previousVersion'] })
    while (cur) {
        if (all.has(cur.id)) break
        all.set(cur.id, cur)
        if (cur.previousVersion?.id) {
            cur = await strapi.db.query(DISCOUNT_UID).findOne({ where: { id: cur.previousVersion.id }, populate: ['previousVersion'] })
        } else cur = null
    }
    // Идём вниз — кто ссылается на текущую как previousVersion.
    const toVisit = Array.from(all.keys())
    while (toVisit.length) {
        const nid = toVisit.shift()!
        const kids = await strapi.db.query(DISCOUNT_UID).findMany({ where: { previousVersion: { id: nid } }, populate: ['previousVersion'] })
        for (const k of kids) {
            if (!all.has(k.id)) { all.set(k.id, k); toVisit.push(k.id) }
        }
    }
    return Array.from(all.values())
        .sort((a, b) => Number(a.version || 0) - Number(b.version || 0))
        .map((v) => ({
            id: v.id,
            version: Number(v.version || 1),
            status: v.status,
            createdAt: v.createdAt,
            previousVersionId: v.previousVersion?.id ?? null,
        }))
}

// ─────────── Превью ───────────

type PreviewPayload = {
    discountId?: number
    draft?: any
    withActive?: boolean
}

function pickPreviewContext(d: any): QuoteContext {
    const c = d.conditions || {}
    const deliveryMethod = (Array.isArray(c.deliveryMethods) && c.deliveryMethods[0]) || 'courier_now'
    const paymentMethod = (Array.isArray(c.paymentMethods) && c.paymentMethods[0]) || 'card'
    const now = new Date()
    const at = d.startsAt && new Date(d.startsAt).getTime() > now.getTime() ? new Date(d.startsAt) : now
    return { deliveryMethod, paymentMethod, clientKind: 'individual', source: 'catalog', at }
}

function toSnapshot(d: any, targets: any[]): DiscountSnapshot {
    return {
        id: Number(d.id || 0),
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
        targets: (targets || []).map((t: any) => ({
            targetType: t.targetType,
            productId: t.product?.id ?? t.product ?? null,
            categoryId: t.category?.id ?? t.category ?? null,
            orderSetId: t.orderSet?.id ?? t.orderSet ?? null,
            exclude: Boolean(t.exclude),
        })),
    }
}

function computeNotes(d: any, targets: any[]): Array<{ code: string; message: string }> {
    const notes: Array<{ code: string; message: string }> = []
    const c = d.conditions || {}
    const hasCartGate = c.minQty || c.minSubtotal || (c.deliveryMethods?.length) || (c.paymentMethods?.length)
    const hasTimeGate = (c.weekdays?.length) || c.timeFrom || c.timeTo
    const includeTargets = (targets || []).filter((t) => !t.exclude)
    if ((d.level === 'line' || d.level === 'set') && !includeTargets.length) {
        notes.push({ code: 'NO_TARGETS', message: 'Скидка ни к чему не применяется — целей не выбрано' })
        return notes
    }
    if (d.showInCatalog === false) {
        notes.push({ code: 'HIDDEN', message: 'Не показывается в каталоге и на странице «Скидки», но применяется в корзине' })
    } else if (d.level === 'line' && !hasCartGate && !hasTimeGate) {
        notes.push({ code: 'SHOWN_IN_CATALOG', message: 'Зачёркнутая цена и бейдж в каталоге, на странице товара и на странице «Скидки»' })
    } else if (d.level === 'line' || d.level === 'set') {
        if (hasCartGate) notes.push({ code: 'CART_ONLY', message: 'В каталоге цена без скидки — скидка появится в корзине при выполнении условий' })
        if (hasTimeGate) notes.push({ code: 'TIME_LIMITED', message: 'В каталоге видна только в указанные дни и часы' })
    } else if (d.level === 'order') {
        notes.push({ code: 'CHECKOUT', message: 'Видна на чекауте: «Ваша скидка −N%» и подсказка «добавьте ещё …»' })
    }
    return notes
}

async function pickSampleProductIds(strapi: any, d: any, targets: any[]): Promise<number[]> {
    const ids = new Set<number>()
    for (const t of targets) {
        if (t.exclude) continue
        if (t.targetType === 'product' && (t.product?.id || t.product)) ids.add(Number(t.product?.id ?? t.product))
        if (t.targetType === 'category') {
            const catId = Number(t.category?.id ?? t.category)
            if (!catId) continue
            const prods = await strapi.db.query('api::product.product').findMany({
                where: { category: { id: catId }, available: true },
                select: ['id'],
                orderBy: { sort: 'asc' },
                limit: 4,
            })
            for (const p of prods) ids.add(p.id)
            if (ids.size >= 4) break
        }
        if (t.targetType === 'all-products') {
            const prods = await strapi.db.query('api::product.product').findMany({
                where: { available: true },
                select: ['id'],
                orderBy: { sort: 'asc' },
                limit: 4,
            })
            for (const p of prods) ids.add(p.id)
            break
        }
    }
    // Исключения
    const excluded = new Set<number>()
    for (const t of targets) {
        if (t.exclude && t.targetType === 'product' && (t.product?.id || t.product)) excluded.add(Number(t.product?.id ?? t.product))
    }
    return Array.from(ids).filter((id) => !excluded.has(id)).slice(0, 4)
}

// ─────────── Контроллер ───────────

export default factories.createCoreController(DISCOUNT_UID, ({ strapi }) => ({
    async publicList(ctx: any) {
        const now = new Date()
        const list = await strapi.db.query(DISCOUNT_UID).findMany({
            where: {
                status: 'active',
                showInCatalog: true,
                $and: [
                    { $or: [{ startsAt: { $null: true } }, { startsAt: { $lte: now } }] },
                    { $or: [{ endsAt: { $null: true } }, { endsAt: { $gt: now } }] },
                ],
            },
            populate: { targets: { populate: ['product', 'category', 'orderSet'] } },
            orderBy: { priority: 'asc' },
            limit: 200,
        })
        ctx.body = { data: list }
    },

    async staffList(ctx: any) {
        const { status, level, q } = (ctx.query || {}) as Record<string, any>
        const where: any = {}
        if (status) where.status = status
        if (level) where.level = level
        if (q) where.name = { $containsi: String(q) }

        const page = Math.max(1, Number((ctx.query as any).page) || 1)
        const pageSizeRaw = Number((ctx.query as any).pageSize) || 0
        const pageSize = pageSizeRaw > 0 ? Math.min(100, Math.max(1, pageSizeRaw)) : 500

        const [list, total] = await Promise.all([
            strapi.db.query(DISCOUNT_UID).findMany({
                where,
                populate: { targets: { populate: ['product', 'category', 'orderSet'] } },
                orderBy: { priority: 'asc' },
                limit: pageSize,
                offset: (page - 1) * pageSize,
            }),
            pageSizeRaw > 0 ? strapi.db.query(DISCOUNT_UID).count({ where }) : Promise.resolve(0),
        ])
        const now = new Date()
        ctx.body = {
            data: list.map((d: any) => ({ ...d, _displayState: displayState(d, now) })),
            ...(pageSizeRaw > 0 ? { meta: { pagination: { page, pageSize, pageCount: Math.ceil(total / pageSize), total } } } : {}),
        }
    },

    async staffFindOne(ctx: any) {
        const id = Number(ctx.params?.id)
        if (!id) return ctx.badRequest('bad id')
        const row = await strapi.db.query(DISCOUNT_UID).findOne({
            where: { id },
            populate: { targets: { populate: ['product', 'category', 'orderSet'] }, previousVersion: true },
        })
        if (!row) return ctx.notFound('discount not found')

        const versions = await versionChain(strapi, id)
        const versionIds = versions.map((v) => v.id)

        // Статистика по всем версиям.
        const stats = await strapi.db.query('api::order-discount.order-discount').findMany({
            where: { discount: { id: { $in: versionIds } } },
            populate: ['order', 'discount'],
            limit: 100_000,
        })
        const orders = new Set<number>()
        let amountTotal = 0
        let lastAppliedAt: Date | null = null
        const byVersionMap = new Map<number, { applications: number; amount: number }>()
        for (const r of stats as any[]) {
            if (r.order?.id) orders.add(r.order.id)
            amountTotal += Number(r.amount || 0)
            const t = r.createdAt ? new Date(r.createdAt) : null
            if (t && (!lastAppliedAt || t > lastAppliedAt)) lastAppliedAt = t
            const vid = r.discount?.id ?? 0
            const prev = byVersionMap.get(vid) || { applications: 0, amount: 0 }
            prev.applications += 1
            prev.amount += Number(r.amount || 0)
            byVersionMap.set(vid, prev)
        }
        const byVersion = versions.map((v) => ({
            id: v.id,
            version: v.version,
            applications: byVersionMap.get(v.id)?.applications || 0,
            amount: byVersionMap.get(v.id)?.amount || 0,
        }))

        // События по всем версиям.
        const events = await strapi.db.query(EVENT_UID).findMany({
            where: { discount: { id: { $in: versionIds } } },
            populate: ['employee', 'discount'],
            orderBy: { createdAt: 'desc' },
            limit: 100,
        })

        const problems = checkReadiness(row, row.targets || [])
        const now = new Date()
        ctx.body = {
            data: {
                ...row,
                _stats: {
                    applications: stats.length,
                    amountTotal,
                    ordersCount: orders.size,
                    lastAppliedAt: lastAppliedAt ? lastAppliedAt.toISOString() : null,
                    byVersion: versions.length > 1 ? byVersion : undefined,
                },
                _readiness: { ready: problems.length === 0, problems },
                _displayState: displayState(row, now),
                _versions: versions.map((v) => ({ id: v.id, version: v.version, status: v.status, createdAt: v.createdAt })),
                _events: (events as any[]).map((e) => ({
                    id: e.id,
                    type: e.type,
                    fromStatus: e.fromStatus,
                    toStatus: e.toStatus,
                    comment: e.comment,
                    payload: e.payload,
                    employee: e.employee ? { id: e.employee.id, name: e.employee.fullName || null } : null,
                    discountVersion: e.discount?.version ?? null,
                    createdAt: e.createdAt,
                })),
            },
        }
    },

    async staffCreate(ctx: any) {
        const body = (ctx.request.body?.data || ctx.request.body) as any
        const level = body?.level
        if (!['line', 'set', 'order'].includes(level)) return ctx.badRequest('invalid level')
        if (!['percent', 'fixed_amount', 'fixed_price'].includes(body?.benefitType)) return ctx.badRequest('invalid benefitType')
        if (level === 'order' && body?.benefitType === 'fixed_price') return ctx.badRequest('order-level fixed_price not allowed')
        const condErr = validateConditions(body?.conditions)
        if (condErr) {
            const err: any = new ApplicationError(condErr); err.details = { code: 'INVALID_CONDITION' }
            return ctx.badRequest(err.message, err.details)
        }
        const tgtErr = validateTargets(level, body?.targets)
        if (tgtErr) {
            const err: any = new ApplicationError(tgtErr); err.details = { code: 'INVALID_TARGET' }
            return ctx.badRequest(err.message, err.details)
        }

        const discount = await strapi.db.query(DISCOUNT_UID).create({
            data: {
                name: body.name,
                publicLabel: body.publicLabel || null,
                status: 'draft',
                level,
                benefitType: body.benefitType,
                benefitValue: Number(body.benefitValue || 0),
                maxDiscountAmount: body.maxDiscountAmount ?? null,
                startsAt: body.startsAt || null,
                endsAt: body.endsAt || null,
                conditions: body.conditions ?? null,
                priority: Number(body.priority ?? 100),
                stackable: body.stackable !== false,
                exclusiveGroup: body.exclusiveGroup || null,
                showInCatalog: body.showInCatalog !== false,
                version: 1,
                createdByEmployee: ctx.state?.employee?.id ?? null,
                publishedAt: new Date(),
            },
        })
        if (Array.isArray(body?.targets)) {
            for (const t of body.targets) {
                await strapi.db.query(TARGET_UID).create({
                    data: {
                        discount: discount.id,
                        targetType: t.targetType,
                        product: t.product ?? null,
                        category: t.category ?? null,
                        orderSet: t.orderSet ?? null,
                        exclude: Boolean(t.exclude),
                        publishedAt: new Date(),
                    },
                })
            }
        }
        await recordEvent(strapi, discount.id, { type: 'created', toStatus: 'draft', employeeId: ctx.state?.employee?.id ?? null })
        ctx.body = { data: await strapi.db.query(DISCOUNT_UID).findOne({
            where: { id: discount.id },
            populate: { targets: { populate: ['product', 'category', 'orderSet'] } },
        }) }
    },

    async staffUpdate(ctx: any) {
        const id = Number(ctx.params?.id)
        if (!id) return ctx.badRequest('bad id')
        const body = (ctx.request.body?.data || ctx.request.body) as any

        if ('status' in body) {
            const err: any = new ApplicationError('status is managed via /status endpoint')
            err.details = { code: 'STATUS_NOT_EDITABLE' }
            return ctx.badRequest(err.message, err.details)
        }

        const existing = await strapi.db.query(DISCOUNT_UID).findOne({ where: { id } })
        if (!existing) return ctx.notFound('discount not found')
        if (existing.status === 'archived') {
            const err: any = new ApplicationError('discount is archived — cannot edit')
            err.details = { code: 'DISCOUNT_ARCHIVED' }
            return ctx.badRequest(err.message, err.details)
        }

        const condErr = validateConditions(body?.conditions)
        if (condErr) return ctx.badRequest(condErr, { code: 'INVALID_CONDITION' })
        const level = body?.level ?? existing.level
        const tgtErr = validateTargets(level, body?.targets)
        if (tgtErr) return ctx.badRequest(tgtErr, { code: 'INVALID_TARGET' })

        const applications = await strapi.db.query('api::order-discount.order-discount').count({
            where: { discount: { id } },
        })

        const inPlaceData: Record<string, any> = {}
        if ('name' in body) inPlaceData.name = body.name
        if ('publicLabel' in body) inPlaceData.publicLabel = body.publicLabel
        if ('endsAt' in body) inPlaceData.endsAt = body.endsAt
        if ('showInCatalog' in body) inPlaceData.showInCatalog = body.showInCatalog
        if ('priority' in body) inPlaceData.priority = Number(body.priority ?? 100)
        if ('stackable' in body) inPlaceData.stackable = body.stackable !== false
        if ('exclusiveGroup' in body) inPlaceData.exclusiveGroup = body.exclusiveGroup || null
        if ('maxDiscountAmount' in body) inPlaceData.maxDiscountAmount = body.maxDiscountAmount ?? null
        if ('startsAt' in body) inPlaceData.startsAt = body.startsAt

        const versioned: Record<string, any> = {}
        if ('level' in body && body.level !== existing.level) versioned.level = body.level
        if ('benefitType' in body && body.benefitType !== existing.benefitType) versioned.benefitType = body.benefitType
        if ('benefitValue' in body && Number(body.benefitValue) !== Number(existing.benefitValue)) versioned.benefitValue = Number(body.benefitValue)
        if ('conditions' in body) versioned.conditions = body.conditions

        if (!applications || !Object.keys(versioned).length) {
            const data: Record<string, any> = { ...inPlaceData, ...versioned }
            if (Object.keys(data).length) await strapi.db.query(DISCOUNT_UID).update({ where: { id }, data })

            if (Array.isArray(body?.targets)) {
                await strapi.db.query(TARGET_UID).deleteMany({ where: { discount: { id } } })
                for (const t of body.targets) {
                    await strapi.db.query(TARGET_UID).create({
                        data: {
                            discount: id,
                            targetType: t.targetType,
                            product: t.product ?? null,
                            category: t.category ?? null,
                            orderSet: t.orderSet ?? null,
                            exclude: Boolean(t.exclude),
                            publishedAt: new Date(),
                        },
                    })
                }
            }
            await recordEvent(strapi, id, {
                type: 'updated',
                payload: { changed: [...Object.keys(inPlaceData), ...Object.keys(versioned), Array.isArray(body?.targets) ? 'targets' : null].filter(Boolean) },
                employeeId: ctx.state?.employee?.id ?? null,
            })
            ctx.body = {
                data: await strapi.db.query(DISCOUNT_UID).findOne({
                    where: { id },
                    populate: { targets: { populate: ['product', 'category', 'orderSet'] } },
                }),
                versionCreated: false,
            }
            return
        }

        // Создаём новую версию. Старая → archived; новая наследует статус старой.
        await strapi.db.query(DISCOUNT_UID).update({
            where: { id },
            data: { status: 'archived', ...inPlaceData },
        })
        const newDiscount = await strapi.db.query(DISCOUNT_UID).create({
            data: {
                name: body.name ?? existing.name,
                publicLabel: body.publicLabel ?? existing.publicLabel ?? null,
                status: existing.status,
                level: versioned.level ?? existing.level,
                benefitType: versioned.benefitType ?? existing.benefitType,
                benefitValue: versioned.benefitValue ?? existing.benefitValue,
                maxDiscountAmount: body.maxDiscountAmount ?? existing.maxDiscountAmount ?? null,
                startsAt: body.startsAt ?? existing.startsAt,
                endsAt: body.endsAt ?? existing.endsAt,
                conditions: 'conditions' in versioned ? versioned.conditions : existing.conditions,
                priority: body.priority ?? existing.priority,
                stackable: body.stackable ?? existing.stackable,
                exclusiveGroup: body.exclusiveGroup ?? existing.exclusiveGroup,
                showInCatalog: body.showInCatalog ?? existing.showInCatalog,
                version: Number(existing.version || 1) + 1,
                previousVersion: id,
                createdByEmployee: ctx.state?.employee?.id ?? null,
                publishedAt: new Date(),
            },
        })
        if (Array.isArray(body?.targets)) {
            for (const t of body.targets) {
                await strapi.db.query(TARGET_UID).create({
                    data: {
                        discount: newDiscount.id,
                        targetType: t.targetType,
                        product: t.product ?? null,
                        category: t.category ?? null,
                        orderSet: t.orderSet ?? null,
                        exclude: Boolean(t.exclude),
                        publishedAt: new Date(),
                    },
                })
            }
        } else {
            const prev = await strapi.db.query(TARGET_UID).findMany({ where: { discount: { id } } })
            for (const t of prev) {
                await strapi.db.query(TARGET_UID).create({
                    data: {
                        discount: newDiscount.id,
                        targetType: t.targetType,
                        product: t.product ?? null,
                        category: t.category ?? null,
                        orderSet: t.orderSet ?? null,
                        exclude: Boolean(t.exclude),
                        publishedAt: new Date(),
                    },
                })
            }
        }
        await recordEvent(strapi, newDiscount.id, {
            type: 'version_created',
            payload: { fromId: id, toId: newDiscount.id, version: newDiscount.version },
            employeeId: ctx.state?.employee?.id ?? null,
        })
        ctx.body = {
            data: await strapi.db.query(DISCOUNT_UID).findOne({
                where: { id: newDiscount.id },
                populate: { targets: { populate: ['product', 'category', 'orderSet'] } },
            }),
            versionCreated: true,
        }
    },

    async staffSetStatus(ctx: any) {
        const id = Number(ctx.params?.id)
        if (!id) return ctx.badRequest('bad id')
        const body = (ctx.request.body?.data || ctx.request.body) as any
        const to = body?.status
        if (!['draft', 'active', 'paused', 'archived'].includes(to)) return ctx.badRequest('invalid status')

        const row = await strapi.db.query(DISCOUNT_UID).findOne({
            where: { id },
            populate: { targets: { populate: ['product', 'category', 'orderSet'] } },
        })
        if (!row) return ctx.notFound('discount not found')
        const from = row.status
        if (from === to) {
            ctx.body = { data: { ok: true, status: to } }
            return
        }
        const allowed = (STATUS_TRANSITIONS as Record<string, string[]>)[from] || []
        if (!allowed.includes(to)) {
            const err: any = new ApplicationError(`transition ${from} → ${to} is not allowed`)
            err.details = { code: 'INVALID_STATUS_TRANSITION', from, to }
            return ctx.badRequest(err.message, err.details)
        }
        if (to === 'active') {
            const problems = checkReadiness(row, row.targets || [])
            if (problems.length) {
                const err: any = new ApplicationError('discount is not ready to activate')
                err.details = { code: 'DISCOUNT_NOT_READY', problems }
                return ctx.badRequest(err.message, err.details)
            }
        }
        await strapi.db.query(DISCOUNT_UID).update({ where: { id }, data: { status: to } })
        await recordEvent(strapi, id, {
            type: 'status_changed',
            fromStatus: from,
            toStatus: to,
            comment: body?.comment || null,
            employeeId: ctx.state?.employee?.id ?? null,
        })
        ctx.body = { data: { ok: true, status: to } }
    },

    async staffDelete(ctx: any) {
        const id = Number(ctx.params?.id)
        if (!id) return ctx.badRequest('bad id')
        const row = await strapi.db.query(DISCOUNT_UID).findOne({ where: { id } })
        if (!row) return ctx.notFound('discount not found')
        if (row.status !== 'draft') {
            const err: any = new ApplicationError('only draft discounts can be deleted')
            err.details = { code: 'CANNOT_DELETE' }
            return ctx.badRequest(err.message, err.details)
        }
        const used = await strapi.db.query('api::order-discount.order-discount').count({ where: { discount: { id } } })
        if (used > 0) {
            const err: any = new ApplicationError('discount has applications and cannot be deleted')
            err.details = { code: 'CANNOT_DELETE' }
            return ctx.badRequest(err.message, err.details)
        }
        await strapi.db.query(TARGET_UID).deleteMany({ where: { discount: { id } } })
        await strapi.db.query(EVENT_UID).deleteMany({ where: { discount: { id } } })
        await strapi.db.query(DISCOUNT_UID).delete({ where: { id } })
        ctx.body = { data: { ok: true } }
    },

    async staffReport(ctx: any) {
        const { from, to } = (ctx.query || {}) as Record<string, any>
        const where: any = {}
        if (from) where.createdAt = { ...(where.createdAt || {}), $gte: new Date(String(from)) }
        if (to) where.createdAt = { ...(where.createdAt || {}), $lte: new Date(String(to)) }
        const rows = await strapi.db.query('api::order-discount.order-discount').findMany({
            where,
            populate: ['discount'],
            limit: 100_000,
        })
        const byDiscount = new Map<number, { discountId: number; name: string; applications: number; amount: number }>()
        for (const r of rows as any[]) {
            const did = r.discount?.id
            if (!did) continue
            const prev = byDiscount.get(did)
            if (prev) { prev.applications++; prev.amount += Number(r.amount || 0) }
            else byDiscount.set(did, { discountId: did, name: r.discount?.name || '—', applications: 1, amount: Number(r.amount || 0) })
        }
        ctx.body = { data: Array.from(byDiscount.values()).sort((a, b) => b.amount - a.amount) }
    },

    // ─── Превью: как увидит клиент ───
    async staffPreview(ctx: any) {
        const body = (ctx.request.body?.data || ctx.request.body) as PreviewPayload
        let d: any
        let targets: any[]

        if (body.discountId) {
            const row = await strapi.db.query(DISCOUNT_UID).findOne({
                where: { id: Number(body.discountId) },
                populate: { targets: { populate: ['product', 'category', 'orderSet'] } },
            })
            if (!row) return ctx.notFound('discount not found')
            d = row
            targets = row.targets || []
        } else if (body.draft) {
            d = body.draft
            targets = Array.isArray(body.draft.targets) ? body.draft.targets : []
        } else {
            return ctx.badRequest('expected discountId or draft')
        }

        const ctxPreview = pickPreviewContext(d)
        const snapshot = toSnapshot(d, targets)
        const notes = computeNotes(d, targets)
        // Если целей нет — ничего не рендерим, только показываем note.
        const hasInclude = (targets || []).some((t: any) => !t.exclude)
        if ((d.level === 'line' || d.level === 'set') && !hasInclude) {
            ctx.body = { data: { placements: [], products: [], sets: [], checkout: undefined, notes } }
            return
        }
        const placements: string[] = []

        const products: any[] = []
        const sets: any[] = []
        let checkout: any = undefined

        // Загрузить активные скидки, если withActive. Исключить эту скидку и её прошлые версии.
        const pricing: any = strapi.service('api::price.pricing')
        let otherActive: DiscountSnapshot[] = []
        if (body.withActive) {
            const activeList = await pricing.loadActiveDiscounts({ at: ctxPreview.at })
            const excludedIds = new Set<number>()
            if (d.id) {
                const chain = await versionChain(strapi, d.id)
                for (const v of chain) excludedIds.add(v.id)
            }
            otherActive = activeList.filter((a: DiscountSnapshot) => !excludedIds.has(a.id))
        }

        if (d.level === 'line') {
            const sampleIds = await pickSampleProductIds(strapi, d, targets)
            for (const pid of sampleIds) {
                const p = await strapi.db.query('api::product.product').findOne({
                    where: { id: pid },
                    select: ['id', 'name', 'slug', 'tags'],
                    populate: ['category', 'image'],
                })
                if (!p) continue
                const { amount: basePrice, priceId } = await pricing.resolveBasePrice(pid, ctxPreview.at)
                if (!(basePrice > 0)) continue
                const cart: CartLineSnapshot[] = [{
                    lineKey: 'L1', productId: pid, categoryId: p.category?.id ?? null,
                    name: p.name, qty: 1, basePrice, priceId, orderSetId: null, setInstance: null,
                }]
                const result = evaluate(cart, [snapshot, ...otherActive], ctxPreview)
                const line = result.lines[0]
                const applied = result.appliedDiscounts.find((a) => a.discountId === snapshot.id)
                const discountPercent = basePrice > 0 ? Math.round(((basePrice - line.lineTotal) / basePrice) * 100) : 0
                const overriddenBy = result.appliedDiscounts.find((a) => a.discountId !== snapshot.id)
                if (body.withActive && overriddenBy && !applied) {
                    notes.push({ code: 'OVERRIDDEN', message: `На «${p.name}» сейчас действует «${overriddenBy.name}»` })
                }
                products.push({
                    id: p.id, name: p.name, slug: p.slug, image: p.image?.url || null, tags: p.tags || null,
                    basePrice, finalPrice: line.lineTotal, discountPercent,
                    label: snapshot.publicLabel || snapshot.name, endsAt: d.endsAt || null,
                })
            }
            if (products.length) {
                placements.push('product_card')
                if (d.showInCatalog !== false && !notes.some((n) => n.code === 'CART_ONLY' || n.code === 'HIDDEN')) {
                    placements.push('discounts_page')
                }
            }
        } else if (d.level === 'set') {
            const setIds: number[] = []
            for (const t of targets) {
                if (t.exclude || t.targetType !== 'order-set') continue
                const sid = Number(t.orderSet?.id ?? t.orderSet)
                if (sid) setIds.push(sid)
                if (setIds.length >= 2) break
            }
            for (const sid of setIds) {
                const s = await strapi.db.query('api::order-set.order-set').findOne({
                    where: { id: sid },
                    select: ['id', 'name', 'slug'],
                    populate: ['banner'],
                })
                if (!s) continue
                const q = await pricing.quote({
                    items: [{ type: 'set', orderSetId: sid, qty: 1 }],
                    source: 'catalog',
                    at: ctxPreview.at,
                    deliveryMethod: ctxPreview.deliveryMethod,
                    paymentMethod: ctxPreview.paymentMethod,
                }).catch(() => null)
                if (!q) continue
                const base = q.lines.reduce((acc: number, l: any) => acc + l.basePrice * l.qty, 0)
                const fin = q.total
                const pct = base > 0 ? Math.round(((base - fin) / base) * 100) : 0
                sets.push({
                    id: s.id, name: s.name, slug: s.slug, banner: s.banner?.url || null,
                    basePrice: base, finalPrice: fin, discountPercent: pct,
                    label: snapshot.publicLabel || snapshot.name, endsAt: d.endsAt || null,
                })
            }
            if (sets.length) placements.push('set_page')
        } else if (d.level === 'order') {
            // Две корзины: ниже и выше minSubtotal.
            const minSub = Number(d.conditions?.minSubtotal || 0)
            const popular = await strapi.db.query('api::product.product').findMany({
                where: { available: true },
                select: ['id', 'name'],
                orderBy: { sort: 'asc' },
                limit: 10,
            })
            async function buildCart(target: number): Promise<any> {
                const items: any[] = []
                let total = 0
                for (const p of popular) {
                    if (total >= target) break
                    const { amount } = await pricing.resolveBasePrice(p.id, ctxPreview.at)
                    if (!(amount > 0)) continue
                    const qty = Math.max(1, Math.ceil((target - total) / amount))
                    items.push({ type: 'product', productId: p.id, qty: Math.min(qty, 5) })
                    total += amount * Math.min(qty, 5)
                }
                return items
            }
            if (minSub > 0) {
                const below = await pricing.quote({
                    items: await buildCart(Math.max(1, Math.floor(minSub * 0.6))),
                    source: 'catalog', at: ctxPreview.at,
                    deliveryMethod: ctxPreview.deliveryMethod, paymentMethod: ctxPreview.paymentMethod,
                }).catch(() => null)
                const above = await pricing.quote({
                    items: await buildCart(Math.max(minSub + 10000, minSub * 1.3)),
                    source: 'catalog', at: ctxPreview.at,
                    deliveryMethod: ctxPreview.deliveryMethod, paymentMethod: ctxPreview.paymentMethod,
                }).catch(() => null)
                if (below && above) {
                    const hint = below.hints?.find((h: any) => h.discountId === snapshot.id)
                    checkout = {
                        sampleBelow: {
                            subtotal: below.subtotal,
                            hint: hint ? { missing: hint.missing, label: hint.label } : null,
                        },
                        sampleAbove: {
                            subtotal: above.subtotal,
                            discountTotal: above.discountTotal,
                            total: above.total,
                            percent: d.benefitType === 'percent' ? Number(d.benefitValue) : null,
                        },
                    }
                }
            }
            placements.push('cart', 'checkout')
        }

        ctx.body = {
            data: {
                placements,
                products,
                sets,
                checkout,
                notes,
            },
        }
    },
}))
