import { factories } from '@strapi/strapi'
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

        const token = issueStaffToken({ id: employee.id, role: employee.role })

        ctx.body = { data: { token, employee: safeEmployee(employee) } }
    },

    /** Текущий сотрудник по JWT — для восстановления сессии после перезагрузки админки. */
    async me(ctx) {
        const employee = ctx.state.employee
        if (!employee) return ctx.unauthorized()
        ctx.body = { data: { employee: safeEmployee(employee) } }
    },

    // Dev-сетап: personalKey возвращается as-is (plain), чтобы manager видел его в карточке.
}))
