/** Чистые функции бота: тексты, форматирование, операции с корзиной. Покрыты tests/telegram-bot.test.ts. */

/** Товар в корзине храним по `documentId`: числовой id опубликованной версии в Strapi 5
 *  меняется при каждой повторной публикации товара. */
export type CartLine = { documentId: string; qty: number }

export const MAX_QTY = 99

export function escapeHtml(input: unknown): string {
    return String(input ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
}

/** 55000 → «55 000 сум». */
export function fmtMoney(n: number): string {
    const v = Math.round(Number(n) || 0)
    return v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' сум'
}

/** Состав в БД — json: массив строк (новый формат) или строка (старый). */
export function compositionText(composition: unknown): string {
    if (Array.isArray(composition)) {
        return composition.map((x) => String(x).trim()).filter(Boolean).join(', ')
    }
    if (typeof composition === 'string') return composition.trim()
    return ''
}

/** Приводит номер к +998XXXXXXXXX. null — если это не узбекский номер. */
export function normalizeUzPhone(input: string | null | undefined): string | null {
    const digits = String(input || '').replace(/\D/g, '')
    if (digits.length === 9) return '+998' + digits
    if (digits.length === 12 && digits.startsWith('998')) return '+' + digits
    return null
}

/** +998901234567 → «+998 90 123 45 67». */
export function fmtPhone(phone: string): string {
    const d = String(phone || '').replace(/\D/g, '')
    if (d.length === 12 && d.startsWith('998')) {
        return `+998 ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8, 10)} ${d.slice(10, 12)}`
    }
    return phone
}

export function cartQty(cart: CartLine[], documentId: string): number {
    return cart.find((l) => l.documentId === documentId)?.qty ?? 0
}

export function cartCount(cart: CartLine[]): number {
    return cart.reduce((s, l) => s + l.qty, 0)
}

/** Изменить количество товара на delta (новая корзина; при qty ≤ 0 строка удаляется). */
export function changeQty(cart: CartLine[], documentId: string, delta: number): CartLine[] {
    const current = cartQty(cart, documentId)
    const next = Math.min(MAX_QTY, Math.max(0, current + delta))
    const rest = cart.filter((l) => l.documentId !== documentId)
    if (next === 0) return rest
    if (current === 0) return [...cart, { documentId, qty: next }]
    return cart.map((l) => (l.documentId === documentId ? { ...l, qty: next } : l))
}

export function removeLine(cart: CartLine[], documentId: string): CartLine[] {
    return cart.filter((l) => l.documentId !== documentId)
}

export function truncate(s: string, max: number): string {
    return s.length <= max ? s : s.slice(0, Math.max(0, max - 1)).trimEnd() + '…'
}

export type ProductView = {
    /** documentId товара */
    id: string
    name: string
    composition?: unknown
    description?: string | null
    weight?: number | null
    basePrice: number
    finalPrice: number
}

/** Подпись под фото товара. Лимит Telegram на caption — 1024 символа. */
export function productCaption(p: ProductView): string {
    const lines: string[] = [`<b>${escapeHtml(p.name)}</b>`]
    const meta: string[] = []
    if (p.weight) meta.push(`${p.weight} г`)
    if (p.finalPrice > 0 && p.finalPrice < p.basePrice) {
        meta.push(`<s>${fmtMoney(p.basePrice)}</s> <b>${fmtMoney(p.finalPrice)}</b>`)
    } else if (p.basePrice > 0) {
        meta.push(`<b>${fmtMoney(p.basePrice)}</b>`)
    }
    if (meta.length) lines.push(meta.join(' · '))
    const comp = compositionText(p.composition)
    if (comp) lines.push('', `<i>Состав:</i> ${escapeHtml(truncate(comp, 700))}`)
    else if (p.description) lines.push('', escapeHtml(truncate(p.description, 700)))
    return lines.join('\n')
}

export type CartViewLine = { documentId: string; name: string; qty: number; basePrice: number }
export type CartView = {
    lines: CartViewLine[]
    subtotal: number
    discountTotal: number
    total: number
    /** Товары, которые выпали из корзины (сняты с продажи / удалены). */
    removedNames?: string[]
}

export function cartText(v: CartView): string {
    if (!v.lines.length) {
        const removed = v.removedNames?.length
            ? `\n\nУбрали недоступные товары: ${escapeHtml(v.removedNames.join(', '))}.`
            : ''
        return '🛒 <b>Корзина пуста</b>\n\nВыберите категорию и добавьте товары.' + removed
    }
    const rows = v.lines.map((l, i) =>
        `${i + 1}. ${escapeHtml(l.name)} — ${l.qty} × ${fmtMoney(l.basePrice)} = ${fmtMoney(l.basePrice * l.qty)}`)
    const out = ['🛒 <b>Ваша корзина</b>', '', ...rows, '']
    if (v.discountTotal > 0) {
        out.push(`Сумма: ${fmtMoney(v.subtotal)}`)
        out.push(`Скидка: −${fmtMoney(v.discountTotal)}`)
    }
    out.push(`<b>Итого: ${fmtMoney(v.total)}</b>`)
    if (v.removedNames?.length) {
        out.push('', `⚠ Убрали недоступные товары: ${escapeHtml(v.removedNames.join(', '))}.`)
    }
    return out.join('\n')
}

export type CheckoutForm = {
    fullName?: string
    phone?: string
    lat?: number
    lng?: number
    address?: string
}

export function confirmText(form: CheckoutForm, cart: CartView): string {
    return [
        '📝 <b>Проверьте заказ</b>',
        '',
        `<b>Имя:</b> ${escapeHtml(form.fullName)}`,
        `<b>Телефон:</b> ${escapeHtml(fmtPhone(form.phone || ''))}`,
        `<b>Адрес:</b> ${escapeHtml(form.address)}`,
        form.lat != null && form.lng != null
            ? `<b>Точка на карте:</b> <a href="https://maps.google.com/?q=${form.lat},${form.lng}">открыть 📍</a>`
            : '📍 Точка на карте не указана — уточним при звонке.',
        '',
        ...cart.lines.map((l) => `• ${escapeHtml(l.name)} × ${l.qty}`),
        '',
        cart.discountTotal > 0 ? `Скидка: −${fmtMoney(cart.discountTotal)}` : '',
        `<b>Итого: ${fmtMoney(cart.total)}</b>`,
        'Оплата при получении.',
    ].filter((x, i, arr) => !(x === '' && arr[i - 1] === '')).join('\n')
}

export type ShopContactView = { phone?: string | null; workHours?: string | null; city?: string | null }

export function contactText(c: ShopContactView): string {
    const lines = ['📞 <b>Контакты магазина</b>']
    if (c.phone) lines.push(`Телефон: ${escapeHtml(c.phone)}`)
    if (c.workHours) lines.push(`Часы работы: ${escapeHtml(c.workHours)}`)
    if (c.city) lines.push(`Город: ${escapeHtml(c.city)}`)
    if (lines.length === 1) lines.push('Телефон пока не указан.')
    return lines.join('\n')
}

export function welcomeText(greeting: string, c: ShopContactView): string {
    const lines = [escapeHtml(greeting)]
    if (c.phone) lines.push('', `📞 Телефон магазина: <b>${escapeHtml(c.phone)}</b>`)
    if (c.workHours) lines.push(`🕒 ${escapeHtml(c.workHours)}`)
    lines.push('', 'Выберите категорию 👇')
    return lines.join('\n')
}
