/**
 * Магазинный Telegram-бот внутри процесса Strapi (long polling).
 *
 * Настройки — в админке: «SLA и Telegram» (single-type `request-setting`):
 *   telegramBotToken — тот же токен, что и для уведомлений сотрудникам;
 *   shopBotEnabled   — включить магазин в боте для клиентов;
 *   shopBotGreeting  — текст приветствия.
 * После сохранения формы контроллер вызывает `syncShopBot` — бот перезапускается без рестарта сервера.
 *
 * Переменные окружения не обязательны. TELEGRAM_SHOP_BOT_ENABLED=false — запретить запуск на этой машине
 * (например, локально при копии боевой базы), TELEGRAM_SHOP_API_ROOT — свой адрес Bot API.
 * Подробности — docs/telegram-bot.md.
 */
import { TelegramApi, TelegramApiError } from './api'
import { ShopBot, COMMANDS } from './bot'
import { StrapiCatalog } from './catalog'
import { DbSessionStore } from './session'
import { StrapiPhotoStore, preloadSharp } from './photos'

const POLL_TIMEOUT_SEC = 30
const SETTINGS_UID = 'api::request-setting.request-setting'

export type ShopBotStatus = {
    state: 'off' | 'starting' | 'running' | 'error'
    username?: string | null
    error?: string | null
    /** Почему выключен: нет токена / выключен в настройках / запрещён на этой машине. */
    reason?: 'no_token' | 'disabled' | 'env_disabled' | null
}

type Runner = {
    token: string
    bot: ShopBot
    stop: () => Promise<void>
}

let runner: Runner | null = null
let status: ShopBotStatus = { state: 'off', reason: 'disabled' }
let queue: Promise<void> = Promise.resolve()

export function getShopBotStatus(): ShopBotStatus {
    return { ...status }
}

/** Привести бота в соответствие с настройками. Вызовы сериализуются. */
export function syncShopBot(strapi: any): Promise<void> {
    queue = queue.then(() => doSync(strapi)).catch((e: any) => {
        strapi.log.error('[shop-bot] sync failed: ' + (e?.message || e))
    })
    return queue
}

export function stopShopBot(): Promise<void> {
    queue = queue.then(async () => {
        if (runner) await runner.stop()
        runner = null
        status = { state: 'off', reason: 'disabled' }
    })
    return queue
}

async function doSync(strapi: any) {
    const s = await strapi.db.query(SETTINGS_UID).findOne({ where: {} })
    const token = String(s?.telegramBotToken || '').trim()
    const greeting = String(s?.shopBotGreeting || '').trim()

    let reason: ShopBotStatus['reason'] = null
    if (process.env.TELEGRAM_SHOP_BOT_ENABLED === 'false') reason = 'env_disabled'
    // Магазин включён, пока его явно не выключили галочкой (null у старых записей = включён).
    else if (s?.shopBotEnabled === false) reason = 'disabled'
    else if (!token) reason = 'no_token'

    if (reason) {
        if (runner) {
            await runner.stop()
            runner = null
        }
        if (status.state !== 'off' || status.reason !== reason) {
            strapi.log.info('[shop-bot] выключен: ' + REASON_TEXT[reason])
        }
        status = { state: 'off', reason }
        return
    }

    // Токен тот же и бот жив — только обновить приветствие, без перезапуска.
    // После ошибки (например, неверный токен) повторное сохранение формы перезапускает бота.
    if (runner && runner.token === token && status.state !== 'error') {
        runner.bot.setGreeting(greeting)
        return
    }

    if (runner) await runner.stop()
    runner = start(strapi, token, greeting)
}

const REASON_TEXT: Record<NonNullable<ShopBotStatus['reason']>, string> = {
    no_token: 'не указан Bot token (админка → «SLA и Telegram»)',
    disabled: 'снята галочка «Включить магазин в боте» (админка → «SLA и Telegram»)',
    env_disabled: 'TELEGRAM_SHOP_BOT_ENABLED=false в .env',
}

function start(strapi: any, token: string, greeting: string): Runner {
    const api = new TelegramApi(token, process.env.TELEGRAM_SHOP_API_ROOT || undefined)
    const bot = new ShopBot({
        api,
        catalog: new StrapiCatalog(strapi),
        sessions: new DbSessionStore(strapi),
        greeting,
        log: strapi.log,
        // file_id картинок — в БД, ключ с id бота (часть токена до двоеточия).
        photoStore: new StrapiPhotoStore(strapi, token.split(':')[0]),
    })

    const abort = new AbortController()
    let running = true
    status = { state: 'starting' }
    // Сжатие картинок: грузим sharp заранее, чтобы первая страница каталога не ждала.
    setImmediate(() => {
        if (!preloadSharp()) strapi.log.warn('[shop-bot] sharp недоступен — картинки уйдут без сжатия')
    })

    const loop = (async () => {
        strapi.log.info('[shop-bot] подключаюсь к Telegram…')
        // Подключение с повторами: сеть могла моргнуть при старте сервера.
        // Неверный токен (401/404) — не повторяем, ждём исправления в админке.
        for (let attempt = 1; running; attempt++) {
            try {
                // getUpdates не работает при установленном вебхуке — снимаем его.
                await api.deleteWebhook()
                const me = await api.getMe()
                await api.setMyCommands(COMMANDS)
                await api.setChatMenuButtonCommands()
                if (!running) return
                status = { state: 'running', username: me.username ?? null }
                strapi.log.info(`[shop-bot] запущен как @${me.username} — откройте https://t.me/${me.username} и нажмите /start`)
                break
            } catch (e: any) {
                if (!running) return
                const msg = errText(e)
                status = { state: 'error', error: humanError(msg) }
                const fatal = e instanceof TelegramApiError && (e.status === 401 || e.status === 404)
                strapi.log.error(`[shop-bot] не удалось подключиться (попытка ${attempt}): ${msg}` +
                    (fatal ? ' — проверьте Bot token' : ' — повтор через 10 с'))
                if (fatal) return
                await sleep(10_000)
            }
        }

        let offset = 0
        while (running) {
            try {
                const updates = await api.getUpdates(offset, POLL_TIMEOUT_SEC, abort.signal)
                if (status.state === 'error') status = { ...status, state: 'running', error: null }
                for (const u of updates) {
                    offset = u.update_id + 1
                    // Последовательно: порядок нажатий одного пользователя важен для корзины.
                    await bot.handleUpdate(u)
                }
            } catch (e: any) {
                if (!running) break
                const msg = errText(e)
                status = { ...status, state: 'error', error: humanError(msg) }
                strapi.log.warn('[shop-bot] polling error: ' + msg)
                await sleep(msg.includes('409') ? 15_000 : 3_000)
            }
        }
    })()

    return {
        token,
        bot,
        stop: async () => {
            running = false
            abort.abort()
            await loop.catch(() => {})
        },
    }
}

/** Текст ошибки вместе с сетевой причиной (fetch прячет её в `cause`). */
function errText(e: any): string {
    const base = e?.message || String(e)
    const cause = e?.cause?.code || e?.cause?.message
    return cause ? `${base} (${cause})` : base
}

function humanError(msg: string): string {
    if (/fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|ECONNRESET/i.test(msg)) {
        return 'Нет связи с api.telegram.org с этого сервера: ' + msg.slice(0, 120)
    }
    if (msg.includes(' 401') || msg.includes(' 404')) return 'Telegram не принял токен — проверьте Bot token'
    if (msg.includes(' 409')) return 'Этот токен уже опрашивает другой сервер (409). Выключите бота там или используйте другой токен'
    return msg.slice(0, 300)
}

function sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms))
}
