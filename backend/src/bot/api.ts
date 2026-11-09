/**
 * Минимальный клиент Telegram Bot API на встроенном `fetch` (Node ≥ 20) — без внешних зависимостей.
 * Покрывает только то, что нужно магазинному боту.
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'

export type TgUser = { id: number; is_bot?: boolean; first_name?: string; last_name?: string; username?: string }
export type TgChat = { id: number; type: 'private' | 'group' | 'supergroup' | 'channel' }
export type TgLocation = { latitude: number; longitude: number }
export type TgContact = { phone_number: string; first_name?: string; user_id?: number }

export type TgMessage = {
    message_id: number
    from?: TgUser
    chat: TgChat
    date: number
    text?: string
    contact?: TgContact
    location?: TgLocation
    venue?: { location: TgLocation; title?: string; address?: string }
    photo?: Array<{ file_id: string; width: number; height: number }>
}

export type TgCallbackQuery = {
    id: string
    from: TgUser
    message?: TgMessage
    data?: string
}

export type TgUpdate = {
    update_id: number
    message?: TgMessage
    callback_query?: TgCallbackQuery
}

export type InlineButton = { text: string; callback_data?: string; url?: string }
export type InlineKeyboard = { inline_keyboard: InlineButton[][] }
export type ReplyButton = { text: string; request_contact?: boolean; request_location?: boolean }
export type ReplyKeyboard = {
    keyboard: ReplyButton[][]
    resize_keyboard?: boolean
    one_time_keyboard?: boolean
    is_persistent?: boolean
    input_field_placeholder?: string
}
export type ReplyMarkup = InlineKeyboard | ReplyKeyboard | { remove_keyboard: true }

export class TelegramApiError extends Error {
    constructor(public method: string, public status: number, public description: string) {
        super(`[telegram] ${method} ${status}: ${description}`)
    }
}

/** Источник картинки: публичный URL или локальный файл из `public/uploads`. */
export type PhotoSource =
    | { url: string }
    | { filePath: string }
    | { fileId: string }
    /** Уже подготовленный (сжатый) файл в памяти. */
    | { buffer: Buffer; filename: string }

export class TelegramApi {
    private base: string

    constructor(token: string, apiRoot = 'https://api.telegram.org') {
        this.base = `${apiRoot.replace(/\/$/, '')}/bot${token.trim()}`
    }

    async call<T = any>(method: string, payload: Record<string, any> = {}, signal?: AbortSignal): Promise<T> {
        const res = await fetch(`${this.base}/${method}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal,
        })
        return this.unwrap<T>(method, res)
    }

    private async unwrap<T>(method: string, res: Response): Promise<T> {
        let body: any = null
        try { body = await res.json() } catch { /* not json */ }
        if (!res.ok || !body?.ok) {
            throw new TelegramApiError(method, res.status, body?.description || res.statusText)
        }
        return body.result as T
    }

    getUpdates(offset: number, timeoutSec: number, signal?: AbortSignal) {
        return this.call<TgUpdate[]>('getUpdates', {
            offset,
            timeout: timeoutSec,
            allowed_updates: ['message', 'callback_query'],
        }, signal)
    }

    sendMessage(chatId: number | string, text: string, extra: { reply_markup?: ReplyMarkup } = {}) {
        return this.call<TgMessage>('sendMessage', {
            chat_id: chatId,
            text,
            parse_mode: 'HTML',
            link_preview_options: { is_disabled: true },
            ...extra,
        })
    }

    editMessageText(chatId: number | string, messageId: number, text: string, reply_markup?: InlineKeyboard) {
        return this.call('editMessageText', {
            chat_id: chatId,
            message_id: messageId,
            text,
            parse_mode: 'HTML',
            link_preview_options: { is_disabled: true },
            reply_markup,
        })
    }

    editMessageReplyMarkup(chatId: number | string, messageId: number, reply_markup?: InlineKeyboard) {
        return this.call('editMessageReplyMarkup', {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: reply_markup ?? { inline_keyboard: [] },
        })
    }

    answerCallbackQuery(id: string, text?: string) {
        return this.call('answerCallbackQuery', { callback_query_id: id, text })
    }

    sendContact(chatId: number | string, phone: string, firstName: string) {
        return this.call('sendContact', { chat_id: chatId, phone_number: phone, first_name: firstName })
    }

    /** «Отправляет фото…» в шапке чата, пока готовим страницу каталога (держится ~5 с). */
    sendChatAction(chatId: number | string, action: 'typing' | 'upload_photo') {
        return this.call('sendChatAction', { chat_id: chatId, action })
    }

    sendLocation(chatId: number | string, latitude: number, longitude: number) {
        return this.call('sendLocation', { chat_id: chatId, latitude, longitude })
    }

    setMyCommands(commands: Array<{ command: string; description: string }>) {
        return this.call('setMyCommands', { commands })
    }

    setChatMenuButtonCommands() {
        return this.call('setChatMenuButton', { menu_button: { type: 'commands' } })
    }

    deleteWebhook() {
        return this.call('deleteWebhook', { drop_pending_updates: false })
    }

    getMe() {
        return this.call<TgUser>('getMe')
    }

    /** sendPhoto: URL/file_id — JSON-запросом, локальный файл — multipart-загрузкой. */
    async sendPhoto(
        chatId: number | string,
        photo: PhotoSource,
        caption: string,
        reply_markup?: InlineKeyboard,
    ): Promise<TgMessage> {
        if ('filePath' in photo || 'buffer' in photo) {
            const buf = 'buffer' in photo ? photo.buffer : await readFile(photo.filePath)
            const filename = 'buffer' in photo ? photo.filename : path.basename(photo.filePath)
            const form = new FormData()
            form.append('chat_id', String(chatId))
            form.append('caption', caption)
            form.append('parse_mode', 'HTML')
            if (reply_markup) form.append('reply_markup', JSON.stringify(reply_markup))
            form.append('photo', new Blob([new Uint8Array(buf)]), filename)
            const res = await fetch(`${this.base}/sendPhoto`, { method: 'POST', body: form })
            return this.unwrap<TgMessage>('sendPhoto', res)
        }
        return this.call<TgMessage>('sendPhoto', {
            chat_id: chatId,
            photo: 'url' in photo ? photo.url : photo.fileId,
            caption,
            parse_mode: 'HTML',
            reply_markup,
        })
    }
}
