import { describe, it, expect, beforeEach } from 'vitest'
import * as t from '../src/bot/texts'
import { ShopBot, BTN, PAGE_SIZE, INPUT_PLACEHOLDER } from '../src/bot/bot'
import { MemorySessionStore } from '../src/bot/session'
import type { CatalogPort, PlaceOrderInput, ProductCard } from '../src/bot/catalog'
import type { TgUpdate } from '../src/bot/api'
import { parseLatLng, resolveLatLng } from '../src/bot/geo'
import { MemoryPhotoStore } from '../src/bot/photos'

// ───────────────────────── чистые функции ─────────────────────────

describe('texts', () => {
    it('fmtMoney группирует разряды', () => {
        expect(t.fmtMoney(55000)).toBe('55 000 сум')
        expect(t.fmtMoney(1234567)).toBe('1 234 567 сум')
        expect(t.fmtMoney(0)).toBe('0 сум')
    })

    it('normalizeUzPhone принимает разные записи и отклоняет мусор', () => {
        expect(t.normalizeUzPhone('+998 90 123-45-67')).toBe('+998901234567')
        expect(t.normalizeUzPhone('998901234567')).toBe('+998901234567')
        expect(t.normalizeUzPhone('901234567')).toBe('+998901234567')
        expect(t.normalizeUzPhone('12345')).toBeNull()
        expect(t.normalizeUzPhone('+7 916 123 45 67')).toBeNull()
        expect(t.normalizeUzPhone('')).toBeNull()
    })

    it('changeQty добавляет, увеличивает, уменьшает и удаляет', () => {
        let c: t.CartLine[] = []
        c = t.changeQty(c, 'a', 1)
        c = t.changeQty(c, 'a', 1)
        c = t.changeQty(c, 'b', 1)
        expect(c).toEqual([{ documentId: 'a', qty: 2 }, { documentId: 'b', qty: 1 }])
        c = t.changeQty(c, 'a', -1)
        c = t.changeQty(c, 'b', -1)
        expect(c).toEqual([{ documentId: 'a', qty: 1 }])
        expect(t.changeQty([{ documentId: 'a', qty: t.MAX_QTY }], 'a', 1)[0].qty).toBe(t.MAX_QTY)
    })

    it('productCaption: имя, цена со скидкой, состав из массива; HTML экранируется', () => {
        const cap = t.productCaption({
            id: 'doc1', name: 'Суп <острый>', composition: ['Креветки', 'чили'], weight: 350,
            basePrice: 55000, finalPrice: 49500,
        })
        expect(cap).toContain('<b>Суп &lt;острый&gt;</b>')
        expect(cap).toContain('<s>55 000 сум</s> <b>49 500 сум</b>')
        expect(cap).toContain('Креветки, чили')
        expect(cap.length).toBeLessThanOrEqual(1024)
    })

    it('cartText показывает скидку только если она есть', () => {
        const base = { lines: [{ documentId: 'b', name: 'Борщ', qty: 2, basePrice: 46000 }], subtotal: 92000 }
        expect(t.cartText({ ...base, discountTotal: 0, total: 92000 })).not.toContain('Скидка')
        expect(t.cartText({ ...base, discountTotal: 9200, total: 82800 })).toContain('Скидка: −9 200 сум')
    })
})

// ───────────────────────── сценарий диалога ─────────────────────────

type Call = { method: string; args: any[] }

class FakeApi {
    calls: Call[] = []
    private nextId = 100
    private rec(method: string, args: any[], extra: any = {}) {
        this.calls.push({ method, args })
        return Promise.resolve({ message_id: this.nextId++, chat: { id: args[0], type: 'private' }, date: 0, ...extra })
    }
    sendMessage(...a: any[]) { return this.rec('sendMessage', a) }
    sendPhoto(...a: any[]) { return this.rec('sendPhoto', a, { photo: [{ file_id: 'F1', width: 1, height: 1 }] }) }
    sendContact(...a: any[]) { return this.rec('sendContact', a) }
    sendLocation(...a: any[]) { return this.rec('sendLocation', a) }
    sendChatAction(...a: any[]) { return this.rec('sendChatAction', a) }
    editMessageText(...a: any[]) { return this.rec('editMessageText', a) }
    editMessageReplyMarkup(...a: any[]) { return this.rec('editMessageReplyMarkup', a) }
    answerCallbackQuery(...a: any[]) { return this.rec('answerCallbackQuery', a) }
    texts() { return this.calls.filter((c) => c.method === 'sendMessage').map((c) => String(c.args[1])) }
    last(method: string) { return [...this.calls].reverse().find((c) => c.method === method) }
}

const products: ProductCard[] = Array.from({ length: 7 }, (_, i) => ({
    id: `p${i + 1}`, name: `Суп ${i + 1}`, composition: ['вода', 'соль'], weight: 350,
    basePrice: 10000 * (i + 1), finalPrice: 10000 * (i + 1),
    photo: i === 0 ? null : { url: `https://cdn.example/${i + 1}.png` },
}))

class FakeCatalog implements CatalogPort {
    placed: PlaceOrderInput[] = []
    async categories() { return [{ documentId: 'soups', name: 'Супы' }] }
    async category(id: string) { return id === 'soups' ? { documentId: 'soups', name: 'Супы' } : null }
    async products(_: string, offset: number, limit: number) {
        return { items: products.slice(offset, offset + limit), total: products.length }
    }
    async cartView(cart: t.CartLine[]) {
        const lines = cart.map((l) => {
            const p = products.find((x) => x.id === l.documentId)!
            return { documentId: l.documentId, name: p.name, qty: l.qty, basePrice: p.basePrice }
        })
        const total = lines.reduce((s, l) => s + l.qty * l.basePrice, 0)
        return { cart, lines, subtotal: total, discountTotal: 0, total }
    }
    async contact() { return { phone: '+998 71 200 00 00', workHours: '9:00–21:00', city: 'Ташкент' } }
    async placeOrder(input: PlaceOrderInput) {
        this.placed.push(input)
        return { code: 'SP-000001-11', total: 30000 }
    }
}

const CHAT = 42
const from = { id: CHAT, first_name: 'Азиз', username: 'aziz' }
let seq = 1
const msg = (m: Record<string, any>): TgUpdate =>
    ({ update_id: seq++, message: { message_id: seq, chat: { id: CHAT, type: 'private' }, from, date: 0, ...m } })
const press = (data: string, messageId = 500): TgUpdate =>
    ({ update_id: seq++, callback_query: { id: 'q' + seq, from, data, message: { message_id: messageId, chat: { id: CHAT, type: 'private' }, date: 0 } } })

describe('ShopBot', () => {
    let api: FakeApi
    let catalog: FakeCatalog
    let sessions: MemorySessionStore
    let bot: ShopBot

    beforeEach(() => {
        api = new FakeApi()
        catalog = new FakeCatalog()
        sessions = new MemorySessionStore()
        bot = new ShopBot({ api: api as any, catalog, sessions, log: { info() {}, warn() {}, error() {} } })
    })

    it('/start: приветствие с телефоном, постоянное меню и кнопки категорий', async () => {
        await bot.handleUpdate(msg({ text: '/start' }))
        const [welcome, cats] = api.calls.filter((c) => c.method === 'sendMessage')
        expect(welcome.args[1]).toContain('+998 71 200 00 00')
        const menu = welcome.args[2].reply_markup.keyboard.flat().map((b: any) => b.text)
        expect(menu).toEqual(expect.arrayContaining([BTN.categories, BTN.cart, BTN.phone]))
        expect(cats.args[2].reply_markup.inline_keyboard[0][0]).toEqual({ text: 'Супы', callback_data: 'cat:soups:0' })
    })

    it('категория: первые 5 товаров с фото/без, затем кнопка «Ещё», затем остаток', async () => {
        await bot.handleUpdate(press('cat:soups:0'))
        const cards = api.calls.filter((c) => c.method === 'sendPhoto' || (c.method === 'sendMessage' && String(c.args[1]).startsWith('<b>Суп')))
        expect(cards).toHaveLength(PAGE_SIZE)
        expect(api.calls.filter((c) => c.method === 'sendPhoto')).toHaveLength(PAGE_SIZE - 1) // у первого нет картинки
        const nav = api.last('sendMessage')!
        expect(nav.args[1]).toBe('Показано 5 из 7')
        expect(nav.args[2].reply_markup.inline_keyboard[0][0].callback_data).toBe('cat:soups:5')

        api.calls = []
        await bot.handleUpdate(press('cat:soups:5'))
        expect(api.calls.filter((c) => c.method === 'sendPhoto')).toHaveLength(2)
        expect(api.last('sendMessage')!.args[1]).toContain('Это все товары')
        // кнопку «Ещё» на прошлой странице убрали
        expect(api.calls[1].method).toBe('editMessageReplyMarkup')
    })

    it('«Добавить» → «Ещё»: количество растёт, кнопки карточки меняются', async () => {
        await bot.handleUpdate(press('add:p2'))
        await bot.handleUpdate(press('add:p2'))
        expect((await sessions.get(CHAT)).cart).toEqual([{ documentId: 'p2', qty: 2 }])
        const kb = api.last('editMessageReplyMarkup')!.args[2].inline_keyboard[0]
        expect(kb.map((b: any) => b.text)).toEqual(['➖', '🛒 2 шт', '➕ Ещё'])
        expect(api.last('answerCallbackQuery')!.args[1]).toBe('Добавлено. В корзине: 2 шт')
    })

    it('полное оформление: имя → телефон (контакт) → геопозиция → уточнение адреса → подтверждение', async () => {
        await bot.handleUpdate(press('add:p1'))
        await bot.handleUpdate(press('add:p2'))
        await bot.handleUpdate(press('chk'))
        expect(api.last('sendMessage')!.args[1]).toContain('Как вас зовут')

        await bot.handleUpdate(msg({ text: 'Азиз' }))
        const phoneAsk = api.last('sendMessage')!
        expect(phoneAsk.args[2].reply_markup.keyboard[0][0]).toEqual({ text: BTN.sendPhone, request_contact: true })

        await bot.handleUpdate(msg({ text: '123' }))
        expect(api.last('sendMessage')!.args[1]).toContain('Не похоже на номер')
        await bot.handleUpdate(msg({ contact: { phone_number: '998901234567', user_id: CHAT } }))

        // слишком короткий адрес
        await bot.handleUpdate(msg({ text: 'дом' }))
        expect(api.last('sendMessage')!.args[1]).toContain('Напишите улицу, дом и квартиру')
        expect(api.last('sendMessage')!.args[2].reply_markup.keyboard[0][0].request_location).toBe(true)
        await bot.handleUpdate(msg({ location: { latitude: 41.31, longitude: 69.24 } }))
        expect(api.last('sendMessage')!.args[1]).toContain('Точку получили')

        await bot.handleUpdate(msg({ text: 'ул. Навои, д. 5, кв. 12' }))
        const confirm = api.last('sendMessage')!
        expect(confirm.args[1]).toContain('Проверьте заказ')
        expect(confirm.args[1]).toContain('+998 90 123 45 67')

        await bot.handleUpdate(press('ok', 777))
        expect(catalog.placed).toHaveLength(1)
        expect(catalog.placed[0]).toMatchObject({
            fullName: 'Азиз', phone: '+998901234567', lat: 41.31, lng: 69.24,
            address: 'ул. Навои, д. 5, кв. 12',
            cart: [{ documentId: 'p1', qty: 1 }, { documentId: 'p2', qty: 1 }],
        })
        expect(catalog.placed[0].comment).toContain('@aziz')
        expect(api.last('sendMessage')!.args[1]).toContain('SP-000001-11')

        const s = await sessions.get(CHAT)
        expect(s.cart).toEqual([])
        expect(s.step).toBeNull()
        expect(s.profile).toEqual({ fullName: 'Азиз', phone: '+998901234567', address: 'ул. Навои, д. 5, кв. 12' })

        // повторное нажатие «Подтвердить» второй заказ не создаёт
        await bot.handleUpdate(press('ok', 777))
        expect(catalog.placed).toHaveLength(1)
    })

    it('кнопка меню посреди оформления отменяет его, корзина остаётся', async () => {
        await bot.handleUpdate(press('add:p3'))
        await bot.handleUpdate(press('chk'))
        await bot.handleUpdate(msg({ text: BTN.cart }))
        const s = await sessions.get(CHAT)
        expect(s.step).toBeNull()
        expect(s.cart).toEqual([{ documentId: 'p3', qty: 1 }])
        expect(api.texts().some((x) => x.includes('Оформление отменено'))).toBe(true)
    })

    it('пустая корзина не пускает в оформление', async () => {
        await bot.handleUpdate(press('chk'))
        expect(api.last('sendMessage')!.args[1]).toContain('Корзина пуста')
        expect((await sessions.get(CHAT)).step).toBeNull()
    })

    it('подсказка в поле ввода одна и та же на всех клавиатурах (клиенты Telegram обновляют её с опозданием)', async () => {
        const ph = () => api.last('sendMessage')!.args[2].reply_markup.input_field_placeholder
        await bot.handleUpdate(msg({ text: '/start' }))
        const menu = api.calls.find((c) => c.method === 'sendMessage')!.args[2].reply_markup
        expect(menu.input_field_placeholder).toBe(INPUT_PLACEHOLDER)
        await bot.handleUpdate(press('add:p1'))
        await bot.handleUpdate(press('chk'))
        expect(ph()).toBe(INPUT_PLACEHOLDER)
        await bot.handleUpdate(msg({ text: 'Азиз' }))
        expect(ph()).toBe(INPUT_PLACEHOLDER)
        await bot.handleUpdate(msg({ text: '+998901234567' }))
        expect(ph()).toBe(INPUT_PLACEHOLDER)
        await bot.handleUpdate(msg({ location: { latitude: 41.3, longitude: 69.2 } }))
        expect(ph()).toBe(INPUT_PLACEHOLDER)
        await bot.handleUpdate(msg({ text: 'дом 5, кв 12' }))
        await bot.handleUpdate(press('no'))
        expect(ph()).toBe(INPUT_PLACEHOLDER) // вернулись в главное меню
        // ни одна клавиатура не оставлена без подсказки (иначе клиент держит прошлую)
        for (const c of api.calls) {
            const rm = c.method === 'sendMessage' ? c.args[2]?.reply_markup : null
            if (rm?.keyboard) expect(rm.input_field_placeholder).toBe(INPUT_PLACEHOLDER)
        }
    })

    it('с компьютера: ссылка на карту вместо кнопки — точка принимается и показывается на карте', async () => {
        await bot.handleUpdate(press('add:p1'))
        await bot.handleUpdate(press('chk'))
        await bot.handleUpdate(msg({ text: 'Азиз' }))
        await bot.handleUpdate(msg({ text: '901234567' }))
        await bot.handleUpdate(msg({ text: 'https://www.google.com/maps/place/Tashkent/@41.2994958,69.2400734,12z' }))
        expect(api.last('sendLocation')!.args).toEqual([CHAT, 41.2994958, 69.2400734])
        const s = await sessions.get(CHAT)
        expect(s.step).toBe('address_details')
        expect(s.form).toMatchObject({ lat: 41.2994958, lng: 69.2400734 })
    })

    it('геопозиция необязательна: только адрес текстом → заказ без точки', async () => {
        await bot.handleUpdate(press('add:p1'))
        await bot.handleUpdate(press('chk'))
        await bot.handleUpdate(msg({ text: 'Азиз' }))
        await bot.handleUpdate(msg({ text: '901234567' }))
        await bot.handleUpdate(msg({ text: 'Чиланзар 9, дом 12, кв 34' }))
        const confirm = api.last('sendMessage')!
        expect(confirm.args[1]).toContain('Проверьте заказ')
        expect(confirm.args[1]).toContain('Чиланзар 9, дом 12, кв 34')
        expect(confirm.args[1]).toContain('Точка на карте не указана')
        await bot.handleUpdate(press('ok'))
        expect(catalog.placed).toHaveLength(1)
        expect(catalog.placed[0]).toMatchObject({ address: 'Чиланзар 9, дом 12, кв 34', lat: null, lng: null })
    })
})

describe('ShopBot: картинки', () => {
    const cards: ProductCard[] = [
        { id: 'a', name: 'А', basePrice: 1000, finalPrice: 1000, photo: { filePath: '/uploads/medium_a.png' } },
        { id: 'b', name: 'Б', basePrice: 1000, finalPrice: 1000, photo: { filePath: '/uploads/medium_b.png' } },
    ]
    class Cat extends FakeCatalog {
        async products() { return { items: cards, total: cards.length } }
    }
    let api: FakeApi, store: MemoryPhotoStore, compressed: string[], bot: ShopBot
    beforeEach(() => {
        api = new FakeApi()
        store = new MemoryPhotoStore()
        compressed = []
        let n = 0
        ;(api as any).sendPhoto = (...a: any[]) => {
            api.calls.push({ method: 'sendPhoto', args: a })
            if ('fileId' in a[1] && a[1].fileId === 'STALE') return Promise.reject(new Error('400 wrong file identifier'))
            return Promise.resolve({ message_id: 1, chat: { id: CHAT }, date: 0, photo: [{ file_id: 'small' }, { file_id: 'FID-' + (++n) }] })
        }
        bot = new ShopBot({
            api: api as any, catalog: new Cat(), sessions: new MemorySessionStore(), photoStore: store,
            compressPhoto: async (fp) => { compressed.push(fp); return { buffer: Buffer.from('jpg'), filename: 'x.jpg' } },
            log: { info() {}, warn() {}, error() {} },
        })
    })
    const photos = () => api.calls.filter((c) => c.method === 'sendPhoto').map((c) => c.args[1])

    it('первый показ: файлы сжимаются и загружаются, file_id запоминается', async () => {
        await bot.handleUpdate(press('cat:soups:0'))
        expect(api.calls.some((c) => c.method === 'sendChatAction' && c.args[1] === 'upload_photo')).toBe(true)
        expect(compressed).toEqual(['/uploads/medium_a.png', '/uploads/medium_b.png'])
        expect(photos()).toEqual([{ buffer: Buffer.from('jpg'), filename: 'x.jpg' }, { buffer: Buffer.from('jpg'), filename: 'x.jpg' }])
        expect(store.map.get('/uploads/medium_a.png')).toBe('FID-1') // берём самый крупный размер
    })

    it('повторный показ: по file_id, без сжатия и загрузки', async () => {
        await bot.handleUpdate(press('cat:soups:0'))
        api.calls = []; compressed = []
        await bot.handleUpdate(press('cat:soups:0'))
        expect(compressed).toEqual([])
        expect(photos()).toEqual([{ fileId: 'FID-1' }, { fileId: 'FID-2' }])
    })

    it('устаревший file_id: забываем и загружаем заново', async () => {
        await store.set('/uploads/medium_a.png', 'STALE')
        await bot.handleUpdate(press('cat:soups:0'))
        const ph = photos()
        expect(ph[0]).toEqual({ fileId: 'STALE' })
        expect(ph[1]).toEqual({ buffer: Buffer.from('jpg'), filename: 'x.jpg' })
        expect(store.map.get('/uploads/medium_a.png')).toMatch(/^FID-/)
    })
})

describe('geo: координаты из текста и ссылок', () => {
    const T = { lat: 41.311081, lng: 69.240562 }
    it.each([
        ['41.311081, 69.240562'],
        ['41.311081 69.240562'],
        ['69.240562, 41.311081'], // перепутан порядок — поправим по границам Узбекистана
        ['https://www.google.com/maps/@41.311081,69.240562,17z'],
        ['https://www.google.com/maps/place/X/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d41.311081!4d69.240562'],
        ['https://maps.google.com/?q=41.311081,69.240562'],
        ['https://yandex.uz/maps/10335/tashkent/?ll=69.240562%2C41.311081&z=17'],
        ['https://yandex.ru/maps/?pt=69.240562,41.311081&z=17&l=map'],
        ['https://2gis.uz/tashkent/geo/69.240562,41.311081'],
        ['https://www.openstreetmap.org/#map=17/41.311081/69.240562'],
        ['https://maps.apple.com/?ll=41.311081,69.240562&q=Pin'],
        ['Вот моя точка: https://www.google.com/maps/@41.311081,69.240562,17z — жду'],
    ])('%s', (input) => {
        const p = parseLatLng(input)!
        expect(p.lat).toBeCloseTo(T.lat, 5)
        expect(p.lng).toBeCloseTo(T.lng, 5)
    })

    it.each([['Чиланзар 5, дом 12'], ['12, 34'], ['901234567'], [''], ['0, 0']])('не координаты: %s', (input) => {
        expect(parseLatLng(input)).toBeNull()
    })

    it('короткая ссылка раскрывается по редиректу', async () => {
        const fake = (async (url: string) => {
            if (url.startsWith('https://maps.app.goo.gl/')) {
                return new Response(null, { status: 302, headers: { location: 'https://www.google.com/maps/place/@41.311081,69.240562,17z' } })
            }
            return new Response('nope', { status: 404 })
        }) as any
        const p = await resolveLatLng('https://maps.app.goo.gl/AbCdEf123', fake)
        expect(p).toEqual(T)
    })

    it('без ссылки — сеть не трогаем', async () => {
        let called = false
        const p = await resolveLatLng('ул. Навои', (async () => { called = true }) as any)
        expect(p).toBeNull()
        expect(called).toBe(false)
    })
})
