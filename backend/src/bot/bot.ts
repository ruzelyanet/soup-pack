/**
 * Сценарии магазинного бота: приветствие → категории → товары по 5 → корзина → оформление.
 * Транспорт (long polling) — в ./index.ts; здесь только обработка апдейтов.
 */
import type {
    InlineButton, InlineKeyboard, ReplyKeyboard, TelegramApi, TgCallbackQuery, TgMessage, TgUpdate,
} from './api'
import type { CatalogPort } from './catalog'
import type { BotSession, SessionStore } from './session'
import * as t from './texts'
import { resolveLatLng, type LatLng } from './geo'
import { compressForTelegram, MemoryPhotoStore, photoKey, type Compressed, type PhotoStore } from './photos'
import type { PhotoSource } from './api'

export const PAGE_SIZE = 5

export const BTN = {
    categories: '📂 Категории',
    cart: '🛒 Корзина',
    phone: '📞 Телефон',
    cancel: '✖ Отменить оформление',
    sendPhone: '📱 Отправить мой номер',
    sendLocation: '📍 Отправить геопозицию',
} as const

export const COMMANDS = [
    { command: 'start', description: 'Главное меню' },
    { command: 'catalog', description: 'Категории' },
    { command: 'cart', description: 'Корзина' },
    { command: 'phone', description: 'Телефон магазина' },
]

export const DEFAULT_GREETING =
    'Здравствуйте! 👋 Это SOUP PUCK — натуральные супы в формате шайбы 350 г. ' +
    'Здесь можно посмотреть каталог и оформить доставку.'

/**
 * Одна нейтральная подсказка в поле ввода на ВСЕХ клавиатурах бота.
 * Telegram-клиенты (замечено на macOS/Desktop) обновляют подсказку с опозданием и держат подсказку
 * прошлой клавиатуры, если у новой её нет. Подсказки под каждый шаг из-за этого показывались не на своих шагах.
 * Одинаковый текст везде не может оказаться «не тем»; что вводить — написано в сообщении шага.
 */
export const INPUT_PLACEHOLDER = 'Напишите сообщение…'

const mainKeyboard: ReplyKeyboard = {
    keyboard: [[{ text: BTN.categories }, { text: BTN.cart }], [{ text: BTN.phone }]],
    resize_keyboard: true,
    is_persistent: true,
    input_field_placeholder: INPUT_PLACEHOLDER,
}

type Logger = { info: (m: string) => void; warn: (m: string) => void; error: (m: string) => void }

export type ShopBotOptions = {
    api: TelegramApi
    catalog: CatalogPort
    sessions: SessionStore
    greeting?: string
    log?: Logger
    /** Координаты из ссылки/текста (для Telegram Desktop). Подменяется в тестах. */
    resolveLocation?: (text: string) => Promise<LatLng | null>
    /** Хранилище file_id картинок (по умолчанию — в памяти; в проде — StrapiPhotoStore). */
    photoStore?: PhotoStore
    /** Сжатие локального файла перед загрузкой. Подменяется в тестах. */
    compressPhoto?: (filePath: string) => Promise<Compressed | null>
}

type PreparedPhoto = {
    key: string | null
    /** file_id из кеша — отправка без загрузки файла. */
    fileId: string | null
    /** Что загружать, если file_id нет или он устарел. */
    upload: () => Promise<PhotoSource>
}

const cb = (text: string, data: string): InlineButton => ({ text, callback_data: data })

export class ShopBot {
    private api: TelegramApi
    private catalog: CatalogPort
    private sessions: SessionStore
    private greeting: string
    private log: Logger
    private resolveLocation: (text: string) => Promise<LatLng | null>
    private photoStore: PhotoStore
    private compressPhoto: (filePath: string) => Promise<Compressed | null>

    constructor(o: ShopBotOptions) {
        this.api = o.api
        this.catalog = o.catalog
        this.sessions = o.sessions
        this.greeting = o.greeting?.trim() || DEFAULT_GREETING
        this.log = o.log || console
        this.resolveLocation = o.resolveLocation || ((text) => resolveLatLng(text))
        this.photoStore = o.photoStore || new MemoryPhotoStore()
        this.compressPhoto = o.compressPhoto || compressForTelegram
    }

    /** Текст приветствия меняется из админки без перезапуска бота. */
    setGreeting(greeting?: string | null) {
        this.greeting = greeting?.trim() || DEFAULT_GREETING
    }

    async handleUpdate(u: TgUpdate): Promise<void> {
        try {
            if (u.message) await this.onMessage(u.message)
            else if (u.callback_query) await this.onCallback(u.callback_query)
        } catch (e: any) {
            this.log.error('[shop-bot] update ' + u.update_id + ': ' + (e?.stack || e?.message || e))
            const chatId = u.message?.chat.id ?? u.callback_query?.message?.chat.id
            if (chatId) {
                await this.api.sendMessage(chatId, 'Что-то пошло не так 😔 Попробуйте ещё раз или позвоните нам.')
                    .catch(() => {})
            }
        }
    }

    // ───────────────────────── сообщения ─────────────────────────

    private async onMessage(m: TgMessage) {
        if (m.chat.type !== 'private') return
        const chatId = m.chat.id
        const s = await this.sessions.get(chatId, m.from)
        const text = (m.text || '').trim()
        const command = text.startsWith('/') ? text.split(/[\s@]/)[0].toLowerCase() : null

        // Команды и кнопки меню работают всегда; посреди оформления — прерывают его.
        const menu =
            command === '/start' ? 'start'
            : command === '/catalog' || text === BTN.categories ? 'categories'
            : command === '/cart' || text === BTN.cart ? 'cart'
            : command === '/phone' || text === BTN.phone ? 'phone'
            : text === BTN.cancel ? 'cancel'
            : null

        if (menu) {
            const wasCheckout = !!s.step
            if (s.step) { s.step = null; s.form = {} }
            await this.sessions.save(s)
            if (menu === 'cancel' || (wasCheckout && menu !== 'start')) {
                await this.api.sendMessage(chatId, 'Оформление отменено. Корзина сохранена.', { reply_markup: mainKeyboard })
            }
            if (menu === 'start') return this.sendWelcome(chatId)
            if (menu === 'categories') return this.sendCategories(chatId)
            if (menu === 'cart') return this.sendCart(chatId, s)
            if (menu === 'phone') return this.sendPhone(chatId)
            return
        }

        if (s.step) return this.onCheckoutInput(s, m)

        await this.api.sendMessage(chatId, 'Выберите раздел в меню ниже 👇', { reply_markup: mainKeyboard })
        await this.sendCategories(chatId)
    }

    async sendWelcome(chatId: number) {
        const contact = await this.catalog.contact()
        // Первое сообщение ставит постоянное меню (reply-клавиатуру).
        await this.api.sendMessage(chatId, t.welcomeText(this.greeting, contact), { reply_markup: mainKeyboard })
        await this.sendCategories(chatId, true)
    }

    async sendCategories(chatId: number, compact = false) {
        const cats = await this.catalog.categories()
        if (!cats.length) {
            await this.api.sendMessage(chatId, 'Каталог пока пуст. Загляните позже!')
            return
        }
        const rows: InlineButton[][] = []
        for (let i = 0; i < cats.length; i += 2) {
            rows.push(cats.slice(i, i + 2).map((c) => cb(c.name, `cat:${c.documentId}:0`)))
        }
        rows.push([cb(BTN.cart, 'cart')])
        await this.api.sendMessage(chatId, compact ? '📂 <b>Категории</b>' : '📂 <b>Выберите категорию</b>', {
            reply_markup: { inline_keyboard: rows },
        })
    }

    async sendPhone(chatId: number) {
        const c = await this.catalog.contact()
        await this.api.sendMessage(chatId, t.contactText(c), { reply_markup: mainKeyboard })
        const phone = t.normalizeUzPhone(c.phone)
        // Карточка контакта — по ней в Telegram можно сразу позвонить.
        if (phone) await this.api.sendContact(chatId, phone, 'SOUP PUCK').catch(() => {})
    }

    // ───────────────────────── каталог ─────────────────────────

    private productKeyboard(productId: string, qty: number): InlineKeyboard {
        if (qty <= 0) return { inline_keyboard: [[cb('➕ Добавить в корзину', `add:${productId}`)]] }
        return {
            inline_keyboard: [[
                cb('➖', `dec:${productId}`),
                cb(`🛒 ${qty} шт`, 'cart'),
                cb('➕ Ещё', `add:${productId}`),
            ]],
        }
    }

    async sendProductsPage(chatId: number, s: BotSession, categoryDocumentId: string, offset: number) {
        const category = await this.catalog.category(categoryDocumentId)
        if (!category) {
            await this.api.sendMessage(chatId, 'Категория больше не доступна.')
            return this.sendCategories(chatId)
        }
        const { items, total } = await this.catalog.products(categoryDocumentId, offset, PAGE_SIZE)
        if (offset === 0) {
            await this.api.sendMessage(chatId, total
                ? `📂 <b>${t.escapeHtml(category.name)}</b> · ${total} ${plural(total, 'товар', 'товара', 'товаров')}`
                : `В категории «${t.escapeHtml(category.name)}» пока нет товаров.`)
        }
        if (items.some((p) => p.photo)) this.api.sendChatAction(chatId, 'upload_photo').catch(() => {})
        // Картинки страницы готовим параллельно (кеш file_id / сжатие), отправляем — по порядку.
        const photos = await Promise.all(items.map((p) => this.preparePhoto(p.photo)))
        for (let i = 0; i < items.length; i++) {
            const p = items[i]
            const caption = t.productCaption(p)
            const kb = this.productKeyboard(p.id, t.cartQty(s.cart, p.id))
            await this.sendProductCard(chatId, photos[i], caption, kb)
        }
        const shown = offset + items.length
        const nav: InlineButton[][] = []
        if (shown < total) nav.push([cb(`⬇ Ещё (${total - shown})`, `cat:${categoryDocumentId}:${shown}`)])
        nav.push([cb(BTN.categories, 'cats'), cb(cartLabel(s), 'cart')])
        const navText = shown < total
            ? `Показано ${shown} из ${total}`
            : total ? `Это все товары в «${t.escapeHtml(category.name)}»` : 'Выберите другую категорию'
        await this.api.sendMessage(chatId, navText, { reply_markup: { inline_keyboard: nav } })
    }

    private async preparePhoto(photo: PhotoSource | null): Promise<PreparedPhoto | null> {
        if (!photo) return null
        const key = photoKey(photo)
        const fileId = key ? await this.photoStore.get(key).catch(() => null) : null
        let compressed: Promise<PhotoSource> | null = null
        const upload = () => {
            if (!compressed) {
                compressed = 'filePath' in photo
                    ? this.compressPhoto(photo.filePath).then((c) => c ?? photo, () => photo)
                    : Promise.resolve(photo)
            }
            return compressed
        }
        if (!fileId) upload() // начать сжатие сразу, параллельно с остальными
        return { key, fileId, upload }
    }

    private async sendProductCard(chatId: number, photo: PreparedPhoto | null, caption: string, kb: InlineKeyboard) {
        if (photo) {
            if (photo.fileId) {
                try {
                    await this.api.sendPhoto(chatId, { fileId: photo.fileId }, caption, kb)
                    return
                } catch (e: any) {
                    // file_id устарел (сменили бота и т. п.) — забываем и грузим файл заново.
                    if (photo.key) await this.photoStore.delete(photo.key).catch(() => {})
                }
            }
            try {
                const msg = await this.api.sendPhoto(chatId, await photo.upload(), caption, kb)
                const best = msg.photo?.[msg.photo.length - 1]
                if (photo.key && best) await this.photoStore.set(photo.key, best.file_id).catch(() => {})
                return
            } catch (e: any) {
                this.log.warn('[shop-bot] sendPhoto failed, fallback to text: ' + (e?.message || e))
            }
        }
        await this.api.sendMessage(chatId, caption, { reply_markup: kb })
    }

    // ───────────────────────── корзина ─────────────────────────

    private async renderCart(s: BotSession) {
        const view = await this.catalog.cartView(s.cart)
        s.cart = view.cart // выкинутые недоступные товары
        const rows: InlineButton[][] = view.lines.map((l) => [
            cb('➖', `cd:${l.documentId}`),
            cb(`${t.truncate(l.name, 18)} × ${l.qty}`, 'noop'),
            cb('➕', `ci:${l.documentId}`),
            cb('✖', `cr:${l.documentId}`),
        ])
        if (view.lines.length) {
            rows.push([cb('🧹 Очистить', 'cclr'), cb('✅ Оформить заказ', 'chk')])
        }
        rows.push([cb(view.lines.length ? '📂 Продолжить покупки' : BTN.categories, 'cats')])
        return { text: t.cartText(view), kb: { inline_keyboard: rows } as InlineKeyboard, view }
    }

    async sendCart(chatId: number, s: BotSession) {
        const { text, kb } = await this.renderCart(s)
        await this.sessions.save(s)
        await this.api.sendMessage(chatId, text, { reply_markup: kb })
    }

    // ───────────────────────── callback-кнопки ─────────────────────────

    private async onCallback(q: TgCallbackQuery) {
        const msg = q.message
        const data = q.data || ''
        if (!msg || msg.chat.type !== 'private') {
            await this.api.answerCallbackQuery(q.id)
            return
        }
        const chatId = msg.chat.id
        const s = await this.sessions.get(chatId, q.from)
        const [action, a1, a2] = data.split(':')
        let toast: string | undefined

        switch (action) {
            case 'cats':
                await this.api.answerCallbackQuery(q.id)
                return this.sendCategories(chatId)

            case 'cat': {
                await this.api.answerCallbackQuery(q.id)
                const offset = Math.max(0, Number(a2) || 0)
                // Кнопку «Ещё» с прошлой страницы убираем, чтобы не листать дважды.
                if (offset > 0) await this.api.editMessageReplyMarkup(chatId, msg.message_id).catch(() => {})
                return this.sendProductsPage(chatId, s, a1, offset)
            }

            case 'add':
            case 'dec': {
                const pid = a1
                if (!pid) break
                s.cart = t.changeQty(s.cart, pid, action === 'add' ? 1 : -1)
                await this.sessions.save(s)
                const qty = t.cartQty(s.cart, pid)
                toast = action === 'add'
                    ? (qty >= t.MAX_QTY ? `Максимум ${t.MAX_QTY} шт` : `Добавлено. В корзине: ${qty} шт`)
                    : qty ? `В корзине: ${qty} шт` : 'Убрано из корзины'
                await this.api.editMessageReplyMarkup(chatId, msg.message_id, this.productKeyboard(pid, qty))
                    .catch(() => {}) // «message is not modified» при упоре в лимит
                break
            }

            case 'cart':
                await this.api.answerCallbackQuery(q.id)
                return this.sendCart(chatId, s)

            case 'ci':
            case 'cd':
            case 'cr':
            case 'cclr': {
                const pid = a1
                if (action === 'ci') s.cart = t.changeQty(s.cart, pid, 1)
                if (action === 'cd') s.cart = t.changeQty(s.cart, pid, -1)
                if (action === 'cr') s.cart = t.removeLine(s.cart, pid)
                if (action === 'cclr') { s.cart = []; toast = 'Корзина очищена' }
                const { text, kb } = await this.renderCart(s)
                await this.sessions.save(s)
                await this.api.editMessageText(chatId, msg.message_id, text, kb).catch(() => {})
                break
            }

            case 'chk':
                await this.api.answerCallbackQuery(q.id)
                return this.startCheckout(chatId, s)

            case 'ok':
                await this.api.answerCallbackQuery(q.id)
                return this.placeOrder(chatId, s, msg.message_id)

            case 'chg':
                await this.api.answerCallbackQuery(q.id)
                await this.api.editMessageReplyMarkup(chatId, msg.message_id).catch(() => {})
                return this.startCheckout(chatId, s)

            case 'no':
                s.step = null
                s.form = {}
                await this.sessions.save(s)
                await this.api.answerCallbackQuery(q.id, 'Оформление отменено')
                await this.api.editMessageReplyMarkup(chatId, msg.message_id).catch(() => {})
                await this.api.sendMessage(chatId, 'Оформление отменено. Корзина сохранена.', { reply_markup: mainKeyboard })
                return

            default:
                break
        }
        await this.api.answerCallbackQuery(q.id, toast)
    }

    // ───────────────────────── оформление ─────────────────────────

    async startCheckout(chatId: number, s: BotSession) {
        const view = await this.catalog.cartView(s.cart)
        s.cart = view.cart
        if (!view.lines.length) {
            s.step = null
            await this.sessions.save(s)
            await this.api.sendMessage(chatId, t.cartText(view), {
                reply_markup: { inline_keyboard: [[cb(BTN.categories, 'cats')]] },
            })
            return
        }
        s.step = 'name'
        s.form = {}
        await this.sessions.save(s)
        await this.askStep(chatId, s)
    }

    /** Клавиатура шага оформления: подсказка в поле — общая (см. INPUT_PLACEHOLDER), кнопка отмены — всегда. */
    private keyboard(rows: ReplyKeyboard['keyboard']): ReplyKeyboard {
        return {
            keyboard: [...rows, [{ text: BTN.cancel }]],
            resize_keyboard: true,
            input_field_placeholder: INPUT_PLACEHOLDER,
        }
    }

    private async askStep(chatId: number, s: BotSession, hint?: string) {
        const pre = hint ? hint + '\n\n' : ''
        const p = s.profile
        switch (s.step) {
            case 'name':
                return this.api.sendMessage(chatId, pre + 'Шаг 1 из 3. Как вас зовут?', {
                    reply_markup: this.keyboard(p.fullName ? [[{ text: p.fullName }]] : []),
                })
            case 'phone':
                return this.api.sendMessage(chatId,
                    pre + 'Шаг 2 из 3. Номер телефона — нажмите кнопку ниже или введите в формате +998 XX XXX XX XX.', {
                        reply_markup: this.keyboard([
                            [{ text: BTN.sendPhone, request_contact: true }],
                            ...(p.phone ? [[{ text: t.fmtPhone(p.phone) }]] : []),
                        ]),
                    })
            case 'address':
                return this.api.sendMessage(chatId,
                    pre + 'Шаг 3 из 3. Адрес доставки.\n\n' +
                    '✍️ Напишите: <b>улица, дом, квартира</b> (подъезд, этаж — по желанию).\n' +
                    '📍 Или отправьте геопозицию — кнопкой ниже (с телефона) или ссылкой на точку из карт.', {
                        reply_markup: this.keyboard([
                            [{ text: BTN.sendLocation, request_location: true }],
                            ...(p.address ? [[{ text: p.address }]] : []),
                        ]),
                    })
            case 'address_details':
                return this.api.sendMessage(chatId,
                    pre + '📍 Точку получили. Уточните адрес: <b>улица, дом, квартира</b> (подъезд, этаж — по желанию).', {
                        reply_markup: this.keyboard(p.address ? [[{ text: p.address }]] : []),
                    })
            default:
                return
        }
    }

    private async onCheckoutInput(s: BotSession, m: TgMessage) {
        const chatId = m.chat.id
        const text = (m.text || '').trim()
        // Сессии, начатые до объединения шагов локации и адреса.
        if ((s.step as string) === 'location') s.step = 'address'

        switch (s.step) {
            case 'name': {
                if (text.length < 2 || text.length > 60 || text.startsWith('/')) {
                    return this.askStep(chatId, s, 'Введите имя текстом (от 2 до 60 символов).')
                }
                s.form.fullName = text
                s.step = 'phone'
                break
            }
            case 'phone': {
                const phone = t.normalizeUzPhone(m.contact?.phone_number || text)
                if (!phone) return this.askStep(chatId, s, '❗ Не похоже на номер. Пример: +998 90 123 45 67.')
                s.form.phone = phone
                s.step = 'address'
                break
            }
            case 'address': {
                // Геопозиция необязательна: можно отправить точку, а можно просто написать адрес —
                // тогда точку отметит оператор в админке, уточнив у клиента.
                const loc = m.location || m.venue?.location
                const fromLink = !loc && text ? await this.resolveLocation(text) : null
                if (loc || fromLink) {
                    s.form.lat = loc ? loc.latitude : fromLink!.lat
                    s.form.lng = loc ? loc.longitude : fromLink!.lng
                    // Точку из ссылки показываем на карте — клиент сразу видит, туда ли.
                    if (fromLink) await this.api.sendLocation(chatId, fromLink.lat, fromLink.lng).catch(() => {})
                    s.step = 'address_details'
                    break
                }
                if (text.length < 5 || text.length > 200) {
                    return this.askStep(chatId, s, '❗ Напишите улицу, дом и квартиру (от 5 до 200 символов) или отправьте геопозицию.')
                }
                s.form.address = text
                s.form.lat = undefined
                s.form.lng = undefined
                s.step = 'confirm'
                break
            }
            case 'address_details': {
                const loc = m.location || m.venue?.location
                if (loc) { // передумал и прислал другую точку
                    s.form.lat = loc.latitude
                    s.form.lng = loc.longitude
                    return this.askStep(chatId, s)
                }
                if (text.length < 2 || text.length > 200) {
                    return this.askStep(chatId, s, '❗ Напишите дом и квартиру текстом (до 200 символов).')
                }
                s.form.address = text
                s.step = 'confirm'
                break
            }
            case 'confirm':
            case 'placing':
                await this.api.sendMessage(chatId, 'Подтвердите заказ кнопкой выше или нажмите «Отменить оформление».')
                return
        }
        await this.sessions.save(s)
        if (s.step === 'confirm') return this.sendConfirm(chatId, s)
        return this.askStep(chatId, s)
    }

    private async sendConfirm(chatId: number, s: BotSession) {
        const view = await this.catalog.cartView(s.cart)
        s.cart = view.cart
        await this.sessions.save(s)
        if (!view.lines.length) return this.startCheckout(chatId, s)
        await this.api.sendMessage(chatId, t.confirmText(s.form, view), {
            reply_markup: {
                inline_keyboard: [
                    [cb('✅ Подтвердить заказ', 'ok')],
                    [cb('✏️ Изменить данные', 'chg'), cb('✖ Отмена', 'no')],
                ],
            },
        })
    }

    async placeOrder(chatId: number, s: BotSession, confirmMessageId?: number) {
        if (s.step !== 'confirm') {
            // Повторное нажатие / устаревшая кнопка.
            if (s.step === 'placing') return
            await this.api.sendMessage(chatId, 'Эта кнопка устарела. Откройте корзину, чтобы оформить заказ.', {
                reply_markup: mainKeyboard,
            })
            return
        }
        const f = s.form
        if (!f.fullName || !f.phone || !f.address) {
            s.step = 'name'
            await this.sessions.save(s)
            return this.askStep(chatId, s, 'Не хватает данных — заполним заново.')
        }
        s.step = 'placing'
        await this.sessions.save(s)
        if (confirmMessageId) await this.api.editMessageReplyMarkup(chatId, confirmMessageId).catch(() => {})

        try {
            const who = [s.firstName, s.username ? '@' + s.username : null].filter(Boolean).join(' ')
            const order = await this.catalog.placeOrder({
                fullName: f.fullName,
                phone: f.phone,
                address: f.address,
                lat: f.lat ?? null,
                lng: f.lng ?? null,
                cart: s.cart,
                comment: `Telegram: ${who || 'без username'} (chat ${s.chatId})`,
            })
            s.profile = { fullName: f.fullName, phone: f.phone, address: f.address }
            s.lastOrderCode = order.code
            s.cart = []
            s.step = null
            s.form = {}
            await this.sessions.save(s)
            await this.api.sendMessage(chatId,
                `✅ <b>Заказ ${t.escapeHtml(order.code)} принят!</b>\n` +
                `Сумма: ${t.fmtMoney(order.total)}, оплата при получении.\n\n` +
                `Мы позвоним на ${t.escapeHtml(t.fmtPhone(f.phone))}, чтобы подтвердить заказ. Спасибо! 🍲`,
                { reply_markup: mainKeyboard })
        } catch (e: any) {
            this.log.error('[shop-bot] placeOrder: ' + (e?.stack || e?.message || e))
            s.step = 'confirm'
            await this.sessions.save(s)
            const contact = await this.catalog.contact().catch(() => ({} as t.ShopContactView))
            await this.api.sendMessage(chatId,
                '😔 Не получилось оформить заказ. Попробуйте ещё раз' +
                (contact.phone ? ` или позвоните: ${t.escapeHtml(contact.phone)}` : '') + '.', {
                    reply_markup: { inline_keyboard: [[cb('🔁 Повторить', 'ok'), cb('🛒 Корзина', 'cart')]] },
                })
        }
    }
}

function cartLabel(s: BotSession): string {
    const n = t.cartCount(s.cart)
    return n ? `🛒 Корзина (${n})` : BTN.cart
}

function plural(n: number, one: string, few: string, many: string): string {
    const m10 = n % 10, m100 = n % 100
    if (m10 === 1 && m100 !== 11) return one
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few
    return many
}
