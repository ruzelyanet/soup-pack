import type { Core } from '@strapi/strapi'
import { errors } from '@strapi/utils'
import { verifyStaffToken } from '../utils/staff-jwt'

const { UnauthorizedError, ForbiddenError } = errors

type Config = { roles?: Array<'manager' | 'duty' | 'courier'> }

/** Policy: валидный staff-JWT → ctx.state.employee + ctx.state.employeeRole.
 *  config.roles — опциональный белый список ролей. */
const isStaff = async (
    policyContext: any,
    config: Config | undefined,
    { strapi }: { strapi: Core.Strapi },
) => {
    const auth = (policyContext.request?.header?.authorization || '') as string
    const m = auth.match(/^Bearer\s+(.+)$/i)
    if (!m) throw new UnauthorizedError('missing token')

    let payload
    try {
        payload = verifyStaffToken(m[1])
    } catch {
        throw new UnauthorizedError('invalid token')
    }

    const employee = await strapi.db
        .query('api::employee.employee')
        .findOne({ where: { id: Number(payload.id) } })
    if (!employee) throw new UnauthorizedError('employee not found')

    if (config?.roles?.length && !config.roles.includes(employee.role)) {
        throw new ForbiddenError('FORBIDDEN_ROLE')
    }

    policyContext.state.employee = employee
    policyContext.state.employeeRole = employee.role

    // Spoof ctx.state.auth под full-access API-token, чтобы content-api sanitize/validate
    // пропускал запись в relation-поля компонентов. Иначе дефолтный «public»-scope
    // отбивает запросы с `Invalid key <relation>`.
    policyContext.state.auth = {
        strategy: { name: 'api-token' },
        credentials: { type: 'full-access', name: 'staff' },
        ability: null,
    }

    return true
}

export default isStaff
