import { factories } from '@strapi/strapi'
import { randomBytes } from 'node:crypto'
import { verifyKey } from '../../../utils/staff-key'
import { issueStaffToken } from '../../../utils/staff-jwt'

function normalizePhone(input: string): string {
    const digits = (input || '').replace(/\D/g, '').slice(-9)
    return '+998' + digits
}

function safeEmployee(e: any) {
    return {
        id: e.id,
        documentId: e.documentId,
        fullName: e.fullName,
        phone: e.phone,
        role: e.role,
        // personalKey намеренно не отдаём.
    }
}

export default factories.createCoreController('api::employee.employee', ({ strapi }) => ({
    /** Запрет менять свою роль / отключать себя — защита от случайной потери доступа. */
    async update(ctx: any) {
        const me = ctx.state.employee
        const documentId = ctx.params?.id
        const data = ctx.request.body?.data ?? ctx.request.body ?? {}
        if (me && documentId) {
            const target = await strapi.documents('api::employee.employee').findOne({ documentId })
            if (target && target.id === me.id) {
                if (data.role !== undefined && data.role !== target.role) {
                    return ctx.badRequest('CANT_CHANGE_OWN_ROLE')
                }
                if (data.active === false) {
                    return ctx.badRequest('CANT_DEACTIVATE_SELF')
                }
            }
        }
        // @ts-ignore — super.update доступен в proxy createCoreController, не в типах.
        return super.update(ctx)
    },

    async signIn(ctx) {
        const body = (ctx.request.body?.data || ctx.request.body) as {
            phone?: string
            personalKey?: string
        }
        if (!body?.phone || !body?.personalKey) {
            return ctx.badRequest('phone and personalKey are required')
        }

        const phone = normalizePhone(body.phone)
        if (phone.length !== 13) return ctx.badRequest('invalid phone')

        const employee = await strapi.db
            .query('api::employee.employee')
            .findOne({ where: { phone } })

        if (!employee || !verifyKey(String(body.personalKey), employee.personalKey)) {
            return ctx.unauthorized('INVALID_CREDENTIALS')
        }
        if (employee.active === false) {
            return ctx.unauthorized('INACTIVE')
        }

        const token = issueStaffToken({ id: employee.id, role: employee.role })

        ctx.body = { data: { token, employee: safeEmployee(employee) } }
    },

    /** Текущий сотрудник по JWT — для восстановления сессии после перезагрузки админки. */
    async me(ctx) {
        const employee = ctx.state.employee
        if (!employee) return ctx.unauthorized()
        ctx.body = { data: { employee: safeEmployee(employee) } }
    },

    /** Агрегаты по заказам сотрудника: всего, выполнено, выручка, за 30 дней, средний чек. */
    async stats(ctx: any) {
        const { documentId } = ctx.params
        const emp = await strapi.documents('api::employee.employee').findOne({ documentId })
        if (!emp) return ctx.notFound()

        const orders = await strapi.db.query('api::order.order').findMany({
            where: {
                employee: { id: emp.id },
                status: { $ne: 'canceled' },
            },
            select: ['id', 'total', 'createdAt', 'status'],
        })

        const since30 = Date.now() - 30 * 24 * 60 * 60 * 1000
        const totalCount = orders.length
        const doneCount = orders.filter((o: any) => o.status === 'done').length
        const revenueAll = orders.reduce((s: number, o: any) => s + Number(o.total || 0), 0)
        const recent = orders.filter((o: any) => new Date(o.createdAt).getTime() >= since30)
        const revenue30 = recent.reduce((s: number, o: any) => s + Number(o.total || 0), 0)
        const count30 = recent.length
        const avgCheck = totalCount > 0 ? Math.round(revenueAll / totalCount) : 0

        ctx.body = { data: { totalCount, doneCount, revenueAll, revenue30, count30, avgCheck } }
    },

    /** Сгенерировать новый personalKey. Plain отдаём один раз — потом только хеш в БД. */
    async regenerateKey(ctx) {
        const { documentId } = ctx.params
        if (!documentId) return ctx.badRequest('documentId required')
        const plain = 'KEY-' + randomBytes(6).toString('hex').toUpperCase()
        const updated = await strapi.documents('api::employee.employee').update({
            documentId,
            data: { personalKey: plain },
        })
        if (!updated) return ctx.notFound()
        ctx.body = { data: { personalKey: plain } }
    },
}))
