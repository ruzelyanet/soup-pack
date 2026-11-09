import type { CartLine, CheckoutForm } from './texts'

/** address — адрес текстом ИЛИ геопозиция; address_details — уточнение квартиры после геопозиции. */
export type CheckoutStep = 'name' | 'phone' | 'address' | 'address_details' | 'confirm' | 'placing'

/** Последние данные клиента — подставляются кнопками при следующем заказе. */
export type Profile = { fullName?: string; phone?: string; address?: string }

export type BotSession = {
    chatId: string
    username?: string | null
    firstName?: string | null
    cart: CartLine[]
    step: CheckoutStep | null
    form: CheckoutForm
    profile: Profile
    lastOrderCode?: string | null
}

export interface SessionStore {
    get(chatId: number | string, from?: { username?: string; first_name?: string }): Promise<BotSession>
    save(s: BotSession): Promise<void>
}

const UID = 'api::telegram-session.telegram-session'

function blank(chatId: string): BotSession {
    return { chatId, cart: [], step: null, form: {}, profile: {}, lastOrderCode: null }
}

function fromRow(row: any): BotSession {
    return {
        chatId: String(row.chatId),
        username: row.username ?? null,
        firstName: row.firstName ?? null,
        cart: Array.isArray(row.cart)
            ? row.cart.filter((l: any) => typeof l?.documentId === 'string' && Number(l?.qty) > 0)
            : [],
        step: row.step || null,
        form: row.form && typeof row.form === 'object' ? row.form : {},
        profile: row.profile && typeof row.profile === 'object' ? row.profile : {},
        lastOrderCode: row.lastOrderCode ?? null,
    }
}

/** Сессии в БД (content-type `telegram-session`) — корзина и шаг оформления переживают рестарт. */
export class DbSessionStore implements SessionStore {
    constructor(private strapi: any) {}

    async get(chatId: number | string, from?: { username?: string; first_name?: string }) {
        const id = String(chatId)
        const row = await this.strapi.db.query(UID).findOne({ where: { chatId: id } })
        const s = row ? fromRow(row) : blank(id)
        if (from) {
            s.username = from.username ?? s.username ?? null
            s.firstName = from.first_name ?? s.firstName ?? null
        }
        return s
    }

    async save(s: BotSession) {
        const data = {
            chatId: s.chatId,
            username: s.username ?? null,
            firstName: s.firstName ?? null,
            cart: s.cart,
            step: s.step,
            form: s.form,
            profile: s.profile,
            lastOrderCode: s.lastOrderCode ?? null,
        }
        const q = this.strapi.db.query(UID)
        const row = await q.findOne({ where: { chatId: s.chatId }, select: ['id'] })
        if (row) await q.update({ where: { id: row.id }, data })
        else await q.create({ data })
    }
}

/** Для тестов и локальной отладки. */
export class MemorySessionStore implements SessionStore {
    rows = new Map<string, BotSession>()
    async get(chatId: number | string, from?: { username?: string; first_name?: string }) {
        const id = String(chatId)
        const s = structuredClone(this.rows.get(id) ?? blank(id))
        if (from) {
            s.username = from.username ?? s.username ?? null
            s.firstName = from.first_name ?? s.firstName ?? null
        }
        return s
    }
    async save(s: BotSession) {
        this.rows.set(s.chatId, structuredClone(s))
    }
}
