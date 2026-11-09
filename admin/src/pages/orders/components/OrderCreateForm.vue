<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useToast } from 'primevue/usetoast'
import PhoneInput from '@/components/PhoneInput.vue'
import AddressPicker from '@/components/AddressPicker.vue'
import { Products, OrderSets, Clients } from '@/services/resources'
import { StaffOrders, orderErrorText } from '@/services/orders'
import { mediaUrl } from '@/services/api'
import type { Client, Order, OrderLine, OrderPreview, OrderSet, Product } from '@/services/resources'

type DeliveryMethod = 'courier_now' | 'preorder'
type PaymentMethod = 'cash' | 'card' | 'click' | 'payme' | 'transfer'
type Tab = 'products' | 'sets'

export type Prefill = {
    requestId?: number
    client?: { fullName?: string; phone?: string; address?: string; lat?: number | null; lng?: number | null }
    comment?: string
}

const props = defineProps<{
    prefill?: Prefill | null
    /** Режим редактирования: существующий заказ (с `items.product` и `client`). */
    order?: Order | null
}>()
const emit = defineEmits<{
    (e: 'created', order: Order): void
    (e: 'cancel'): void
}>()

const toast = useToast()
const isEdit = computed(() => !!props.order)

const client = reactive({
    fullName: '',
    phone: '',
    address: '',
    lat: null as number | null,
    lng: null as number | null,
})

const form = reactive({
    paymentMethod: 'transfer' as PaymentMethod,
    deliveryMethod: 'courier_now' as DeliveryMethod,
    deliverySlotAt: null as string | null,
    comment: '',
})

const cart = ref<Record<string, number>>({})

const products = ref<Product[]>([])
const sets = ref<OrderSet[]>([])
const catalogLoading = ref(false)

const tab = ref<Tab>('products')
const activeCat = ref<number | 'all'>('all')
const search = ref('')
const searchEl = ref<HTMLInputElement | null>(null)

type PreviewHint = { missing: number; label: string; benefitType?: 'percent' | 'fixed_amount'; benefitValue?: number }
const preview = ref<(OrderPreview & { hints?: PreviewHint[] }) | null>(null)
const previewing = ref(false)
const saving = ref(false)

const foundClient = ref<(Client & { ordersCount?: number }) | null>(null)
const lookupState = ref<'idle' | 'loading' | 'found' | 'new'>('idle')

const TONES = [
    { bg: '#f4ead6', ink: '#b03628' },
    { bg: '#e7ecd9', ink: '#4a5530' },
    { bg: '#fbefc8', ink: '#7a5a00' },
    { bg: '#f3e1d3', ink: '#8a281e' },
    { bg: '#eee8de', ink: '#5c4a2e' },
]

const norm = (s: string | null | undefined) => (s || '').toLowerCase().replace(/ё/g, 'е')
const q = computed(() => norm(search.value.trim()))

const categories = computed(() => {
    const map = new Map<number, { id: number; name: string; sort: number }>()
    for (const p of products.value) {
        const c = p.category
        if (c && !map.has(c.id)) map.set(c.id, { id: c.id, name: c.name, sort: c.sort ?? 999 })
    }
    return [...map.values()].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, 'ru'))
})

function toneFor(p: Product) {
    const idx = categories.value.findIndex((c) => c.id === p.category?.id)
    return TONES[(idx < 0 ? 0 : idx) % TONES.length]
}

function matchesProduct(p: Product) {
    if (!q.value) return true
    return norm(p.name).includes(q.value) || norm(p.category?.name).includes(q.value)
}

function matchesSet(s: OrderSet) {
    if (!q.value) return true
    if (norm(s.name).includes(q.value)) return true
    return (s.items || []).some((it) => norm(it.product?.name).includes(q.value))
}

const searchedProducts = computed(() => products.value.filter(matchesProduct))

const visibleProducts = computed(() =>
    searchedProducts.value
        .filter((p) => activeCat.value === 'all' || p.category?.id === activeCat.value)
        .sort((a, b) => Number(a.available === false) - Number(b.available === false)),
)

const visibleSets = computed(() => sets.value.filter(matchesSet))

const catChips = computed(() => [
    { id: 'all' as const, name: 'Все', count: searchedProducts.value.length },
    ...categories.value.map((c) => ({
        id: c.id,
        name: c.name,
        count: searchedProducts.value.filter((p) => p.category?.id === c.id).length,
    })),
])

function productPrice(p: Product) { return Math.round(p.pricing?.finalPrice ?? p.price ?? 0) }
function productBase(p: Product)  { return Math.round(p.pricing?.basePrice  ?? p.price ?? 0) }
function setBase(s: OrderSet) {
    if (s.pricing?.basePrice) return Math.round(s.pricing.basePrice)
    return (s.items || []).reduce((sum, it) => sum + (it.product ? productBase(it.product) * (it.qty || 1) : 0), 0)
}
function setPrice(s: OrderSet) { return Math.round(s.pricing?.finalPrice ?? setBase(s)) }
function setComposition(s: OrderSet) {
    return (s.items || [])
        .filter((it) => it.product)
        .map((it) => it.product!.name + ((it.qty || 1) > 1 ? ` ×${it.qty}` : ''))
        .join(' · ')
}

async function loadCatalog() {
    if (products.value.length) return
    catalogLoading.value = true
    try {
        const [ps, ss] = await Promise.all([
            Products.list({ populate: ['category', 'image'], 'pagination[pageSize]': 100 }),
            OrderSets.list({ populate: { items: { populate: ['product'] } } }),
        ])
        products.value = ps
        sets.value = ss
    } catch (e: any) {
        toast.add({ severity: 'error', summary: 'Каталог', detail: e?.message, life: 2500 })
    } finally {
        catalogLoading.value = false
    }
}

function qtyOf(key: string) { return cart.value[key] || 0 }

function bump(key: string, delta: number) {
    const next = { ...cart.value }
    const n = (next[key] || 0) + delta
    if (n <= 0) delete next[key]
    else next[key] = n
    cart.value = next
}

/** Убрать позицию целиком (любое количество) — с возможностью вернуть в течение 6 секунд. */
const lastRemoved = ref<{ key: string; qty: number; name: string } | null>(null)
let undoTimer: number | null = null
function removeLine(key: string, name: string) {
    const qty = cart.value[key] || 0
    if (!qty) return
    const next = { ...cart.value }
    delete next[key]
    cart.value = next
    lastRemoved.value = { key, qty, name }
    if (undoTimer) window.clearTimeout(undoTimer)
    undoTimer = window.setTimeout(() => { lastRemoved.value = null }, 6000)
}
function undoRemove() {
    const r = lastRemoved.value
    if (!r) return
    cart.value = { ...cart.value, [r.key]: (cart.value[r.key] || 0) + r.qty }
    lastRemoved.value = null
    if (undoTimer) window.clearTimeout(undoTimer)
}
onBeforeUnmount(() => { if (undoTimer) window.clearTimeout(undoTimer) })

function addProduct(p: Product) { if (p.available === false) return; bump(`p:${p.id}`, 1) }
function addSet(s: OrderSet)    { bump(`s:${s.id}`, 1) }

const productById = computed(() => new Map(products.value.map((p) => [p.id, p])))
const setById     = computed(() => new Map(sets.value.map((s) => [s.id, s])))

const cartLines = computed(() => {
    const pv = preview.value?.items || []
    const rows: Array<{ key: string; name: string; sub: string; qty: number; total: number; base: number }> = []
    for (const [key, qty] of Object.entries(cart.value)) {
        const [kind, rawId] = key.split(':')
        const id = Number(rawId)
        if (kind === 'p') {
            const p = productById.value.get(id)
            if (!p) continue
            const srv = pv.filter((l: OrderLine) => productIdOf(l) === id && !l.orderSetId)
            const total = srv.length ? sumAfterLine(srv) : productPrice(p) * qty
            const base  = srv.length ? sumBase(srv)       : productBase(p) * qty
            const unit = Math.round(total / qty)
            rows.push({
                key, qty, total, base, name: p.name,
                sub: `${fmt(unit)} × ${qty}` + (base > total ? ` · скидка ${Math.round((1 - total / base) * 100)}%` : ''),
            })
        } else {
            const s = setById.value.get(id)
            if (!s) continue
            const srv = pv.filter((l: OrderLine) => Number(l.orderSetId) === id)
            const total = srv.length ? sumAfterLine(srv) : setPrice(s) * qty
            const base  = srv.length ? sumBase(srv)       : setBase(s)  * qty
            const n = (s.items || []).length
            rows.push({
                key, qty, total, base, name: `Набор «${s.name}»`,
                sub: `${n} ${plural(n, 'позиция', 'позиции', 'позиций')}` + (base > total ? ` · скидка набора ${Math.round((1 - total / base) * 100)}%` : ''),
            })
        }
    }
    return rows
})

function productIdOf(l: OrderLine): number | null {
    const anyL = l as any
    return Number(anyL.productId ?? l.product?.id ?? anyL.product ?? 0) || null
}
function sumAfterLine(ls: OrderLine[]) {
    return ls.reduce((s, l) => s + Number(l.unitPrice ?? l.price ?? 0) * Number(l.qty || 0), 0)
}
function sumBase(ls: OrderLine[]) {
    return ls.reduce((s, l) => s + Number(l.basePrice ?? l.price ?? 0) * Number(l.qty || 0), 0)
}

const itemsCount = computed(() => Object.values(cart.value).reduce((s, n) => s + n, 0))
const cartEmpty  = computed(() => itemsCount.value === 0)

const totals = computed(() => {
    const pv = preview.value
    if (pv && pv.items?.length) {
        let lineDisc = 0, setDisc = 0, orderDisc = 0
        for (const l of pv.items) {
            const qty = Number(l.qty || 0)
            const d = (Number(l.basePrice ?? 0) - Number(l.unitPrice ?? 0)) * qty
            if (l.orderSetId) setDisc += d
            else lineDisc += d
            orderDisc += Number(l.orderDiscountAmount || 0)
        }
        return {
            subtotal: pv.subtotal,
            afterLine: pv.subtotal - lineDisc - setDisc,
            lineDisc, setDisc, orderDisc,
            orderPercent: pv.cartDiscountPercent,
            total: pv.total,
            exact: true,
        }
    }
    const subtotal = cartLines.value.reduce((s, r) => s + r.base, 0)
    const afterLine = cartLines.value.reduce((s, r) => s + r.total, 0)
    return { subtotal, afterLine, lineDisc: 0, setDisc: subtotal - afterLine, orderDisc: 0, orderPercent: null, total: afterLine, exact: false }
})

const discountRows = computed(() => {
    const t = totals.value
    const rows: Array<{ label: string; amount: number }> = []
    if (t.exact) {
        if (t.lineDisc > 0) rows.push({ label: 'Скидки на блюда', amount: t.lineDisc })
        if (t.setDisc  > 0) rows.push({ label: 'Скидки наборов', amount: t.setDisc })
    } else if (t.setDisc > 0) {
        rows.push({ label: 'Скидки', amount: t.setDisc })
    }
    if (t.orderDisc > 0) rows.push({ label: t.orderPercent ? `Скидка на чек ${t.orderPercent}%` : 'Скидка на чек', amount: t.orderDisc })
    return rows
})

/** Все hint-скидки на чек, ближайшая первой. */
const cartTierHints = computed(() => {
    const raw = preview.value?.hints || []
    return [...raw].sort((a, b) => Number(a.missing) - Number(b.missing))
})

/** Применённая order-скидка (есть ли и в каком размере). */
const appliedCartDiscount = computed(() => {
    const t = totals.value
    if (!t.orderDisc || t.orderDisc <= 0) return null
    return { amount: t.orderDisc, percent: t.orderPercent as number | null }
})

function benefitText(h: PreviewHint): string {
    if (h.benefitType === 'percent' && h.benefitValue) return `−${h.benefitValue}%`
    if (h.benefitType === 'fixed_amount' && h.benefitValue) return `−${fmt(h.benefitValue)}`
    return ''
}

const nextTierHint = computed(() => {
    const h = cartTierHints.value[0]
    if (!h || cartEmpty.value) return null
    const current = totals.value.afterLine
    const pct = Math.max(4, Math.min(100, Math.round((current / (current + Number(h.missing))) * 100)))
    const benefit = benefitText(h)
    const text = `Добавьте ещё ${fmt(h.missing)} — скидка ${benefit || h.label}`
    return { text, pct }
})

const hintsOpen = ref(false)

function buildItems() {
    return Object.entries(cart.value).map(([key, qty]) => {
        const [kind, id] = key.split(':')
        return kind === 's'
            ? { type: 'set' as const, orderSetId: Number(id), qty }
            : { type: 'product' as const, productId: Number(id), qty }
    })
}

function buildPayload() {
    return {
        client: {
            fullName: client.fullName.trim() || undefined,
            phone: client.phone.trim(),
            address: client.address.trim() || null,
            lat: client.lat,
            lng: client.lng,
        },
        items: buildItems(),
        paymentMethod: form.paymentMethod,
        deliveryMethod: form.deliveryMethod,
        deliverySlotAt: form.deliveryMethod === 'preorder' ? form.deliverySlotAt : null,
        comment: form.comment.trim() || null,
        address: client.address.trim() || null,
        lat: client.lat,
        lng: client.lng,
    }
}

let previewSeq = 0
async function refreshPreview() {
    if (cartEmpty.value) { preview.value = null; return }
    const seq = ++previewSeq
    previewing.value = true
    try {
        const res = await StaffOrders.preview(buildPayload())
        if (seq === previewSeq) preview.value = res as any
    } catch {
        if (seq === previewSeq) preview.value = null
    } finally {
        if (seq === previewSeq) previewing.value = false
    }
}

let previewTimer: number | null = null
function schedulePreview() {
    if (previewTimer) window.clearTimeout(previewTimer)
    previewTimer = window.setTimeout(refreshPreview, 250)
}
watch([cart, () => form.deliveryMethod, () => form.paymentMethod], schedulePreview, { deep: true })

function normalizedPhone(raw: string) {
    const d = raw.replace(/\D/g, '')
    const local = d.startsWith('998') ? d.slice(3) : d
    return local.length === 9 ? '+998' + local : null
}

let lookupSeq = 0
watch(() => client.phone, async (raw) => {
    const phone = normalizedPhone(raw || '')
    if (!phone) { foundClient.value = null; lookupState.value = 'idle'; return }
    const seq = ++lookupSeq
    lookupState.value = 'loading'
    try {
        const list = await Clients.list({
            filters: { phone: { $eq: phone } },
            populate: { orders: { fields: ['id'] } },
            'pagination[pageSize]': 1,
        })
        if (seq !== lookupSeq) return
        const c = list[0]
        if (c) {
            foundClient.value = { ...c, ordersCount: c.orders?.length ?? 0 }
            lookupState.value = 'found'
            if (!client.fullName.trim()) client.fullName = c.fullName || ''
            if (!client.address.trim() && c.address) {
                client.address = c.address
                client.lat = c.lat ?? null
                client.lng = c.lng ?? null
            }
        } else {
            foundClient.value = null
            lookupState.value = 'new'
        }
    } catch {
        if (seq === lookupSeq) lookupState.value = 'idle'
    }
})

const clientInitials = computed(() =>
    (foundClient.value?.fullName || client.fullName || '?')
        .split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join(''),
)

/** Корзина из сохранённого заказа: товары по количеству, наборы — по числу экземпляров (setInstance). */
function cartFromOrder(o: Order): Record<string, number> {
    const result: Record<string, number> = {}
    const setInstances = new Map<number, Set<string>>()
    for (const l of (o.items || []) as OrderLine[]) {
        const sid = Number(l.orderSetId || 0)
        if (sid) {
            const inst = setInstances.get(sid) || new Set<string>()
            inst.add(String(l.setInstance || `${sid}-1`))
            setInstances.set(sid, inst)
            continue
        }
        const pid = productIdOf(l)
        if (!pid) continue
        result[`p:${pid}`] = (result[`p:${pid}`] || 0) + Number(l.qty || 0)
    }
    for (const [sid, inst] of setInstances) result[`s:${sid}`] = inst.size
    return result
}

onMounted(() => {
    const o = props.order
    if (o) {
        client.fullName = o.client?.fullName || ''
        client.phone    = o.client?.phone || ''
        client.address  = o.address || o.client?.address || ''
        client.lat      = o.lat != null ? Number(o.lat) : null
        client.lng      = o.lng != null ? Number(o.lng) : null
        form.paymentMethod  = (o.paymentMethod as PaymentMethod) || 'cash'
        form.deliveryMethod = (o.deliveryMethod as DeliveryMethod) || 'courier_now'
        form.deliverySlotAt = o.deliverySlotAt ? toLocalInput(o.deliverySlotAt) : null
        form.comment        = o.comment || ''
        cart.value = cartFromOrder(o)
    } else {
        client.fullName = props.prefill?.client?.fullName || ''
        client.phone    = props.prefill?.client?.phone    || ''
        client.address  = props.prefill?.client?.address  || ''
        client.lat      = props.prefill?.client?.lat ?? null
        client.lng      = props.prefill?.client?.lng ?? null
        form.comment    = props.prefill?.comment || ''
    }
    loadCatalog()
    nextTick(() => searchEl.value?.focus())
})

function isTyping(el: EventTarget | null) {
    const t = el as HTMLElement | null
    return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
}

function onKeydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); save(); return }
    if (isTyping(e.target)) return
    if (e.key === '/') { e.preventDefault(); searchEl.value?.focus(); searchEl.value?.select(); return }
    if (/^[1-9]$/.test(e.key) && tab.value === 'products') {
        const chip = catChips.value[Number(e.key) - 1]
        if (chip) activeCat.value = chip.id
    }
}

function onSearchEnter() {
    if (tab.value === 'products') {
        const first = visibleProducts.value.find((p) => p.available !== false)
        if (first) addProduct(first)
    } else {
        const first = visibleSets.value[0]
        if (first) addSet(first)
    }
}

window.addEventListener('keydown', onKeydown)
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

async function save() {
    if (saving.value) return
    if (!normalizedPhone(client.phone)) { toast.add({ severity: 'warn', summary: 'Нужен телефон клиента', life: 2500 }); return }
    if (cartEmpty.value)                 { toast.add({ severity: 'warn', summary: 'Нет позиций в заказе',   life: 2500 }); return }
    if (form.deliveryMethod === 'preorder' && !form.deliverySlotAt) {
        toast.add({ severity: 'warn', summary: 'Выберите время предзаказа', life: 2500 }); return
    }
    saving.value = true
    try {
        const payload = buildPayload()
        if (props.order) {
            const updated = await StaffOrders.edit(props.order.id, payload)
            toast.add({ severity: 'success', summary: `Заказ ${props.order.code} сохранён`, life: 2000 })
            emit('created', updated)
            return
        }
        const order = props.prefill?.requestId
            ? await StaffOrders.convert(props.prefill.requestId, payload)
            : await StaffOrders.createManual(payload)
        toast.add({ severity: 'success', summary: `Заказ ${order.code} создан`, life: 2000 })
        emit('created', order)
    } catch (e: any) {
        const code = e?.response?.data?.error?.message
        if (code === 'REQUEST_ALREADY_CONVERTED') {
            toast.add({ severity: 'warn', summary: 'Заявка уже конвертирована', life: 3000 })
            emit('cancel')
        } else {
            toast.add({ severity: 'error', summary: 'Ошибка', detail: orderErrorText(code) || code || e?.message, life: 3500 })
        }
    } finally {
        saving.value = false
    }
}

/** ISO → значение для <input type="datetime-local"> в локальном времени. */
function toLocalInput(iso: string) {
    const d = new Date(iso)
    if (isNaN(+d)) return null
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fmt(n: number | null | undefined) {
    return new Intl.NumberFormat('ru-RU').format(Math.round(Number(n || 0))) + ' сум'
}
function plural(n: number, one: string, few: string, many: string) {
    const m = n % 10, h = n % 100
    if (m === 1 && h !== 11) return one
    if (m >= 2 && m <= 4 && (h < 10 || h >= 20)) return few
    return many
}

const PAYMENTS: Array<{ id: PaymentMethod; label: string; disabled?: boolean }> = [
    { id: 'transfer', label: 'Перевод' },
    { id: 'cash',     label: 'Наличные', disabled: true },
    { id: 'card',     label: 'Карта',    disabled: true },
    { id: 'click',    label: 'Click',    disabled: true },
    { id: 'payme',    label: 'Payme',    disabled: true },
]

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
const modKey = isMac ? '⌘' : 'Ctrl'
</script>

<template>
    <div class="flex flex-col bg-ink-50 font-sans text-ink-900">
        <!-- Шапка -->
        <header class="flex flex-wrap items-center gap-4 px-6 py-4 bg-white border-b border-ink-100">
            <button type="button" aria-label="Назад"
                    class="w-11 h-11 rounded-xl border border-ink-100 flex items-center justify-center hover:bg-ink-50 transition"
                    @click="emit('cancel')">
                <i class="pi pi-arrow-left text-sm"></i>
            </button>
            <div class="flex flex-col">
                <h2 class="m-0 font-display font-extrabold text-xl tracking-tight">
                    {{ order ? `Редактирование ${order.code}` : prefill?.requestId ? 'Заказ из заявки' : 'Новый заказ' }}
                </h2>
                <span class="text-xs text-ink-400">
                    {{ order ? 'Цены и скидки пересчитаются по действующим сейчас' : prefill?.requestId ? `Заявка #${prefill.requestId}` : 'Ручное создание' }}
                </span>
            </div>
            <div class="flex-1"></div>
            <span v-if="previewing" class="text-xs text-ink-400 flex items-center gap-2">
                <i class="pi pi-spin pi-spinner text-xs"></i> Пересчёт…
            </span>
        </header>

        <div class="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_420px]">
            <!-- ───────── Каталог ───────── -->
            <section aria-label="Каталог" class="px-6 py-5 flex flex-col gap-4">
                <div class="flex flex-wrap items-center gap-3">
                    <label class="flex-1 min-w-[260px] flex items-center gap-2.5 h-[52px] px-4 bg-white rounded-2xl border-[1.5px] border-ink-200 focus-within:border-ink-900 focus-within:shadow-[0_0_0_4px_rgba(209,72,54,.10)] transition">
                        <i class="pi pi-search text-ink-500"></i>
                        <span class="sr-only">Поиск по меню</span>
                        <input ref="searchEl" v-model="search" placeholder="Найти блюдо или набор…"
                               class="flex-1 min-w-0 border-0 outline-none bg-transparent text-base"
                               @keydown.enter.prevent="onSearchEnter"
                               @keydown.esc.stop="search = ''" />
                        <button v-if="search" type="button" aria-label="Очистить поиск"
                                class="w-7 h-7 rounded-full hover:bg-ink-100 flex items-center justify-center"
                                @click="search = ''; searchEl?.focus()">
                            <i class="pi pi-times text-xs text-ink-500"></i>
                        </button>
                        <kbd v-else class="text-xs text-ink-500 bg-ink-50 border border-ink-200 rounded-md px-1.5 py-0.5">/</kbd>
                    </label>
                    <div role="tablist" aria-label="Что показывать" class="flex gap-1 p-1 bg-white border border-ink-100 rounded-2xl">
                        <button v-for="t in ([['products', 'Блюда', searchedProducts.length], ['sets', 'Наборы', visibleSets.length]] as const)"
                                :key="t[0]" type="button" role="tab" :aria-selected="tab === t[0]"
                                class="h-11 px-4 rounded-xl text-sm font-semibold transition"
                                :class="tab === t[0] ? 'bg-ink-900 text-white' : 'text-ink-500 hover:bg-ink-50'"
                                @click="tab = t[0]">
                            {{ t[1] }} <span class="font-medium opacity-75">{{ t[2] }}</span>
                        </button>
                    </div>
                </div>

                <div v-if="tab === 'products'" aria-label="Категории" class="flex flex-wrap gap-2">
                    <button v-for="c in catChips" :key="c.id" type="button"
                            class="h-10 px-3.5 rounded-full text-sm font-semibold flex items-center gap-2 border transition"
                            :class="activeCat === c.id ? 'bg-tomato-500 border-tomato-500 text-white' : 'bg-white border-ink-200 text-ink-700 hover:border-ink-400'"
                            @click="activeCat = c.id">
                        {{ c.name }}
                        <span class="text-xs font-semibold px-1.5 py-px rounded-full"
                              :class="activeCat === c.id ? 'bg-white/20 text-white' : 'bg-ink-100 text-ink-500'">{{ c.count }}</span>
                    </button>
                </div>

                <div v-if="catalogLoading" class="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
                    <div v-for="i in 8" :key="i" class="h-[236px] rounded-2xl bg-white border border-ink-100 animate-pulse"></div>
                </div>

                <!-- Блюда -->
                <div v-else-if="tab === 'products' && visibleProducts.length"
                     class="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
                    <article v-for="p in visibleProducts" :key="p.id"
                             class="relative flex flex-col min-h-[236px] bg-white rounded-2xl overflow-hidden transition"
                             :class="[
                                 qtyOf(`p:${p.id}`) ? 'ring-2 ring-tomato-500' : 'border border-ink-100 hover:border-ink-200',
                                 p.available === false ? 'opacity-55' : '',
                             ]">
                        <div class="relative h-24 flex items-center justify-center" :style="{ background: toneFor(p).bg }">
                            <img v-if="p.image?.url" :src="mediaUrl(p.image.url)" :alt="p.name" class="absolute inset-0 w-full h-full object-cover" loading="lazy" />
                            <svg v-else width="34" height="34" viewBox="0 0 24 24" fill="none" :stroke="toneFor(p).ink" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                <path d="M3 11h18a9 9 0 0 1-18 0Z" /><path d="M8 7.5c0-1 1-1.2 1-2.5M12 7.5c0-1 1-1.2 1-2.5M16 7.5c0-1 1-1.2 1-2.5" />
                            </svg>
                            <span v-if="p.available === false"
                                  class="absolute top-2.5 left-2.5 bg-ink-500 text-white text-xs font-semibold px-2 py-0.5 rounded-full">Нет в наличии</span>
                            <span v-else-if="productBase(p) > productPrice(p)"
                                  class="absolute top-2.5 left-2.5 bg-tomato-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                                −{{ Math.round((1 - productPrice(p) / productBase(p)) * 100) }}%
                            </span>
                        </div>
                        <div class="flex flex-col gap-0.5 px-3.5 pt-3">
                            <h3 class="m-0 font-sans text-[15px] font-semibold leading-snug">{{ p.name }}</h3>
                            <span class="text-xs text-ink-400">{{ [p.category?.name, p.weight ? `${p.weight} г` : null].filter(Boolean).join(' · ') }}</span>
                        </div>
                        <div class="flex items-center justify-between gap-2 pl-3.5 pr-2.5 py-2.5 mt-auto">
                            <div class="flex flex-col">
                                <span class="text-[15px] font-bold">{{ fmt(productPrice(p)) }}</span>
                                <span v-if="productBase(p) > productPrice(p)" class="text-xs text-ink-400 line-through">{{ fmt(productBase(p)) }}</span>
                            </div>
                            <button v-if="!qtyOf(`p:${p.id}`) && p.available !== false" type="button"
                                    :aria-label="`Добавить ${p.name}`"
                                    class="w-11 h-11 rounded-xl bg-ink-900 text-white flex items-center justify-center hover:bg-ink-700 active:scale-95 transition"
                                    @click="addProduct(p)">
                                <i class="pi pi-plus text-sm"></i>
                            </button>
                            <div v-else-if="qtyOf(`p:${p.id}`)" class="flex items-center bg-tomato-500 rounded-xl text-white">
                                <button type="button" aria-label="Убрать одну" class="w-10 h-11 text-xl font-semibold" @click="bump(`p:${p.id}`, -1)">−</button>
                                <span class="min-w-5 text-center font-bold text-[15px]">{{ qtyOf(`p:${p.id}`) }}</span>
                                <button type="button" aria-label="Добавить ещё" class="w-10 h-11 text-xl font-semibold" @click="bump(`p:${p.id}`, 1)">+</button>
                            </div>
                        </div>
                    </article>
                </div>

                <!-- Наборы -->
                <div v-else-if="tab === 'sets' && visibleSets.length"
                     class="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">
                    <article v-for="s in visibleSets" :key="s.id"
                             class="flex flex-col gap-3 min-h-[180px] p-[18px] bg-white rounded-2xl transition"
                             :class="qtyOf(`s:${s.id}`) ? 'ring-2 ring-tomato-500' : 'border border-ink-100 hover:border-ink-200'">
                        <div class="flex items-start justify-between gap-3">
                            <div class="flex flex-col gap-1">
                                <span class="text-xs font-bold tracking-wider uppercase text-olive-500">Набор</span>
                                <h3 class="m-0 font-display text-lg font-bold">{{ s.name }}</h3>
                            </div>
                            <span v-if="setBase(s) > setPrice(s)" class="bg-tomato-600 text-white text-xs font-bold px-2.5 py-1 rounded-full">
                                −{{ Math.round((1 - setPrice(s) / setBase(s)) * 100) }}%
                            </span>
                        </div>
                        <p class="m-0 text-[13px] leading-relaxed text-ink-500">{{ setComposition(s) }}</p>
                        <div class="flex items-center justify-between gap-2 mt-auto">
                            <div class="flex items-baseline gap-2">
                                <span class="text-[17px] font-bold">{{ fmt(setPrice(s)) }}</span>
                                <span v-if="setBase(s) > setPrice(s)" class="text-[13px] text-ink-400 line-through">{{ fmt(setBase(s)) }}</span>
                            </div>
                            <button v-if="!qtyOf(`s:${s.id}`)" type="button"
                                    class="h-11 px-4 rounded-xl bg-ink-900 text-white text-sm font-semibold hover:bg-ink-700 active:scale-95 transition"
                                    @click="addSet(s)">Добавить</button>
                            <div v-else class="flex items-center bg-tomato-500 rounded-xl text-white">
                                <button type="button" aria-label="Убрать один набор" class="w-10 h-11 text-xl font-semibold" @click="bump(`s:${s.id}`, -1)">−</button>
                                <span class="min-w-5 text-center font-bold">{{ qtyOf(`s:${s.id}`) }}</span>
                                <button type="button" aria-label="Добавить ещё набор" class="w-10 h-11 text-xl font-semibold" @click="bump(`s:${s.id}`, 1)">+</button>
                            </div>
                        </div>
                    </article>
                </div>

                <div v-else class="py-12 px-6 text-center bg-white border border-dashed border-ink-200 rounded-2xl text-ink-500">
                    <template v-if="search">Ничего не нашлось по запросу «{{ search }}». Попробуйте другое слово или другую вкладку.</template>
                    <template v-else>{{ tab === 'sets' ? 'Наборов пока нет' : 'В этой категории пусто' }}</template>
                </div>

                <div class="hidden md:flex flex-wrap gap-4 text-xs text-ink-400 pt-1">
                    <span><kbd class="kbd">/</kbd> поиск</span>
                    <span><kbd class="kbd">↵</kbd> добавить первое найденное</span>
                    <span><kbd class="kbd">1–9</kbd> категория</span>
                    <span><kbd class="kbd">{{ modKey }} ↵</kbd> создать заказ</span>
                </div>
            </section>

            <!-- ───────── Заказ ───────── -->
            <aside aria-label="Заказ" class="flex flex-col border-t lg:border-t-0 lg:border-l border-ink-100 bg-ink-50">
                <div class="px-5 py-5 flex flex-col gap-3.5">

                    <!-- Клиент -->
                    <section class="bg-white border border-ink-100 rounded-2xl p-4 flex flex-col gap-3">
                        <h3 class="m-0 font-display text-[15px] font-bold">Клиент</h3>
                        <label class="flex flex-col gap-1.5 text-xs font-semibold text-ink-500">Телефон
                            <PhoneInput v-model="client.phone"
                                        input-class="h-[46px] w-full px-3.5 rounded-xl border border-ink-200 text-base font-medium text-ink-900 focus:outline-none focus:border-ink-900" />
                        </label>
                        <div v-if="lookupState === 'found' && foundClient"
                             class="flex items-center gap-2.5 px-3 py-2.5 bg-[#f1f3ea] rounded-xl">
                            <span class="w-[34px] h-[34px] rounded-full bg-olive-500 text-white flex items-center justify-center text-[13px] font-bold">{{ clientInitials }}</span>
                            <div class="flex flex-col min-w-0 flex-1">
                                <span class="text-sm font-semibold truncate">{{ foundClient.fullName || 'Без имени' }}</span>
                                <span class="text-xs text-[#4a5530]">
                                    {{ foundClient.ordersCount ? `${foundClient.ordersCount} ${plural(foundClient.ordersCount, 'заказ', 'заказа', 'заказов')}` : 'Заказов ещё не было' }}
                                </span>
                            </div>
                        </div>
                        <div v-else-if="lookupState === 'new'" class="text-xs text-ink-500 flex items-center gap-1.5">
                            <i class="pi pi-user-plus text-xs"></i> Новый клиент — будет создан вместе с заказом
                        </div>
                        <label class="flex flex-col gap-1.5 text-xs font-semibold text-ink-500">Имя
                            <input v-model="client.fullName" placeholder="Как обращаться"
                                   class="h-[46px] px-3.5 rounded-xl border border-ink-200 text-[15px] text-ink-900 focus:outline-none focus:border-ink-900" />
                        </label>
                        <AddressPicker v-model="client.address"
                                       v-model:lat="client.lat"
                                       v-model:lng="client.lng"
                                       label="Адрес доставки"
                                       placeholder="Улица, дом, квартира" />
                        <div class="grid grid-cols-2 gap-1.5 p-1 bg-ink-50 rounded-xl">
                            <button v-for="d in ([['courier_now', 'Курьер сейчас'], ['preorder', 'Предзаказ']] as const)" :key="d[0]"
                                    type="button" :aria-pressed="form.deliveryMethod === d[0]"
                                    class="h-10 rounded-[9px] text-sm font-semibold transition"
                                    :class="form.deliveryMethod === d[0] ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500'"
                                    @click="form.deliveryMethod = d[0]">{{ d[1] }}</button>
                        </div>
                        <input v-if="form.deliveryMethod === 'preorder'" v-model="form.deliverySlotAt" type="datetime-local"
                               aria-label="Время предзаказа"
                               class="h-[46px] px-3.5 rounded-xl border border-ink-200 text-[15px] focus:outline-none focus:border-ink-900" />
                    </section>

                    <!-- Состав -->
                    <section class="bg-white border border-ink-100 rounded-2xl p-4 flex flex-col">
                        <div class="flex items-baseline justify-between pb-2">
                            <h3 class="m-0 font-display text-[15px] font-bold">Состав заказа</h3>
                            <span class="text-[13px] text-ink-400">{{ itemsCount }} {{ plural(itemsCount, 'позиция', 'позиции', 'позиций') }}</span>
                        </div>
                        <div v-if="cartEmpty" class="py-7 px-3 text-center text-ink-400 text-sm border border-dashed border-ink-200 rounded-xl">
                            Добавьте блюда из каталога слева
                        </div>
                        <div v-for="l in cartLines" :key="l.key" class="flex items-center gap-2.5 py-2.5 border-t border-ink-100 first:border-t-0">
                            <div class="flex flex-col flex-1 min-w-0 gap-0.5">
                                <span class="text-sm font-semibold truncate">{{ l.name }}</span>
                                <span class="text-xs text-ink-400">{{ l.sub }}</span>
                            </div>
                            <div class="flex items-center border border-ink-200 rounded-[10px]">
                                <button type="button" :aria-label="`Меньше: ${l.name}`" class="w-8 h-9 text-[17px]" @click="bump(l.key, -1)">−</button>
                                <span class="min-w-[18px] text-center text-sm font-semibold">{{ l.qty }}</span>
                                <button type="button" :aria-label="`Больше: ${l.name}`" class="w-8 h-9 text-[17px]" @click="bump(l.key, 1)">+</button>
                            </div>
                            <div class="flex flex-col items-end min-w-[92px]">
                                <span class="text-sm font-bold">{{ fmt(l.total) }}</span>
                                <span v-if="l.base > l.total" class="text-xs text-ink-400 line-through">{{ fmt(l.base) }}</span>
                            </div>
                            <button type="button" :aria-label="`Убрать из заказа: ${l.name}`" title="Убрать из заказа"
                                    class="w-8 h-8 -mr-1 rounded-lg flex items-center justify-center text-ink-400 hover:text-tomato-600 hover:bg-tomato-500/10 transition"
                                    @click="removeLine(l.key, l.name)">
                                <i class="pi pi-times text-xs"></i>
                            </button>
                        </div>
                        <div v-if="lastRemoved"
                             class="flex items-center gap-2 mt-2 px-3 py-2 rounded-xl bg-ink-50 text-[13px] text-ink-700">
                            <i class="pi pi-trash text-xs text-ink-400"></i>
                            <span class="flex-1 min-w-0 truncate">Убрано: {{ lastRemoved.name }} × {{ lastRemoved.qty }}</span>
                            <button type="button" class="font-semibold text-tomato-600 hover:underline" @click="undoRemove">Вернуть</button>
                        </div>
                        <div v-if="appliedCartDiscount || nextTierHint || cartTierHints.length"
                             class="flex flex-col gap-2 mt-2 p-3 bg-[#fdf6e3] rounded-xl">
                            <!-- 1) Уже применённая скидка на чек -->
                            <div v-if="appliedCartDiscount" class="flex items-center gap-2 text-[13px] font-semibold text-olive-500">
                                <i class="pi pi-check-circle text-[13px]"></i>
                                <span>
                                    Скидка на чек применена<template v-if="appliedCartDiscount.percent">: −{{ appliedCartDiscount.percent }}%</template>
                                    · −{{ fmt(appliedCartDiscount.amount) }}
                                </span>
                            </div>

                            <!-- 2) Следующий уровень (если есть) -->
                            <template v-if="nextTierHint">
                                <span class="text-[13px] text-[#5a4500]">{{ nextTierHint.text }}</span>
                                <div class="h-1.5 bg-[#f1e3b3] rounded-full overflow-hidden">
                                    <div class="h-full bg-saffron-300 rounded-full transition-all" :style="{ width: nextTierHint.pct + '%' }"></div>
                                </div>
                            </template>

                            <!-- 3) Все скидки на чек (раскрывашка) -->
                            <button v-if="cartTierHints.length"
                                    type="button"
                                    class="self-start text-[12px] font-semibold text-[#5a4500] underline underline-offset-2 hover:text-tomato-600"
                                    @click="hintsOpen = !hintsOpen">
                                {{ hintsOpen ? 'Скрыть список' : 'Все скидки на чек' }}
                                <i :class="['pi text-[10px] ml-1', hintsOpen ? 'pi-chevron-up' : 'pi-chevron-down']"></i>
                            </button>
                            <ul v-if="hintsOpen && cartTierHints.length"
                                class="list-none m-0 p-0 border-t border-[#f1e3b3] pt-2 space-y-1">
                                <li v-for="(h, idx) in cartTierHints" :key="idx"
                                    class="flex items-baseline justify-between gap-3 text-[12px] text-[#5a4500]">
                                    <span class="truncate">
                                        <template v-if="benefitText(h)">{{ benefitText(h) }} · </template>{{ h.label }}
                                    </span>
                                    <span class="whitespace-nowrap font-semibold">+ {{ fmt(h.missing) }}</span>
                                </li>
                            </ul>
                        </div>
                    </section>

                    <!-- Оплата -->
                    <section class="bg-white border border-ink-100 rounded-2xl p-4 flex flex-col gap-3">
                        <h3 class="m-0 font-display text-[15px] font-bold">Оплата</h3>
                        <div class="flex flex-wrap gap-1.5">
                            <button v-for="m in PAYMENTS" :key="m.id" type="button"
                                    :aria-pressed="form.paymentMethod === m.id"
                                    :disabled="m.disabled"
                                    :title="m.disabled ? 'Пока недоступно — только Перевод' : undefined"
                                    class="h-11 px-3.5 rounded-xl text-sm font-semibold border transition"
                                    :class="form.paymentMethod === m.id
                                        ? 'bg-ink-900 border-ink-900 text-white'
                                        : m.disabled
                                            ? 'bg-ink-50 border-ink-100 text-ink-300 cursor-not-allowed'
                                            : 'bg-white border-ink-200 text-ink-700 hover:border-ink-400'"
                                    @click="!m.disabled && (form.paymentMethod = m.id)">{{ m.label }}</button>
                        </div>
                        <textarea v-model="form.comment" rows="2" placeholder="Комментарий для кухни или курьера"
                                  class="px-3 py-2.5 rounded-xl border border-ink-200 text-sm resize-y focus:outline-none focus:border-ink-900"></textarea>
                    </section>
                </div>

                <!-- Итоги + кнопка -->
                <div class="px-5 py-4 bg-white border-t border-ink-100 flex flex-col gap-1.5 text-sm">
                    <div class="flex justify-between"><span class="text-ink-500">Подытог</span><span>{{ fmt(totals.subtotal) }}</span></div>
                    <div v-for="r in discountRows" :key="r.label" class="flex justify-between">
                        <span class="text-ink-500">{{ r.label }}</span>
                        <span class="text-tomato-600 font-semibold">−{{ fmt(r.amount) }}</span>
                    </div>
                    <div class="flex justify-between items-baseline pt-1.5">
                        <span class="font-display text-base font-bold">Итого</span>
                        <span class="font-display text-[26px] font-extrabold tracking-tight" :class="totals.exact ? '' : 'text-ink-400'">{{ fmt(totals.total) }}</span>
                    </div>
                    <button type="button" :disabled="saving || cartEmpty"
                            class="mt-2 h-14 rounded-2xl bg-tomato-500 hover:bg-tomato-600 disabled:opacity-50 disabled:hover:bg-tomato-500 text-white text-base font-bold flex items-center justify-center gap-2.5 shadow-[0_6px_16px_rgba(209,72,54,.28)] transition"
                            @click="save">
                        <i v-if="saving" class="pi pi-spin pi-spinner"></i>
                        {{ saving ? (isEdit ? 'Сохраняем…' : 'Создаём…') : `${isEdit ? 'Сохранить изменения' : 'Создать заказ'} · ${fmt(totals.total)}` }}
                        <kbd v-if="!saving" class="text-xs font-semibold bg-white/20 rounded-md px-1.5 py-0.5">{{ modKey }} ↵</kbd>
                    </button>
                </div>
            </aside>
        </div>
    </div>
</template>

<style scoped>
.kbd {
    font-family: inherit;
    background: #fff;
    border: 1px solid var(--color-ink-200);
    border-radius: 5px;
    padding: 1px 6px;
    color: var(--color-ink-700);
}
</style>
