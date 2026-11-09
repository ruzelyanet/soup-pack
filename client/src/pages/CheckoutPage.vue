<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useCart } from '@/stores/cart'
import { useAuth } from '@/stores/auth'
import { useCatalog } from '@/stores/catalog'
import { useCheckout, type PayMethod } from '@/stores/checkout'
import { useToast } from 'primevue/usetoast'
import DatePicker from 'primevue/datepicker'
import AddressPicker from '@/components/AddressPicker.vue'
import UpsellModal from '@/components/UpsellModal.vue'
import Icon from '@/components/Icon.vue'
import { api } from '@/services/api'
import type { Order } from '@/types'

const cart = useCart()
const catalog = useCatalog()
const auth = useAuth()
const checkout = useCheckout()
const router = useRouter()
const toast = useToast()

/** Отформатировать 9 узбекских цифр как `XX XXX XX XX`. +998 рисуется снаружи. */
function maskLocalPhone(raw: string): string {
    const d = raw.replace(/\D/g, '').slice(0, 9)
    const parts: string[] = []
    if (d.length >= 1) parts.push(d.slice(0, 2))
    if (d.length >= 3) parts.push(d.slice(2, 5))
    if (d.length >= 6) parts.push(d.slice(5, 7))
    if (d.length >= 8) parts.push(d.slice(7, 9))
    return parts.join(' ')
}

/** Форма живёт в сторе — переживает уход на /catalog и обратно, перезагрузку страницы. */
const form = checkout.form

// Префилл из профиля (localStorage auth.client) — только если в сторе ещё ничего нет
// (первый вход). Иначе ничего не трогаем, доверяя сохранённому состоянию.
;(function prefillFromAuthOnce() {
    if (!form.phone && auth.client?.phone) {
        form.phone = maskLocalPhone(auth.client.phone.replace(/^\+?998/, ''))
    }
    if (!form.fullName && auth.client?.fullName) form.fullName = auth.client.fullName
    if (!form.address && auth.client?.address) {
        form.address = auth.client.address
        if (auth.client.lat != null) form.lat = auth.client.lat
        if (auth.client.lng != null) form.lng = auth.client.lng
    }
})()

const submitting = ref(false)

/** Открыть/закрыть модалку «Добавить ещё». */
const showUpsell = ref(false)

/** PrimeVue Dialog с `modal` блокирует scroll на body и возвращает фокус на триггер при закрытии —
 *  вместе это даёт прыжок страницы. Запоминаем позицию перед открытием и восстанавливаем после закрытия. */
let savedScrollY = 0
watch(showUpsell, (open, prev) => {
    if (open && !prev) {
        savedScrollY = window.scrollY
    } else if (!open && prev) {
        // nextTick + rAF: ждём, пока PrimeVue снимет overflow/padding-right с body
        // и Vue отрисует вернувшийся layout, иначе прыжок всё равно происходит.
        nextTick(() => requestAnimationFrame(() => {
            window.scrollTo({ top: savedScrollY, left: 0, behavior: 'instant' as ScrollBehavior })
        }))
    }
})

/** Пофайловые ошибки с бэка (`error.details.fieldErrors`): fullName, phone, address, deliverySlotAt, items.
 *  Чистятся сами, когда пользователь правит соответствующее поле. */
const fieldErrors = reactive<Record<string, string | undefined>>({})

function clearFieldError(key: string) {
    if (fieldErrors[key]) fieldErrors[key] = undefined
}

watch(() => form.fullName,      () => clearFieldError('fullName'))
watch(() => form.phone,         () => clearFieldError('phone'))
watch(() => form.address,       () => clearFieldError('address'))
watch(() => form.preorderDate,  () => clearFieldError('deliverySlotAt'))
watch(() => form.preorderTime,  () => clearFieldError('deliverySlotAt'))
watch(() => cart.lines.length,  () => clearFieldError('items'))

/** Если старый сохранённый адрес содержит «кв. N» внутри строки — вытащить в form.flat
 *  и очистить строку. Чтобы «Квартира» из карты не висела внутри `address`, а
 *  отображалась в отдельном поле формы. */
;(function migrateAptFromAddress() {
    if (form.flat) return
    const m = (form.address || '').match(/,\s*кв\.?\s*(\S+)\s*$/i)
    if (m) {
        form.flat = m[1]
        form.address = form.address.replace(m[0], '').trim().replace(/,\s*$/, '')
    }
})()

/* ────── Скидка на чек — из серверного quote ──────
 *  Корзина сама пересылает `deliveryMethod/paymentMethod` в /pricing/quote (через cart.setContext).
 *  activeTier берём из применённых order-уровневых скидок в текущем quote;
 *  nextTier (подсказка «добавьте ещё N») — из `quote.hints[0]` (сервер уже отбирает лучший). */

type Tier = { minTotal: number; percent: number }

// Транслируем выбор способа доставки/оплаты в cart — чтобы quote считал корректно.
watch(() => [form.delivery, form.pay] as const, ([d, p]) => {
    cart.setContext({ deliveryMethod: d, paymentMethod: p })
}, { immediate: true })

/** Применённая order-уровневая скидка (если есть) — её процент показываем в бейджах. */
const activeOrderDiscount = computed(() => {
    const q = cart.quote
    if (!q) return null
    for (const l of q.lines) {
        for (const d of l.discounts) {
            if (d.level === 'order') return d
        }
    }
    return null
})

/** Публичное название скидки на весь чек — publicLabel с фоллбеком на name. */
const activeOrderDiscountLabel = computed(() => {
    const d = activeOrderDiscount.value
    if (!d) return ''
    const applied = cart.quote?.appliedDiscounts.find((a) => a.discountId === d.discountId)
    return (applied?.publicLabel || applied?.name || d.name || '').trim()
})

/** Активный «тариф» в терминах старого UI — только когда реально срезает сумму (есть order-скидка). */
const activeTier = computed<Tier | null>(() => {
    const d = activeOrderDiscount.value
    if (!d || d.benefitType !== 'percent') return null
    return { minTotal: 0, percent: Number(d.benefitValue) }
})

/** На тайле «Курьером» бейдж −N% — вне зависимости от выбранного способа. */
const potentialTier = computed<Tier | null>(() => activeTier.value)

const cartDiscountAmount = computed(() => {
    const q = cart.quote
    if (!q) return 0
    let sum = 0
    for (const l of q.lines) {
        for (const d of l.discounts) if (d.level === 'order') sum += d.amount
    }
    return sum
})

/** Итоговая сумма — просто `cart.total` (сервер уже всё посчитал). */
const grandTotal = computed(() => cart.total)

/** Следующий тариф — ближайшая `NEXT_TIER`-подсказка из серверного quote. */
const nextTier = computed(() => {
    const hint = cart.hints[0]
    if (!hint) return null
    // Для совместимости с текущим шаблоном — выдаём {minTotal, percent}.
    // Процент достанем из `label` (нам хватит), либо считаем позднее.
    const pctMatch = /−?(\d+)%/.exec(hint.label || '')
    return { minTotal: cart.subtotal + hint.missing, percent: pctMatch ? Number(pctMatch[1]) : 0 }
})

/** Минимальная дата для предзаказа — сегодня. */
const minDate = new Date()

/** Способы оплаты.
 *  - Наличными: только при предзаказе.
 *  - Картой курьеру: только при предзаказе (при «курьером сейчас» едет Яндекс — наличку/soliq не берут).
 */
const paymentMethods = computed(() => {
    const list: Array<{ k: PayMethod; label: string; subtitle?: string; icon: string; soon?: boolean }> = []
    if (form.delivery === 'preorder') {
        list.push({ k: 'cash', label: 'Наличными',       subtitle: 'оплата при получении', icon: 'pi-wallet' })
        list.push({ k: 'card', label: 'Картой курьеру',  subtitle: 'soliq qrcode',         icon: 'pi-credit-card' })
    }
    list.push({ k: 'transfer', label: 'Переводом',       subtitle: 'на карту менеджера',   icon: 'pi-send' })
    list.push({ k: 'click',    label: 'Click',           subtitle: 'подключим скоро',      icon: 'pi-mobile', soon: true })
    list.push({ k: 'payme',    label: 'Payme',           subtitle: 'подключим скоро',      icon: 'pi-mobile', soon: true })
    return list
})

/** Если выбран способ, который сейчас недоступен — выключаем. */
watch(
    () => [form.delivery, paymentMethods.value],
    () => {
        if (!paymentMethods.value.some((p) => p.k === form.pay && !p.soon)) {
            const fallback = paymentMethods.value.find((p) => !p.soon)
            if (fallback) form.pay = fallback.k
        }
    },
    { immediate: true },
)

/** Нормализованный +998XXXXXXXXX или null, если ещё не 9 цифр. */
const normalizedPhone = computed(() => {
    const d = form.phone.replace(/\D/g, '').slice(0, 9)
    return d.length === 9 ? '+998' + d : null
})

/** Номер введён полностью (9 локальных цифр) — разблокирует остальную форму. */
const phoneComplete = computed(() => normalizedPhone.value !== null)

/* ────── Lookup клиента на сервере ────── */
type LookupState =
    | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'unknown' }
    | { status: 'known'; fullName: string; address: string | null; lat: number | null; lng: number | null; ordersCount: number }

const lookup = ref<LookupState>({ status: 'idle' })

/** Fallback «узнали номер» по localStorage — показываем мгновенно, пока сервер ещё не ответил. */
const knownLocal = computed(() => {
    return !!(normalizedPhone.value && auth.client?.phone === normalizedPhone.value && auth.client?.fullName)
})

/** Итоговый флаг «мы вас узнали» (сервер победил, если ответил; иначе — локалка). */
const known = computed(() => lookup.value.status === 'known' || knownLocal.value)

/** Текст и порядковый номер заказа — для баннера с приветствием. */
const returningMessage = computed(() => {
    if (lookup.value.status === 'known') {
        const n = lookup.value.ordersCount
        const name = (lookup.value.fullName || auth.client?.fullName || '').split(' ')[0] || 'друг'
        const ordersPhrase = n === 0
            ? 'Мы узнали номер и подставили ваши данные.'
            : n === 1
                ? 'Это уже ваш второй заказ у нас — спасибо, что возвращаетесь!'
                : `У вас уже ${n} заказов у нас — спасибо, что возвращаетесь!`
        return { name, text: ordersPhrase }
    }
    if (knownLocal.value) {
        return {
            name: auth.client?.fullName?.split(' ')[0] || 'друг',
            text: 'Мы узнали номер и подставили данные из прошлого заказа.',
        }
    }
    return null
})

let lookupSeq = 0
let lookupTimer: ReturnType<typeof setTimeout> | null = null

/** Сброс всех зависящих от номера полей (имя, адрес, детали, координаты, комментарий). */
function resetDependentFields() {
    form.fullName = ''
    form.address = ''
    form.lat = undefined
    form.lng = undefined
    form.flat = ''
    form.entrance = ''
    form.floor = ''
    form.comment = ''
}

watch(normalizedPhone, (phone, prev) => {
    if (lookupTimer) {
        clearTimeout(lookupTimer)
        lookupTimer = null
    }
    if (!phone) {
        lookup.value = { status: 'idle' }
        // Телефон стёрли/укоротили — чистим подтянутые/введённые данные,
        // чтобы при вводе другого номера не осталось «хвостов» от прошлого.
        resetDependentFields()
        return
    }
    // Сменили номер на другой полный — тоже очистим, lookup подставит заново.
    if (prev && prev !== phone) {
        resetDependentFields()
    }
    const seq = ++lookupSeq
    lookup.value = { status: 'loading' }
    lookupTimer = setTimeout(async () => {
        try {
            const res = await api.post('/clients/lookup', { phone })
            if (seq !== lookupSeq) return
            const d = res.data?.data
            if (d?.found && d.client) {
                lookup.value = {
                    status: 'known',
                    fullName: d.client.fullName || '',
                    address: d.client.address ?? null,
                    lat: d.client.lat ?? null,
                    lng: d.client.lng ?? null,
                    ordersCount: Number(d.ordersCount || 0),
                }
                // Подставить данные в форму — не затирая того, что пользователь уже начал печатать.
                if (!form.fullName && lookup.value.fullName) form.fullName = lookup.value.fullName
                if (!form.address && lookup.value.address) {
                    form.address = lookup.value.address
                    if (lookup.value.lat != null) form.lat = lookup.value.lat
                    if (lookup.value.lng != null) form.lng = lookup.value.lng
                }
            } else {
                lookup.value = { status: 'unknown' }
            }
        } catch {
            // не нашли / сеть упала — молча остаёмся с idle/unknown
            if (seq === lookupSeq) lookup.value = { status: 'unknown' }
        }
    }, 350)
}, { immediate: true })

const linesWith = computed(() =>
    cart.lines.map((l) => {
        const p = l.productId ? catalog.products.find((pp) => pp.id === l.productId) : null
        return {
            ...l,
            variant: p?.variant ?? 'default',
            price: l.unitPrice,  // для совместимости с шаблоном
        }
    }),
)

/** Группировка строк чека: отдельные товары + блоки по экземпляру набора.
 *  Серверный quote помечает строки, входящие в набор, одинаковым `setInstance`. */
type ReceiptGroup =
    | { kind: 'product'; line: typeof linesWith.value[number] }
    | {
          kind: 'set'
          key: string
          name: string
          lines: Array<typeof linesWith.value[number]>
          base: number          // стоимость без скидки набора (sum basePrice)
          finalBeforeOrder: number  // после скидок уровня line/set (без order-уровня)
          setDiscount: number       // сумма set+line скидок по строкам инстанса
          setDiscountPercent: number | null
          setDiscountLabel: string | null  // публичное название скидки набора
      }

const groupedLines = computed<ReceiptGroup[]>(() => {
    const groups: ReceiptGroup[] = []
    const bySetInstance = new Map<string, Extract<ReceiptGroup, { kind: 'set' }>>()

    for (const l of linesWith.value) {
        if (!l.setInstance) {
            groups.push({ kind: 'product', line: l })
            continue
        }
        let g = bySetInstance.get(l.setInstance)
        if (!g) {
            const setName =
                cart.items.find((i) => i.type === 'set' && i.refId === l.orderSetId)?.name ||
                catalog.sets.find((s) => s.id === l.orderSetId)?.name ||
                'Набор'
            g = {
                kind: 'set',
                key: l.setInstance,
                name: setName,
                lines: [],
                base: 0,
                finalBeforeOrder: 0,
                setDiscount: 0,
                setDiscountPercent: null,
                setDiscountLabel: null,
            }
            bySetInstance.set(l.setInstance, g)
            groups.push(g)
        }
        g.lines.push(l)
        // basePrice — цена за штуку; для строки умножаем на qty.
        g.base += l.basePrice * l.qty
        // lineTotal — после всех скидок (вкл. order). Чтобы получить "до order":
        g.finalBeforeOrder += l.lineTotal + l.orderDiscountAmount
        for (const d of l.discounts) {
            if (d.level === 'line' || d.level === 'set') {
                g.setDiscount += d.amount
                if (g.setDiscountPercent == null && d.benefitType === 'percent') {
                    g.setDiscountPercent = Number(d.benefitValue)
                }
                if (!g.setDiscountLabel) {
                    const applied = cart.quote?.appliedDiscounts.find((a) => a.discountId === d.discountId)
                    g.setDiscountLabel = (applied?.publicLabel || applied?.name || d.name || '').trim() || null
                }
            }
        }
    }

    return groups
})

function fmt(v: number) {
    return new Intl.NumberFormat('ru-RU').format(v) + ' сум'
}

async function submit() {
    // Пустая корзина — редкий кейс, но на всякий случай молча отбиваем.
    if (!cart.items.length) return
    // Сбросим прошлые бэк-ошибки, чтобы на новом сабмите не висели старые красные.
    for (const k of Object.keys(fieldErrors)) fieldErrors[k] = undefined
    submitting.value = true
    try {
        const normalized = '+998' + form.phone.replace(/\D/g, '').slice(0, 9)
        const fullAddress = [form.address, form.flat && `кв. ${form.flat}`]
            .filter(Boolean)
            .join(', ')

        // Соберём ISO для слота предзаказа.
        let deliverySlotAt: string | null = null
        if (form.delivery === 'preorder' && form.preorderDate) {
            const [h, m] = form.preorderTime.split(':').map((x) => parseInt(x, 10))
            const d = new Date(form.preorderDate)
            d.setHours(h || 12, m || 0, 0, 0)
            deliverySlotAt = d.toISOString()
        }

        const payload = {
            client: {
                fullName: form.fullName,
                phone: normalized,
                address: fullAddress,
                lat: form.lat,
                lng: form.lng,
            },
            // Новый формат корзины: {type: 'product'|'set', productId/orderSetId, qty}.
            items: cart.items.map((i) => i.type === 'set'
                ? { type: 'set', orderSetId: i.refId, qty: i.qty }
                : { type: 'product', productId: i.refId, qty: i.qty }),
            comment: form.comment,
            paymentMethod: form.pay,
            deliveryMethod: form.delivery,
            deliverySlotAt,
            address: fullAddress,
            lat: form.lat,
            lng: form.lng,
        }

        const { data } = await api.post('/orders/place', payload)
        const serverOrder = data?.data

        // Для локальной истории заказов — приводим серверные строки к формату `OrderLine`.
        const historyItems = (serverOrder?.items || []).map((l: any) => ({
            productId: l.product?.id ?? l.product,
            name: l.name,
            price: Number(l.unitPrice ?? l.price ?? 0),
            qty: Number(l.qty || 1),
        }))

        const order: Order = {
            code: serverOrder?.code || 'SP-' + Date.now().toString().slice(-6),
            client: payload.client,
            items: historyItems,
            comment: form.comment,
            paymentMethod: (form.pay === 'cash' ? 'cash' : 'card') as 'cash' | 'card',
            total: Number(serverOrder?.total ?? grandTotal.value),
            status: 'new',
            createdAt: serverOrder?.createdAt || new Date().toISOString(),
        }

        auth.identify(order.client)
        auth.rememberLastAddress(fullAddress, form.lat, form.lng)
        auth.pushOrder(order)
        cart.clear()
        // Сохранённую форму больше не держим — следующий заказ начнём с чистого листа
        // (имя/адрес/телефон при этом остаются в auth.client и подставятся на префилле).
        checkout.reset()
        router.replace(`/success/${order.code}`)
    } catch (e: any) {
        // Полный лог в консоль — чтобы увидеть статус, тело ответа и трассировку.
        console.error('[orders/place] failed:', {
            status: e?.response?.status,
            data: e?.response?.data,
            message: e?.message,
        })
        const status = e?.response?.status
        const srvMsg = e?.response?.data?.error?.message
        const details = e?.response?.data?.error?.details
        const srvFieldErrors = details?.fieldErrors as Record<string, string> | undefined

        // Если сервер прислал пофайловые ошибки — заселяем их под инпуты и уходим.
        if (status === 400 && srvFieldErrors && Object.keys(srvFieldErrors).length) {
            for (const [k, v] of Object.entries(srvFieldErrors)) fieldErrors[k] = v
            toast.add({
                severity: 'warn',
                summary: srvMsg || 'Проверьте форму заказа',
                life: 3500,
            })
            return
        }

        let detail = srvMsg || e?.message || 'Попробуйте ещё раз'
        if (status === 403) {
            detail = 'Сервер отклонил запрос (403). Перезапустите backend — права `api::order.order.place` ставятся на bootstrap.'
        } else if (status === 404) {
            detail = 'Эндпоинт /orders/place не найден. Проверьте, что backend запущен и роут зарегистрирован.'
        } else if (!e?.response) {
            detail = 'Нет связи с API. Запустите backend (cd backend && npm run develop).'
        } else if (details) {
            detail += ' · ' + JSON.stringify(details).slice(0, 240)
        }
        toast.add({
            severity: 'error',
            summary: 'Не удалось оформить заказ',
            detail,
            life: 7000,
        })
    } finally {
        submitting.value = false
    }
}
</script>

<template>
    <section class="flex-1 flex flex-col">
        <header class="px-4 pt-3.5 pb-2 flex items-center gap-3">
            <button type="button" aria-label="Назад в корзину" @click="router.push('/cart')"
                    class="size-11 rounded-full bg-sf flex items-center justify-center">
                <Icon name="chevron-left" :size="20" :stroke="2.4" />
            </button>
            <h1 class="m-0 font-display font-black text-[24px]">Оформление</h1>
        </header>

        <form class="px-4 pt-1 flex flex-col gap-3.5" @submit.prevent="submit">
            <!-- Contacts -->
            <fieldset class="m-0 border-0 bg-sf rounded-[24px] p-[18px] flex flex-col gap-3.5">
                <legend class="float-left w-full p-0 font-display font-extrabold text-[16px]">Контакты</legend>

                <div class="flex flex-col gap-1.5">
                    <label for="phone" class="font-bold text-[13px] text-mut">Номер телефона</label>
                    <div class="flex items-center h-14 rounded-2xl bg-sf px-3.5 gap-2.5 border-2 transition"
                         :class="fieldErrors.phone
                             ? 'border-acc'
                             : known ? 'border-oks' : 'border-ln2'">
                        <span class="font-extrabold text-[16px] text-mut">+998</span>
                        <input id="phone" :value="form.phone" type="tel" inputmode="tel" placeholder="90 000 00 00"
                               autocomplete="tel-national"
                               class="flex-1 min-w-0 border-0 outline-none font-bold text-[16px] text-ink bg-transparent"
                               @input="(e) => { form.phone = maskLocalPhone((e.target as HTMLInputElement).value); (e.target as HTMLInputElement).value = form.phone }" />
                        <Icon v-if="known" name="check" :size="22" :stroke="2.6" class="text-oks" />
                    </div>
                    <p v-if="fieldErrors.phone" class="text-[12px] text-acc font-semibold">
                        {{ fieldErrors.phone }}
                    </p>
                </div>

                <!-- Индикатор проверки / «мы вас узнали» -->
                <div v-if="phoneComplete && lookup.status === 'loading'" role="status"
                     class="rounded-2xl bg-sf2 px-3.5 py-2.5 flex items-center gap-2 text-[13px] text-fnt">
                    <span class="pi pi-spin pi-spinner text-[14px]"></span>
                    Проверяем, не заказывали ли вы у нас раньше…
                </div>

                <div v-if="known && returningMessage" role="status"
                     class="bg-ok-bg rounded-2xl px-3.5 py-3 flex gap-2.5 items-start">
                    <span aria-hidden="true"
                          class="shrink-0 size-8 rounded-full bg-oks text-white font-extrabold flex items-center justify-center">
                        {{ (returningMessage.name || '?').trim()[0]?.toUpperCase() }}
                    </span>
                    <span class="text-[14px] leading-snug text-ok">
                        <b>С возвращением, {{ returningMessage.name }}!</b>
                        {{ returningMessage.text }}
                    </span>
                </div>

                <div class="flex flex-col gap-1.5">
                    <label for="fullName" class="font-bold text-[13px] text-mut">Имя</label>
                    <input id="fullName" v-model="form.fullName" placeholder="Как к вам обращаться"
                           :disabled="!phoneComplete"
                           class="h-14 rounded-2xl border-[1.5px] bg-sf px-3.5 font-bold text-[16px] text-ink disabled:opacity-50 disabled:cursor-not-allowed"
                           :class="fieldErrors.fullName ? 'border-acc' : 'border-ln2'" />
                    <p v-if="fieldErrors.fullName" class="text-[12px] text-acc font-semibold">
                        {{ fieldErrors.fullName }}
                    </p>
                </div>
            </fieldset>

            <!-- Address -->
            <fieldset class="m-0 border-0 bg-sf rounded-[24px] p-[18px] flex flex-col gap-3.5 transition"
                      :disabled="!phoneComplete"
                      :class="!phoneComplete && 'opacity-50 pointer-events-none select-none'"
                      :aria-disabled="!phoneComplete">
                <legend class="float-left w-full p-0 font-display font-extrabold text-[16px]">Куда доставить</legend>

                <div class="flex flex-col gap-1.5">
                    <label class="font-bold text-[13px] text-mut">Город</label>
                    <div class="h-14 rounded-2xl bg-sf2 px-4 flex items-center gap-2 font-extrabold text-[15px] text-ink">
                        <Icon name="map-pin" :size="18" class="text-acct" />
                        Ташкент
                    </div>
                </div>

                <div class="flex flex-col gap-1.5">
                    <AddressPicker
                        v-model="form.address"
                        v-model:lat="form.lat"
                        v-model:lng="form.lng"
                        v-model:apt="form.flat"
                        label="Улица, дом"
                        placeholder="Например, ул. Амира Темура, 12"
                    />
                    <p v-if="fieldErrors.address" class="text-[12px] text-acc font-semibold">
                        {{ fieldErrors.address }}
                    </p>
                </div>

                <div class="grid grid-cols-3 gap-2">
                    <div class="flex flex-col gap-1.5">
                        <label for="flat" class="font-bold text-[13px] text-mut">Кв.</label>
                        <input id="flat" v-model="form.flat"
                               class="h-13 rounded-[14px] border-[1.5px] border-ln2 bg-sf px-3 font-semibold text-[16px] text-ink" style="height:52px" />
                    </div>
                    <div class="flex flex-col gap-1.5">
                        <label for="entr" class="font-bold text-[13px] text-mut">Подъезд</label>
                        <input id="entr" v-model="form.entrance"
                               class="rounded-[14px] border-[1.5px] border-ln2 bg-sf px-3 font-semibold text-[16px] text-ink" style="height:52px" />
                    </div>
                    <div class="flex flex-col gap-1.5">
                        <label for="floor" class="font-bold text-[13px] text-mut">Этаж</label>
                        <input id="floor" v-model="form.floor"
                               class="rounded-[14px] border-[1.5px] border-ln2 bg-sf px-3 font-semibold text-[16px] text-ink" style="height:52px" />
                    </div>
                </div>

                <div class="flex flex-col gap-1.5">
                    <label for="comment" class="font-bold text-[13px] text-mut">Комментарий курьеру</label>
                    <textarea id="comment" v-model="form.comment" rows="2" placeholder="Домофон, ориентир"
                              class="rounded-2xl border-[1.5px] border-ln2 bg-sf p-3.5 font-medium text-[16px] text-ink resize-none"></textarea>
                </div>
            </fieldset>

            <!-- Способ доставки -->
            <fieldset class="m-0 border-0 bg-sf rounded-[24px] p-[18px] flex flex-col gap-3 transition"
                      :disabled="!phoneComplete"
                      :class="!phoneComplete && 'opacity-50 pointer-events-none select-none'"
                      :aria-disabled="!phoneComplete">
                <legend class="float-left w-full p-0 font-display font-extrabold text-[16px]">
                    Способ доставки
                </legend>
                <div role="radiogroup" aria-label="Способ доставки" class="grid grid-cols-1 gap-2">
                    <!-- Курьером сейчас — скидка привязана именно к этому способу.
                         div[role=radio], а не <button>, т.к. внутри есть вложенная кнопка «Добавить». -->
                    <div role="radio" :aria-checked="form.delivery === 'courier_now'"
                         tabindex="0"
                         @click="form.delivery = 'courier_now'"
                         @keydown.space.prevent="form.delivery = 'courier_now'"
                         @keydown.enter.prevent="form.delivery = 'courier_now'"
                         class="min-h-16 rounded-2xl border-2 flex items-start gap-3 px-4 py-3 text-left transition cursor-pointer select-none"
                         :class="form.delivery === 'courier_now'
                             ? 'bg-ink text-bg border-ink'
                             : 'bg-sf text-ink border-ln2'">
                        <!-- Визуальный radio -->
                        <span aria-hidden="true"
                              class="shrink-0 size-6 mt-0.5 rounded-full border-2 flex items-center justify-center transition"
                              :class="form.delivery === 'courier_now' ? 'border-bg' : 'border-ln2'">
                            <span v-if="form.delivery === 'courier_now'"
                                  class="size-3 rounded-full bg-bg"></span>
                        </span>
                        <span class="flex-1 min-w-0 flex flex-col gap-1.5">
                            <span class="flex items-center gap-2">
                                <span class="font-extrabold text-[14px]">
                                    Курьером прямо сейчас
                                </span>
                                <span v-if="potentialTier"
                                      class="shrink-0 bg-acc text-white font-extrabold text-[11px] tracking-wider uppercase px-2 py-0.5 rounded-full">
                                    −{{ potentialTier.percent }}%
                                </span>
                            </span>
                            <span class="text-[12px] opacity-80">
                                Отправим через Яндекс Доставку<span v-if="potentialTier && !activeTier"> · при этом способе скидка −{{ potentialTier.percent }}% на весь чек</span>
                            </span>

                            <!-- Активная скидка — крупным, с указанием «Ваша скидка» и суммой экономии. -->
                            <span v-if="activeTier"
                                  class="self-start inline-flex items-center gap-2 rounded-xl bg-acc text-white font-extrabold text-[13px] px-3 py-1.5 shadow-[0_6px_16px_-6px_rgba(214,58,28,0.55)]">
                                <span class="pi pi-check-circle text-[14px]"></span>
                                <span>
                                    Ваша скидка −{{ activeTier.percent }}%
                                    <span class="opacity-90 font-bold">· −{{ fmt(cartDiscountAmount) }}</span>
                                </span>
                            </span>

                            <!-- Подсказка следующего тарифа + кнопка «Добавить» рядом -->
                            <span v-if="nextTier"
                                  class="self-start flex items-center gap-1.5 flex-wrap">
                                <span class="rounded-lg bg-acc/15 text-acc font-bold text-[11px] px-2 py-1 leading-snug">
                                    Добавьте ещё {{ fmt(nextTier.minTotal - cart.total) }} —
                                    скидка <b>−{{ nextTier.percent }}%</b> на весь чек
                                </span>
                                <button type="button"
                                        @click.stop="showUpsell = true"
                                        class="shrink-0 inline-flex items-center gap-1 rounded-full bg-acc text-white font-extrabold text-[11px] uppercase tracking-wider px-2.5 py-1 active:scale-95 transition">
                                    <span class="pi pi-plus text-[10px]"></span>
                                    Добавить
                                </button>
                            </span>
                        </span>
                    </div>

                    <!-- Предзаказ — без скидки, с датой/временем внутри -->
                    <div class="rounded-2xl border-2 transition overflow-hidden"
                         :class="form.delivery === 'preorder'
                             ? 'bg-ink text-bg border-ink'
                             : 'bg-sf text-ink border-ln2'">
                        <button type="button" role="radio" :aria-checked="form.delivery === 'preorder'"
                                @click="form.delivery = 'preorder'"
                                class="w-full min-h-16 flex items-center gap-3 px-4 py-3 text-left bg-transparent border-0 cursor-pointer">
                            <span aria-hidden="true"
                                  class="shrink-0 size-6 rounded-full border-2 flex items-center justify-center transition"
                                  :class="form.delivery === 'preorder' ? 'border-bg' : 'border-ln2'">
                                <span v-if="form.delivery === 'preorder'"
                                      class="size-3 rounded-full bg-bg"></span>
                            </span>
                            <span class="flex-1 min-w-0 flex flex-col gap-0.5">
                                <span class="font-extrabold text-[14px]">Предзаказ</span>
                                <span class="text-[12px] opacity-80">выбрать дату и время · без скидки чека</span>
                            </span>
                            <span class="shrink-0 pi pi-calendar text-[18px] opacity-70"></span>
                        </button>

                        <!-- Обязательные поля даты/времени — внутри блока «Предзаказ» -->
                        <div v-if="form.delivery === 'preorder'"
                             class="px-4 pb-4 pt-1 grid grid-cols-2 gap-2">
                            <div class="flex flex-col gap-1">
                                <label class="font-bold text-[12px] opacity-80 uppercase tracking-wider">
                                    Дата <span class="text-acc">*</span>
                                </label>
                                <DatePicker v-model="form.preorderDate" showIcon :minDate="minDate"
                                            dateFormat="dd.mm.yy" class="w-full" />
                            </div>
                            <div class="flex flex-col gap-1">
                                <label class="font-bold text-[12px] opacity-80 uppercase tracking-wider">
                                    Время <span class="text-acc">*</span>
                                </label>
                                <select v-model="form.preorderTime"
                                        class="w-full h-[46px] rounded-2xl border-[1.5px] border-ln2 bg-sf px-3 font-bold text-[15px] text-ink">
                                    <option v-for="h in [10,11,12,13,14,15,16,17,18,19,20,21]" :key="h"
                                            :value="`${String(h).padStart(2,'0')}:00`">
                                        {{ String(h).padStart(2, '0') }}:00
                                    </option>
                                </select>
                            </div>
                            <p v-if="fieldErrors.deliverySlotAt"
                               class="col-span-2 text-[12px] text-acc font-semibold">
                                {{ fieldErrors.deliverySlotAt }}
                            </p>
                        </div>
                    </div>
                </div>
                <p v-if="fieldErrors.items" class="text-[12px] text-acc font-semibold">
                    {{ fieldErrors.items }}
                </p>
            </fieldset>

            <!-- Pay -->
            <fieldset class="m-0 border-0 bg-sf rounded-[24px] p-[18px] flex flex-col gap-2 transition"
                      :disabled="!phoneComplete"
                      :class="!phoneComplete && 'opacity-50 pointer-events-none select-none'"
                      :aria-disabled="!phoneComplete">
                <legend class="float-left w-full p-0 font-display font-extrabold text-[16px] pb-1">Оплата</legend>
                <div role="radiogroup" aria-label="Способ оплаты" class="flex flex-col gap-2">
                    <button v-for="p in paymentMethods" :key="p.k"
                            type="button" role="radio" :aria-checked="form.pay === p.k"
                            :disabled="p.soon"
                            @click="form.pay = p.k"
                            class="min-h-[60px] rounded-2xl border-2 flex items-center gap-3 px-3 py-2 text-left transition"
                            :class="[
                                p.soon
                                    ? 'bg-sf2 text-fnt border-ln2 opacity-70 cursor-not-allowed'
                                    : form.pay === p.k
                                        ? 'bg-ink text-bg border-ink'
                                        : 'bg-sf text-ink border-ln2 hover:border-ink',
                            ]">
                        <span class="size-10 rounded-xl flex items-center justify-center shrink-0"
                              :class="form.pay === p.k && !p.soon
                                        ? 'bg-bg/20 text-bg'
                                        : 'bg-sf2 text-ink'">
                            <i :class="`pi ${p.icon}`"></i>
                        </span>
                        <span class="flex-1 min-w-0 flex flex-col gap-0.5">
                            <span class="font-extrabold text-[14px] flex items-center gap-2">
                                {{ p.label }}
                                <span v-if="p.soon"
                                      class="bg-ink/15 text-fnt font-bold text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full">
                                    скоро
                                </span>
                            </span>
                            <span v-if="p.subtitle" class="text-[12px] opacity-80 truncate">
                                {{ p.subtitle }}
                            </span>
                        </span>
                    </button>
                </div>
            </fieldset>

            <!-- Dark summary -->
            <section class="bg-deep text-deepink rounded-[24px] p-[18px] flex flex-col gap-3">
                <template v-for="(g, gi) in groupedLines" :key="g.kind === 'set' ? g.key : g.line.lineKey">
                    <!-- Отдельный товар -->
                    <div v-if="g.kind === 'product'" class="flex justify-between items-baseline gap-3 text-[14px]">
                        <span class="text-deepmut flex-1 min-w-0">
                            {{ g.line.name }} × {{ g.line.qty }}
                            <span v-if="g.line.qty > 1" class="text-[12px] opacity-70">
                                · по {{ fmt(g.line.unitPrice) }}
                            </span>
                        </span>
                        <span class="font-bold whitespace-nowrap">{{ fmt(g.line.lineTotal + g.line.orderDiscountAmount) }}</span>
                    </div>
                    <!-- Набор — отдельный блок -->
                    <div v-else class="rounded-[16px] bg-[rgba(255,241,220,0.07)] border border-[rgba(255,241,220,0.14)] p-3 flex flex-col gap-2">
                        <div class="flex items-center gap-2">
                            <span class="bg-btr text-ink font-extrabold text-[10px] tracking-wider uppercase px-2 py-0.5 rounded-full">
                                Набор
                            </span>
                            <span class="font-extrabold text-[14px]">{{ g.name }}</span>
                        </div>
                        <ul class="flex flex-col gap-1 list-none m-0 p-0 pl-1">
                            <li v-for="l in g.lines" :key="l.lineKey"
                                class="flex justify-between items-baseline gap-3 text-[13px] text-deepmut">
                                <span class="flex-1 min-w-0">
                                    · {{ l.name }} × {{ l.qty }}
                                    <span v-if="l.qty > 1" class="text-[12px] opacity-70">
                                        · по {{ fmt(l.basePrice) }}
                                    </span>
                                </span>
                                <span class="whitespace-nowrap">{{ fmt(l.basePrice * l.qty) }}</span>
                            </li>
                        </ul>
                        <div v-if="g.setDiscount > 0" class="flex justify-between items-baseline gap-3 text-[13px]">
                            <span class="text-btr flex-1 min-w-0">
                                Скидка набора<template v-if="g.setDiscountPercent"> −{{ g.setDiscountPercent }}%</template>
                                <span v-if="g.setDiscountLabel" class="block text-[11px] font-semibold opacity-80 truncate">
                                    {{ g.setDiscountLabel }}
                                </span>
                            </span>
                            <span class="font-bold text-btr whitespace-nowrap">− {{ fmt(g.setDiscount) }}</span>
                        </div>
                        <div class="h-px bg-[rgba(255,241,220,0.14)]"></div>
                        <div class="flex justify-between items-baseline text-[14px]">
                            <span class="font-extrabold">Итого набора</span>
                            <span class="font-display font-extrabold text-[16px] text-btr">
                                {{ fmt(g.finalBeforeOrder) }}
                            </span>
                        </div>
                    </div>
                </template>
                <div class="h-px bg-[rgba(255,241,220,0.15)]"></div>
                <div class="flex justify-between text-[14px]">
                    <span class="text-deepmut">Общая сумма</span>
                    <span class="font-bold">{{ fmt(grandTotal + cartDiscountAmount) }}</span>
                </div>
                <div v-if="activeTier" class="flex justify-between items-baseline gap-3 text-[14px]">
                    <span class="text-btr flex-1 min-w-0">
                        Скидка на весь чек −{{ activeTier.percent }}%
                        <span v-if="activeOrderDiscountLabel" class="block text-[11px] font-semibold opacity-80 truncate">
                            {{ activeOrderDiscountLabel }}
                        </span>
                    </span>
                    <span class="font-bold text-btr whitespace-nowrap">− {{ fmt(cartDiscountAmount) }}</span>
                </div>
                <div class="h-px bg-[rgba(255,241,220,0.15)]"></div>
                <div class="flex justify-between items-baseline">
                    <span class="font-extrabold">Итого</span>
                    <span class="font-display font-black text-[22px] text-btr">{{ fmt(grandTotal) }}</span>
                </div>
            </section>
        </form>

        <div class="flex-1 min-h-6"></div>

        <div class="sticky bottom-0 px-4 pt-3 pb-5 bg-bg border-t border-ln flex flex-col gap-2">
            <button type="button" @click="submit" :disabled="submitting || !phoneComplete"
                    class="h-[60px] rounded-[20px] bg-acc text-white font-extrabold text-[17px] disabled:opacity-60 disabled:cursor-not-allowed">
                <template v-if="!phoneComplete">Укажите номер телефона</template>
                <template v-else>Подтвердить заказ · {{ fmt(grandTotal) }}</template>
            </button>
            <span class="text-center text-[12px] text-mut">
                Нажимая кнопку, вы соглашаетесь с
                <RouterLink to="/delivery" class="text-ink underline underline-offset-2 font-bold">
                    условиями доставки и оплаты
                </RouterLink>
            </span>
        </div>

        <!-- Модалка «Добавить ещё в заказ» — выбирает товары по категориям и кладёт в корзину. -->
        <UpsellModal
            v-model:open="showUpsell"
            :next-tier="nextTier"
            :cart-total="cart.total"
        />
    </section>
</template>
