/** `+998XXXXXXXXX` — ровно тот же формат, что в `signIn`. */
function normalizePhone(input: unknown): string | undefined {
    if (input == null) return undefined
    const digits = String(input).replace(/\D/g, '').slice(-9)
    if (digits.length !== 9) return String(input).trim() || undefined
    return '+998' + digits
}

function apply(data: Record<string, any> | undefined | null) {
    if (!data) return
    if (data.phone != null) {
        const normalized = normalizePhone(data.phone)
        if (normalized) data.phone = normalized
    }
    // Dev-сетап: ключ хранится в plain, чтобы manager видел его в карточке сотрудника.
    // В прод-переходе: раскомментировать hash + staff-sign-in оставит legacy-режим (plain-compare).
    // if (data.personalKey && !isHashed(data.personalKey)) {
    //     data.personalKey = hashKey(String(data.personalKey))
    // }
}

export default {
    beforeCreate(event: any) { apply(event?.params?.data) },
    beforeUpdate(event: any) { apply(event?.params?.data) },
}
