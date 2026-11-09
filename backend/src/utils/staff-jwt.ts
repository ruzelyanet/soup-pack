import jwt from 'jsonwebtoken'

/** Секрет для staff-JWT. Берём JWT_SECRET из env (prod) или фиксированный dev-fallback. */
function secret(): string {
    return process.env.JWT_SECRET
        || process.env.STAFF_JWT_SECRET
        || 'souppack-dev-staff-secret-change-me-in-prod'
}

export type StaffJwtPayload = {
    id: number
    role: 'manager' | 'duty' | 'courier'
    type: 'staff'
}

/** Выпустить staff-токен. 30 дней жизни. */
export function issueStaffToken(payload: Omit<StaffJwtPayload, 'type'>): string {
    return jwt.sign(
        { id: payload.id, role: payload.role, type: 'staff' },
        secret(),
        { expiresIn: '30d' },
    )
}

/** Проверить staff-токен. Бросает при невалидности. */
export function verifyStaffToken(token: string): StaffJwtPayload {
    const decoded = jwt.verify(token, secret()) as any
    if (!decoded || decoded.type !== 'staff' || !decoded.id || !decoded.role) {
        throw new Error('invalid staff token payload')
    }
    return decoded as StaffJwtPayload
}
