import { sendTelegram, escapeHtml } from '../../../../utils/telegram'

/** После создания заявки — опционально нотифицировать Telegram-бот. */
export default {
    async afterCreate(event: any) {
        try {
            // @ts-ignore global strapi
            const strapi = (global as any).strapi
            if (!strapi) return
            const result = event?.result
            if (!result?.id) return

            const settings = await strapi.db
                .query('api::request-setting.request-setting')
                .findOne({ where: {} })
            if (!settings?.telegramEnabled) return
            if (!settings.telegramBotToken || !settings.telegramChatIds) return

            const typeLabel = result.type === 'shop' ? 'Магазин' : 'Физлицо'
            const text =
                `🆕 <b>Новая заявка ${escapeHtml(result.code)}</b>\n` +
                `${escapeHtml(typeLabel)} · ${escapeHtml(result.source || 'manual')}\n` +
                `${escapeHtml(result.name)} · ${escapeHtml(result.phone)}` +
                (result.sourceDetail ? `\nИсточник: ${escapeHtml(result.sourceDetail)}` : '')

            await sendTelegram(settings.telegramBotToken, settings.telegramChatIds, text, strapi.log)
        } catch (e: any) {
            // @ts-ignore
            (global as any).strapi?.log?.error?.('[request/afterCreate telegram] ' + (e?.message || e))
        }
    },
}
