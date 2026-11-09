import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto'

const PREFIX = 'scrypt$'
const SALT_BYTES = 16
const KEY_BYTES = 64

/** Персональный ключ сотрудника → хэш `scrypt$<salt>$<hex>`. */
export function hashKey(plain: string): string {
    const salt = randomBytes(SALT_BYTES).toString('hex')
    const hex = scryptSync(plain, salt, KEY_BYTES).toString('hex')
    return `${PREFIX}${salt}$${hex}`
}

/** Проверить ключ против стора. Поддерживает «миграционный» plain-match. */
export function verifyKey(plain: string, stored: string): boolean {
    if (!stored) return false
    if (!stored.startsWith(PREFIX)) {
        // Легаси-режим: ключи раньше хранились открытым текстом.
        return stored === plain
    }
    const [, salt, hex] = stored.split('$')
    if (!salt || !hex) return false
    const expected = Buffer.from(hex, 'hex')
    const actual = scryptSync(plain, salt, KEY_BYTES)
    return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export function isHashed(value: unknown): boolean {
    return typeof value === 'string' && value.startsWith(PREFIX)
}
