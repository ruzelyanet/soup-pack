import { factories } from '@strapi/strapi'
import { sendTelegram } from '../../../utils/telegram'
import { getShopBotStatus, syncShopBot } from '../../../bot'

function sanitize(row: any) {
    if (!row) return row
    const { telegramBotToken, ...rest } = row
    return { ...rest, telegramBotTokenSet: Boolean(telegramBotToken), shopBot: getShopBotStatus() }
}

export default factories.createCoreController('api::request-setting.request-setting' as any, ({ strapi }: any) => ({
    async getOne(ctx) {
        let row = await strapi.db.query('api::request-setting.request-setting').findOne({ where: {} })
        if (!row) {
            row = await strapi.db.query('api::request-setting.request-setting').create({
                data: {
                    yellowAfterMin: 10,
                    redAfterMin: 30,
                    telegramEnabled: false,
                    overdueCheckEnabled: false,
                    publishedAt: new Date(),
                },
            })
        }
        ctx.body = { data: sanitize(row) }
    },

    async updateOne(ctx) {
        const body = (ctx.request.body?.data || ctx.request.body) as any
        let row = await strapi.db.query('api::request-setting.request-setting').findOne({ where: {} })
        if (!row) {
            row = await strapi.db.query('api::request-setting.request-setting').create({
                data: { publishedAt: new Date() },
            })
        }
        const patch: Record<string, any> = {}
        if ('yellowAfterMin' in body) patch.yellowAfterMin = Math.max(1, Number(body.yellowAfterMin) || 10)
        if ('redAfterMin' in body) patch.redAfterMin = Math.max(1, Number(body.redAfterMin) || 30)
        if ('telegramEnabled' in body) patch.telegramEnabled = Boolean(body.telegramEnabled)
        if ('overdueCheckEnabled' in body) patch.overdueCheckEnabled = Boolean(body.overdueCheckEnabled)
        if ('telegramChatIds' in body) patch.telegramChatIds = body.telegramChatIds || null
        if ('shopBotEnabled' in body) patch.shopBotEnabled = Boolean(body.shopBotEnabled)
        if ('shopBotGreeting' in body) patch.shopBotGreeting = String(body.shopBotGreeting || '').slice(0, 2000) || null
        if ('telegramBotToken' in body && body.telegramBotToken) {
            patch.telegramBotToken = String(body.telegramBotToken)
        }
        const updated = await strapi.db.query('api::request-setting.request-setting').update({
            where: { id: row.id },
            data: patch,
        })
        // Магазинный бот берёт токен и флаг из этих же настроек — применяем сразу.
        await syncShopBot(strapi)
        // Даём боту секунду на getMe, чтобы форма сразу показала «работает» или ошибку токена.
        await new Promise((r) => setTimeout(r, 1500))
        ctx.body = { data: sanitize(updated) }
    },

    /** Тестовая отправка через сохранённые токен/chatIds. Собирает ошибки sendTelegram и возвращает их. */
    async testTelegram(ctx) {
        const row = await strapi.db.query('api::request-setting.request-setting').findOne({ where: {} })
        if (!row?.telegramBotToken || !row?.telegramChatIds) {
            return ctx.throw(400, 'Заполните токен бота и chat ids, сохраните — и повторите тест')
        }
        const errors: string[] = []
        const text =
            '🧪 <b>Тестовое уведомление SoupPack</b>\n' +
            new Date().toLocaleString('ru-RU')
        await sendTelegram(row.telegramBotToken, row.telegramChatIds, text, {
            error: (m: string) => errors.push(m),
        })
        ctx.body = { data: { ok: errors.length === 0, errors } }
    },

    /** Публичное чтение для доски заявок — только пороги SLA, без Telegram-полей. */
    async getPublicSla(ctx) {
        const row = await strapi.db.query('api::request-setting.request-setting').findOne({ where: {} })
        ctx.body = {
            data: {
                yellowAfterMin: row?.yellowAfterMin ?? 10,
                redAfterMin: row?.redAfterMin ?? 30,
            },
        }
    },
}))
