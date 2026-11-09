<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppTopbar from '@/components/AppTopbar.vue'
import { Orders, type Order, type OrderStatus } from '@/services/resources'
import Paginator from 'primevue/paginator'
import SelectButton from 'primevue/selectbutton'
import ToggleSwitch from 'primevue/toggleswitch'
import Button from 'primevue/button'
import PeriodPicker from '@/components/PeriodPicker.vue'
import InputText from 'primevue/inputtext'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import FloatLabel from 'primevue/floatlabel'
import { useToast } from 'primevue/usetoast'
import AcceptPaymentDialog from './components/AcceptPaymentDialog.vue'
import RefundDialog from './components/RefundDialog.vue'
import OrderPanel from './components/OrderPanel.vue'
import CancelOrderDialog from './components/CancelOrderDialog.vue'
import { Transactions as TransactionsAPI } from '@/services/transactions'
import { api, qs } from '@/services/api'
import type { Transaction } from '@/services/resources'
import { useAuth } from '@/stores/auth'
import { useOrdersFeed } from '@/stores/ordersFeed'
import { STATUS_LABEL, isOrderPaid } from '@/utils/orderFlow'
import { PAGINATOR_TEMPLATE, PAGINATOR_REPORT, PAGE_SIZE_OPTIONS, DEFAULT_PAGE_SIZE as PAGE_SIZE } from '@/utils/paginator'

const list = ref<Order[]>([])
const loading = ref(true)
const toast = useToast()
const search = ref('')
const paidFilter = ref<'all' | 'unpaid'>('all')
const open = ref<Order | null>(null)
const payOpen = ref(false)
const refundOpen = ref(false)
const openTxns = ref<Transaction[]>([])
const auth = useAuth()
const feed = useOrdersFeed()
const route = useRoute()
const router = useRouter()

/** Для списка — плоский populate (без events); для открытого заказа — всё включая events. */
const POPULATE_LIST = ['items', 'client', 'employee', 'request', 'transactions'] as const
const POPULATE_ONE = ['items', 'client', 'employee', 'request', 'transactions', 'events'] as const

/** Подсветка строк: id → метка времени (мс). */
const flash = ref<Map<number, number>>(new Map())
/** Плашки над таблицей. */
const notInFilter = ref(0)
const newWhileScrolled = ref(0)
const paginatorFirst = ref(0)
/** Банер в боковой панели. */
const panelBanner = ref<{ text: string } | null>(null)

const pendingIds = new Set<number>()
let batchTimer: number | null = null

/** Диалог отмены с полем причины. */
const cancelDialog = ref<{ order: Order | null; reason: string }>({ order: null, reason: '' })

const dialogOpen = computed(() =>
    payOpen.value || refundOpen.value || !!cancelDialog.value.order,
)

async function copyOrderCode(code: string) {
    if (!code) return
    try { await navigator.clipboard.writeText(code) } catch { /* noop */ }
    toast.add({ severity: 'success', summary: 'Номер скопирован', detail: code, life: 1200 })
}

/** Собрать серверные фильтры Strapi 5 из текущего состояния UI. */
function buildServerFilters(): Record<string, any> {
    const f: Record<string, any> = {}
    const s = search.value.trim()
    if (s) {
        f.$or = [
            { code: { $containsi: s } },
            { client: { fullName: { $containsi: s } } },
            { client: { phone: { $containsi: s } } },
        ]
    }
    const r = periodRange.value
    if (r) {
        f.createdAt = { $gte: r[0].toISOString(), $lte: r[1].toISOString() }
    }
    const k = statusFilterKey.value
    if (k === 'new')   { f.status = 'new'; f.employee = { id: { $null: true } } }
    else if (k === 'taken') { f.status = 'new'; f.employee = { id: { $notNull: true } } }
    else if (k !== ALL) f.status = k
    if (paidFilter.value === 'unpaid') {
        f.paymentStatus = { $notIn: ['paid', 'overpaid'] }
        if (!f.status) f.status = { $not: 'canceled' }
    }
    return f
}

async function reload() {
    loading.value = true
    try {
        const url = '/orders' + qs({
            sort: 'createdAt:desc',
            populate: POPULATE_LIST as unknown as string[],
            filters: buildServerFilters(),
            'pagination[page]': timelinePage.value + 1,
            'pagination[pageSize]': timelineRows.value,
            'pagination[withCount]': true,
        })
        const res = await api.get(url)
        list.value = (res.data?.data ?? []) as Order[]
        totalRecords.value = res.data?.meta?.pagination?.total ?? list.value.length
    } catch (e: any) {
        toast.add({ severity: 'error', summary: 'Не удалось загрузить', detail: e?.message, life: 3000 })
    } finally {
        loading.value = false
    }
}

/** Догрузить заказ(ы) по id → upsert/replace в `list`. */
async function reloadIds(ids: number[]) {
    if (!ids.length) return
    try {
        // Для открытого заказа догружаем с глубоким populate (включая events.actor),
        // чтобы блок «История» в панели был полным.
        const includesOpen = open.value && ids.includes(open.value.id)
        const rows = await Orders.list({
            filters: { id: { $in: ids } },
            populate: (includesOpen ? POPULATE_ONE : POPULATE_LIST) as unknown as string[],
        })
        const byId = new Map(rows.map((r) => [r.id, r]))
        for (const id of ids) {
            const next = byId.get(id)
            const idx = list.value.findIndex((o) => o.id === id)
            if (!next) {
                if (idx >= 0) list.value.splice(idx, 1)
                continue
            }
            if (idx >= 0) {
                list.value.splice(idx, 1, next)
            } else {
                list.value.unshift(next)
                if (paginatorFirst.value > 0) newWhileScrolled.value += 1
                flash.value.set(id, Date.now())
                setTimeout(() => { flash.value.delete(id); flash.value = new Map(flash.value) }, 4000)
            }
            // Если открыта панель этого заказа — обновляем её.
            if (open.value?.id === id && !dialogOpen.value) {
                open.value = next
            }
        }
    } catch { /* noop */ }
}

function queueId(id: number) {
    pendingIds.add(id)
    if (batchTimer != null) return
    batchTimer = window.setTimeout(() => {
        batchTimer = null
        const ids = Array.from(pendingIds).slice(0, 50)
        pendingIds.clear()
        reloadIds(ids)
    }, 300)
}

/** Загрузить один заказ с глубоким populate (включая events.actor). */
async function fetchOneDeep(id: number): Promise<Order | null> {
    try {
        const rows = await Orders.list({
            filters: { id: { $in: [id] } },
            populate: POPULATE_ONE as unknown as string[],
        })
        return rows[0] ?? null
    } catch { return null }
}

async function openById(openId: number) {
    if (!openId) return
    if (open.value?.id === openId) return
    // Сначала пробуем из уже загруженного списка — моментально.
    const existing = list.value.find((o) => o.id === openId)
    if (existing) {
        open.value = existing
    }
    // Догружаем с глубоким populate (включая events).
    const row = await fetchOneDeep(openId)
    if (!row) return
    const idx = list.value.findIndex((o) => o.id === openId)
    if (idx >= 0) list.value.splice(idx, 1, row)
    else list.value.unshift(row)
    open.value = row
    const rowIdx = rows.value.findIndex((o) => o.id === openId)
    if (rowIdx >= 0) paginatorFirst.value = Math.floor(rowIdx / PAGE_SIZE) * PAGE_SIZE
}

onMounted(async () => {
    await reload()
    await openById(Number(route.query.open))
})

watch(() => route.query.open, (v) => {
    const id = Number(v)
    if (id) openById(id)
    else open.value = null
})

async function changeStatus(o: Order, status: OrderStatus, extra: Record<string, any> = {}) {
    try {
        await Orders.update(o.documentId, { status, ...extra } as any)
        toast.add({ severity: 'success', summary: 'Статус обновлён', life: 1500 })
        // Догружаем именно этот заказ, панель остаётся открытой.
        const fresh = await fetchOneDeep(o.id)
        if (fresh) {
            const idx = list.value.findIndex((x) => x.id === fresh.id)
            if (idx >= 0) list.value.splice(idx, 1, fresh)
            if (open.value?.id === fresh.id) open.value = fresh
        }
    } catch (e: any) {
        toast.add({ severity: 'error', summary: 'Ошибка', detail: e?.response?.data?.error?.message || e?.message, life: 3000 })
    }
}

/** «Клиент подтвердил» — new → accepted + note в историю. */
async function confirmByCall(note: string) {
    if (!open.value) return
    await changeStatus(open.value, 'accepted', { statusNote: note || undefined })
}

/** Открыть диалог отмены для заказа. */
function askCancel(o: Order) {
    cancelDialog.value = { order: o, reason: o.cancelReason || '' }
}
/** Заказ отменён (диалог уже сходил на сервер) — обновить строку и панель. */
async function onCanceled(o: Order) {
    cancelDialog.value = { order: null, reason: '' }
    const fresh = await fetchOneDeep(o.id)
    if (fresh) {
        const idx = list.value.findIndex((x) => x.id === fresh.id)
        if (idx >= 0) list.value.splice(idx, 1, fresh)
        if (open.value?.id === fresh.id) open.value = fresh
    }
    await loadOpenTxns()
}

type StatusChip = { key: 'new' | 'taken' | OrderStatus; label: string }
const ALL = 'all' as const
type StatusKey = StatusChip['key']
const statusOptions: Array<{ value: typeof ALL | StatusKey; label: string }> = [
    { value: ALL,          label: 'Все' },
    { value: 'new',        label: 'Новый' },
    { value: 'taken',      label: 'Взят' },
    { value: 'accepted',   label: STATUS_LABEL.accepted },
    { value: 'in_progress', label: STATUS_LABEL.in_progress },
    { value: 'done',       label: STATUS_LABEL.done },
    { value: 'canceled',   label: STATUS_LABEL.canceled },
]
const statusFilterKey = ref<typeof ALL | StatusKey>(ALL)


/** Период — тот же PeriodPicker, что в фильтре транзакций. null = все заказы. */
const periodRange = ref<[Date, Date] | null>(null)

/** Серверная пагинация. */
const timelinePage = ref(0)              // 0-based (PrimeVue Paginator)
const timelineRows = ref(PAGE_SIZE)
const totalRecords = ref(0)

/** Для шаблона (сайдбар/плашки) — «отобранные» = то, что в текущей странице списка. */
const rows = computed(() => list.value)

/** Группировка по дате (YYYY-MM-DD) — строки берутся напрямую из `list` (серверная выдача). */
const groupedDays = computed(() => {
    const map = new Map<string, { key: string; label: string; total: number; count: number; items: Order[] }>()
    for (const o of list.value) {
        const d = new Date(o.createdAt)
        const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
        const label = d.toLocaleDateString('ru-RU')
        const g = map.get(key) || { key, label, total: 0, count: 0, items: [] as Order[] }
        g.items.push(o)
        g.count += 1
        if (o.status !== 'canceled') g.total += Number(o.total || 0)
        map.set(key, g)
    }
    return [...map.values()]
})

function orderItemsQty(o: Order): number {
    return (o.items || []).reduce((s, it: any) => s + Number(it?.qty || 0), 0)
}
function orderTime(iso: string): string {
    return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}


/** Этап для мини-прогресса в таблице: 1..6 (6-й — «Завершён», 5-й — «Оплачен»). */
function stageIndex(o: Order): number {
    if (o.status === 'canceled') return -1
    if (o.status === 'done') return isOrderPaid(o) ? 6 : 5
    if (o.status === 'in_progress') return isOrderPaid(o) ? 5 : 4
    if (o.status === 'accepted') return 3
    if (o.status === 'new' && o.employee) return 2
    return 1
}
function tableStageLabel(o: Order): string {
    if (o.status === 'canceled') return STATUS_LABEL.canceled
    if (o.status === 'new' && o.employee) return 'Взят'
    if (o.status === 'new') return 'Новый'
    return STATUS_LABEL[o.status]
}
function rowClass(o: Order): string {
    const classes = ['cursor-pointer']
    if (flash.value.has(o.id)) classes.push('order-flash')
    if (open.value && open.value.id === o.id) classes.push('order-row-open')
    return classes.join(' ')
}
function dotClass(o: Order, n: number): string {
    const idx = stageIndex(o)
    if (idx < 0) return 'bg-tomato-500/70'      // canceled — красные точки
    if (n < idx) return 'bg-olive-500'           // пройденные
    if (n === idx) return 'bg-olive-500 ring-2 ring-olive-500/30'
    return 'bg-ink-200'
}

function tableStagePill(o: Order): string {
    if (o.status === 'canceled') return 'bg-tomato-500/15 text-tomato-500'
    if (o.status === 'new' && !o.employee) return 'bg-saffron-300/25 text-saffron-500'
    if (o.status === 'new') return 'bg-primary-100 text-primary-600'
    if (o.status === 'accepted') return 'bg-primary-100 text-primary-600'
    if (o.status === 'in_progress') return 'bg-olive-500/15 text-olive-500'
    return 'bg-olive-500/15 text-olive-500'
}

async function loadOpenTxns() {
    if (!open.value) { openTxns.value = []; return }
    try {
        const res = await TransactionsAPI.list({ pageSize: 100 })
        openTxns.value = res.data.filter((t) => t.order?.id === open.value!.id)
    } catch {
        openTxns.value = []
    }
}

const paymentLabel: Record<string, string> = {
    unpaid:   'Не оплачен',
    partial:  'Частично',
    paid:     'Оплачен',
    overpaid: 'Переплата',
    refunded: 'Возвращён',
}
const paymentColor: Record<string, string> = {
    unpaid:   'bg-tomato-500/15 text-tomato-500',
    partial:  'bg-saffron-300/40 text-ink-900',
    paid:     'bg-olive-500/15 text-olive-500',
    overpaid: 'bg-saffron-300/40 text-ink-900',
    refunded: 'bg-ink-100 text-ink-500',
}

async function takeOrder(o: Order) {
    try {
        const res = await api.post(`/staff/orders/${o.id}/take`, {})
        const updated = (res.data?.data || null) as Order | null
        toast.add({ severity: 'success', summary: 'Заказ взят в работу', life: 1800 })
        await reload()
        if (updated) {
            open.value = list.value.find((x) => x.id === updated.id) || updated
        }
    } catch (e: any) {
        const code = e?.response?.data?.error?.message
        if (e?.response?.status === 409 || code === 'ALREADY_TAKEN') {
            toast.add({
                severity: 'warn',
                summary: 'Заказ уже взят',
                detail: 'Кто-то успел раньше — обновляю список',
                life: 3000,
            })
            await reload()
        } else {
            toast.add({ severity: 'error', summary: 'Ошибка', detail: code || e?.message, life: 3000 })
        }
    }
}

async function cancelTxn(t: Transaction) {
    const reason = prompt('Причина сторнирования?')
    if (!reason?.trim()) return
    try {
        await TransactionsAPI.cancel(t.id, reason.trim())
        toast.add({ severity: 'success', summary: 'Сторнировано', life: 1500 })
        await reload()
        if (open.value) {
            const fresh = list.value.find((o) => o.id === open.value!.id)
            if (fresh) open.value = fresh
        }
        await loadOpenTxns()
    } catch (e: any) {
        toast.add({ severity: 'error', summary: 'Ошибка', detail: e?.response?.data?.error?.message || e?.message, life: 3000 })
    }
}

async function onPayOrRefundSaved() {
    await reload()
    if (open.value) {
        const fresh = list.value.find((o) => o.id === open.value!.id)
        if (fresh) open.value = fresh
    }
    await loadOpenTxns()
}

watch(open, async (v) => {
    if (v) {
        loadOpenTxns()
        feed.markSeen(v.id)
        panelBanner.value = null
        if (String(route.query.open || '') !== String(v.id)) {
            router.replace({ query: { ...route.query, open: String(v.id) } })
        }
        // Если у открытого заказа ещё нет populate-events — догрузим.
        if (!(v as any).events) {
            const full = await fetchOneDeep(v.id)
            if (full && open.value?.id === full.id) {
                const idx = list.value.findIndex((o) => o.id === full.id)
                if (idx >= 0) list.value.splice(idx, 1, full)
                open.value = full
            }
        }
    } else {
        openTxns.value = []
        if (route.query.open) {
            const { open: _o, ...rest } = route.query
            router.replace({ query: rest })
        }
    }
})

const offs: Array<() => void> = []
onMounted(() => {
    offs.push(feed.onCreated((e) => queueId(e.orderId)))
    offs.push(feed.onUpdated((e) => {
        queueId(e.orderId)
        if (open.value?.id === e.orderId && e.actorId != null && e.actorId !== auth.employee?.id) {
            panelBanner.value = { text: kindToText(e.kind, e.status) }
        }
    }))
    offs.push(feed.onResync(() => reload()))
    document.addEventListener('keydown', onKeydown)
})

/** Фильтр изменился → на первую страницу + перезагрузить. */
let searchDebounce: number | null = null
watch([periodRange, statusFilterKey, paidFilter], () => { timelinePage.value = 0; reload() }, { deep: true })
watch(search, () => {
    if (searchDebounce != null) clearTimeout(searchDebounce)
    searchDebounce = window.setTimeout(() => { timelinePage.value = 0; reload() }, 400)
})
watch([timelinePage, timelineRows], reload)
onBeforeUnmount(() => {
    for (const off of offs) try { off() } catch { /* noop */ }
    if (batchTimer != null) clearTimeout(batchTimer)
    document.removeEventListener('keydown', onKeydown)
})

function onKeydown(ev: KeyboardEvent) {
    if (!open.value) return
    if (ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp') return
    const target = ev.target as HTMLElement | null
    if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
    const idx = rows.value.findIndex((r) => r.id === open.value?.id)
    if (idx < 0) return
    const next = ev.key === 'ArrowDown' ? rows.value[idx + 1] : rows.value[idx - 1]
    if (next) { ev.preventDefault(); open.value = next }
}

function kindToText(kind: string, status: string): string {
    switch (kind) {
        case 'taken': return 'Заказ взял коллега'
        case 'status_changed': return `Статус заказа: ${STATUS_LABEL[status as OrderStatus] || status}`
        case 'payment': return 'Приняли оплату'
        case 'refund': return 'Оформили возврат'
        case 'tx-cancelled': return 'Сторнировали транзакцию'
        default: return 'Заказ изменили'
    }
}

const summary = computed(() => {
    const r = rows.value
    const total = r.reduce((s, o) => s + (o.status === 'canceled' ? 0 : Number(o.total || 0)), 0)
    const nonCanceled = r.filter((o) => o.status !== 'canceled').length
    const avg = nonCanceled ? Math.round(total / nonCanceled) : 0
    return {
        count: r.length,
        total,
        avg,
        canceled: r.filter((o) => o.status === 'canceled').length,
    }
})

function fmt(v: number) {
    return new Intl.NumberFormat('ru-RU').format(v) + ' сум'
}

/** Группировка строк заказа: отдельные товары + блоки по экземпляру набора. */
type ReceiptGroup =
    | { kind: 'product'; line: any; lineTotalBeforeOrder: number }
    | {
          kind: 'set'
          key: string
          name: string
          lines: any[]
          base: number              // sum basePrice × qty
          finalBeforeOrder: number  // sum (lineTotal + orderDiscountAmount)
          setDiscount: number
          setDiscountPercent: number | null
          setPromoName: string | null
      }

const groupedOpenLines = computed<ReceiptGroup[]>(() => {
    const items = (open.value as any)?.items || []
    const groups: ReceiptGroup[] = []
    const byKey = new Map<string, Extract<ReceiptGroup, { kind: 'set' }>>()

    for (const l of items) {
        const unit = Number(l.unitPrice ?? l.price ?? 0)
        const qty = Number(l.qty || 0)
        const lineTotal = Number(l.lineTotal ?? unit * qty)
        const orderCut = Number(l.orderDiscountAmount ?? 0)
        const lineTotalBeforeOrder = lineTotal + orderCut

        // Группа: setInstance (строгий) → orderSetId (fallback для старых заказов).
        const groupKey = l.setInstance || (l.orderSetId ? `set-${l.orderSetId}` : null)
        if (!groupKey) {
            groups.push({ kind: 'product', line: l, lineTotalBeforeOrder })
            continue
        }
        let g = byKey.get(groupKey)
        if (!g) {
            g = {
                kind: 'set',
                key: groupKey,
                name: l.fromSetName || 'Набор',
                lines: [],
                base: 0,
                finalBeforeOrder: 0,
                setDiscount: 0,
                setDiscountPercent: null,
                setPromoName: null,
            }
            byKey.set(groupKey, g)
            groups.push(g)
        }
        g.lines.push(l)
        g.base += Number(l.basePrice ?? l.price ?? 0) * qty
        g.finalBeforeOrder += lineTotalBeforeOrder
        for (const d of (l.discounts || [])) {
            if (d.level === 'line' || d.level === 'set') {
                g.setDiscount += Number(d.amount || 0)
                if (g.setDiscountPercent == null && d.benefitType === 'percent') {
                    g.setDiscountPercent = Number(d.benefitValue)
                }
                if (!g.setPromoName) g.setPromoName = d.name || null
            }
        }
    }
    return groups
})

/** Общая скидка на весь чек: сумма order-уровневых скидок по всем позициям открытого заказа.
 *  Fallback — старое поле cartDiscountAmount (для заказов до фазы 3). */
const orderCartDiscount = computed<{ amount: number; percent: number | null; name: string | null } | null>(() => {
    const o = open.value as any
    if (!o) return null
    let amount = 0
    let percent: number | null = null
    let name: string | null = null
    for (const i of o.items || []) {
        for (const d of (i.discounts || [])) {
            if (d.level !== 'order') continue
            amount += Number(d.amount || 0)
            if (percent == null && d.benefitType === 'percent') percent = Number(d.benefitValue)
            if (!name) name = d.name
        }
    }
    if (amount > 0) return { amount, percent, name }
    // Legacy
    if (Number(o.cartDiscountAmount) > 0) {
        return {
            amount: Number(o.cartDiscountAmount),
            percent: Number(o.cartDiscountPercent) || null,
            name: null,
        }
    }
    return null
})
</script>

<template>
    <AppTopbar title="Заказы" subtitle="Все заказы из Strapi">
        <template #actions>
            <Button icon="pi pi-refresh" severity="secondary" @click="reload" />
            <Button label="+ Заказ" icon="pi pi-plus" @click="router.push('/orders/new')" />
        </template>
    </AppTopbar>

    <div class="p-8 space-y-5">
        <!-- Период + поиск -->
        <div class="flex items-center gap-3 flex-wrap">
            <PeriodPicker v-model="periodRange"
                          :periods="['null', 'this-year', 'this-month', 'this-week', 'today', 'other']" />
            <div class="flex-1 min-w-[260px]">
                <FloatLabel variant="on">
                    <IconField>
                        <InputIcon class="pi pi-search" />
                        <InputText id="orders-search" v-model.trim="search"
                                   class="w-full pl-10" :class="search ? 'pr-10' : ''" />
                        <InputIcon v-if="search" class="pi pi-times cursor-pointer"
                                   @click="search = ''" />
                    </IconField>
                    <label for="orders-search">Поиск: код, клиент, телефон</label>
                </FloatLabel>
            </div>
        </div>

        <div class="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-5">
          <!-- ЛЕВАЯ КОЛОНКА: таймлайн + фильтры + paginator -->
          <div class="space-y-4">
            <div class="bg-white rounded-xl ring-1 ring-ink-100 p-3 flex gap-3 flex-wrap items-center">
                <SelectButton v-model="statusFilterKey" :options="statusOptions"
                              option-label="label" option-value="value" :allow-empty="false"
                              class="orders-status-btn" />
                <div class="self-stretch w-px bg-ink-100"></div>
                <label class="inline-flex items-center gap-2 text-sm font-semibold cursor-pointer select-none rounded-lg px-3 py-1.5 border transition"
                       :class="paidFilter === 'unpaid'
                           ? 'bg-tomato-500/10 border-tomato-500/40 text-tomato-600'
                           : 'bg-white border-ink-200 text-ink-700 hover:border-ink-400'">
                    <span>Не оплачены</span>
                    <ToggleSwitch :model-value="paidFilter === 'unpaid'"
                                  @update:model-value="(v: boolean) => paidFilter = v ? 'unpaid' : 'all'" />
                </label>
            </div>

        <div v-if="newWhileScrolled > 0"
             class="rounded-xl bg-ink-900 text-cream-50 text-sm px-4 py-2 flex items-center gap-3 w-fit shadow-lg">
            <i class="pi pi-arrow-up"></i>
            <span>{{ newWhileScrolled }} новых заказов</span>
            <button class="text-xs font-semibold text-saffron-300 hover:underline"
                    type="button" @click="paginatorFirst = 0; newWhileScrolled = 0">
                К первой странице
            </button>
        </div>
        <div v-if="notInFilter > 0"
             class="rounded-xl bg-saffron-300/15 text-ink-700 text-sm px-4 py-2 flex items-center gap-3">
            <i class="pi pi-filter text-saffron-500"></i>
            <span>{{ notInFilter }} новых заказов не попадают в фильтр</span>
            <button class="ml-auto text-xs font-semibold text-tomato-500 hover:underline"
                    type="button" @click="notInFilter = 0; search = ''; statusFilterKey = 'all'; paidFilter = 'all'">
                Сбросить фильтры
            </button>
        </div>

            <!-- Таймлайн по дням -->
            <div v-if="loading" class="text-sm text-ink-400 py-10 text-center">Загрузка…</div>
            <div v-else-if="!rows.length" class="bg-white rounded-2xl ring-1 ring-ink-100 shadow-sm py-10 text-center text-sm text-ink-400">
                <i class="pi pi-inbox text-3xl text-ink-300 block mb-2"></i>
                По текущим фильтрам заказов нет.
            </div>
            <section v-for="g in groupedDays" :key="g.key" class="bg-white rounded-2xl ring-1 ring-ink-100 shadow-sm overflow-hidden">
                <header class="flex items-center gap-3 px-5 py-4 border-b border-ink-100">
                    <span class="w-10 h-10 rounded-xl bg-tomato-500/10 text-tomato-500 inline-flex items-center justify-center">
                        <i class="pi pi-calendar text-sm"></i>
                    </span>
                    <div class="min-w-0">
                        <div class="font-display font-extrabold text-base">{{ g.label }}</div>
                        <div class="text-xs text-ink-400">{{ g.count }} заказов · {{ fmt(g.total) }}</div>
                    </div>
                </header>
                <ul class="list-none m-0 p-0">
                    <li v-for="o in g.items" :key="o.id"
                        class="flex items-center gap-3 px-5 py-3 border-b border-ink-100 last:border-b-0 cursor-pointer hover:bg-cream-50/60 transition-colors"
                        :class="[flash.has(o.id) ? 'order-flash' : '', open?.id === o.id ? 'order-row-open' : '']"
                        @click="open = o">
                        <span class="w-10 h-10 rounded-xl bg-cream-50 text-ink-700 inline-flex items-center justify-center shrink-0">
                            <i class="pi pi-arrow-up-right text-sm"></i>
                        </span>
                        <div class="min-w-0 flex-1">
                            <div class="flex items-center gap-2 flex-wrap">
                                <span class="font-mono text-xs font-semibold rounded-md bg-cream-50 text-ink-700 px-2 py-1">{{ o.code }}</span>
                                <button type="button" class="text-ink-400 hover:text-ink-900"
                                        title="Скопировать номер"
                                        @click.stop="copyOrderCode(o.code)">
                                    <i class="pi pi-copy text-[11px]"></i>
                                </button>
                                <span class="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
                                      :class="tableStagePill(o)">{{ tableStageLabel(o) }}</span>
                                <span v-if="feed.unseenIds.includes(o.id)"
                                      class="rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase bg-olive-500 text-cream-50">
                                    Новый
                                </span>
                                <span class="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
                                      :class="paymentColor[o.paymentStatus || 'unpaid']">
                                    {{ paymentLabel[o.paymentStatus || 'unpaid'] }}
                                </span>
                            </div>
                            <div class="text-xs text-ink-400 mt-1 truncate">
                                {{ orderTime(o.createdAt) }} ·
                                <span>{{ o.client?.fullName || '—' }}</span>
                                <span v-if="o.employee"> · {{ o.employee.fullName }}</span>
                            </div>
                        </div>
                        <div class="text-xs text-ink-500 whitespace-nowrap">{{ orderItemsQty(o) }} шт</div>
                        <div class="font-display font-extrabold text-right whitespace-nowrap min-w-[120px]">{{ fmt(Number(o.total)) }}</div>
                        <i class="pi pi-chevron-right text-ink-300 text-xs"></i>
                    </li>
                </ul>
            </section>

            <!-- Paginator -->
            <div v-if="rows.length" class="bg-white rounded-2xl ring-1 ring-ink-100 shadow-sm">
                <Paginator :first="timelinePage * timelineRows"
                           :rows="timelineRows" :total-records="totalRecords"
                           :rows-per-page-options="PAGE_SIZE_OPTIONS"
                           :template="PAGINATOR_TEMPLATE"
                           :current-page-report-template="PAGINATOR_REPORT"
                           @page="(ev: any) => { timelinePage = ev.page; timelineRows = ev.rows }" />
            </div>
          </div>

          <!-- ПРАВАЯ КОЛОНКА: сводка -->
          <aside class="space-y-3 xl:sticky xl:top-24 self-start">
            <div class="bg-white rounded-2xl ring-1 ring-ink-100 shadow-sm p-5 flex items-center gap-4">
                <div class="w-11 h-11 rounded-xl bg-ink-900 text-cream-50 inline-flex items-center justify-center">
                    <i class="pi pi-shopping-bag text-lg"></i>
                </div>
                <div class="min-w-0">
                    <div class="text-[10px] font-bold uppercase tracking-wider text-ink-400">Заказов</div>
                    <div class="font-display font-extrabold text-2xl mt-1 leading-none">{{ summary.count }}</div>
                </div>
            </div>
            <div class="bg-white rounded-2xl ring-1 ring-ink-100 shadow-sm p-5 flex items-center gap-4">
                <div class="w-11 h-11 rounded-xl bg-olive-500/15 text-olive-500 inline-flex items-center justify-center">
                    <i class="pi pi-wallet text-lg"></i>
                </div>
                <div class="min-w-0">
                    <div class="text-[10px] font-bold uppercase tracking-wider text-ink-400">Сумма</div>
                    <div class="font-display font-extrabold text-2xl mt-1 leading-none truncate">{{ fmt(summary.total) }}</div>
                </div>
            </div>
            <div class="bg-white rounded-2xl ring-1 ring-ink-100 shadow-sm p-5 flex items-center gap-4">
                <div class="w-11 h-11 rounded-xl bg-saffron-300/25 text-saffron-500 inline-flex items-center justify-center">
                    <i class="pi pi-chart-line text-lg"></i>
                </div>
                <div class="min-w-0">
                    <div class="text-[10px] font-bold uppercase tracking-wider text-ink-400">Средний чек</div>
                    <div class="font-display font-extrabold text-2xl mt-1 leading-none truncate">{{ fmt(summary.avg) }}</div>
                </div>
            </div>
            <div class="bg-white rounded-2xl ring-1 ring-ink-100 shadow-sm p-5 flex items-center gap-4">
                <div class="w-11 h-11 rounded-xl bg-tomato-500/15 text-tomato-500 inline-flex items-center justify-center">
                    <i class="pi pi-times-circle text-lg"></i>
                </div>
                <div class="min-w-0">
                    <div class="text-[10px] font-bold uppercase tracking-wider text-ink-400">Отмен</div>
                    <div class="font-display font-extrabold text-2xl mt-1 leading-none text-tomato-500">{{ summary.canceled }}</div>
                </div>
            </div>
          </aside>
        </div>
    </div>

    <OrderPanel :order="open" :events="((open as any)?.events) ?? []" :transactions="openTxns" :panel-banner="panelBanner" @close="open = null" @take="takeOrder(open!)" @confirm="confirmByCall" @move="(to) => changeStatus(open!, to)" @cancel="open && askCancel(open)" @payOpen="payOpen = true" @refundOpen="refundOpen = true" @cancelTxn="cancelTxn" @bannerClose="panelBanner = null" @edit="open && router.push({ name: 'order-edit', params: { id: open.id } })" />

    <!-- Отмена: причина обязательна, транзакции заказа сторнируются на сервере -->
    <CancelOrderDialog :visible="!!cancelDialog.order"
                       @update:visible="(v: boolean) => { if (!v) cancelDialog = { order: null, reason: '' } }"
                       :order="cancelDialog.order"
                       :transactions="cancelDialog.order && open && cancelDialog.order.id === open.id ? openTxns : undefined"
                       @canceled="onCanceled" />

    <AcceptPaymentDialog v-model:visible="payOpen" :order="open" @saved="onPayOrRefundSaved" />
    <RefundDialog v-model:visible="refundOpen" :order="open" @saved="onPayOrRefundSaved" />
</template>

<style>
@keyframes order-flash-kf {
    0%   { background-color: rgba(107, 122, 63, 0.18); }
    100% { background-color: transparent; }
}
.p-datatable .p-datatable-tbody > tr.order-flash > td {
    animation: order-flash-kf 3.5s ease-out 1;
}
/* Полупрозрачные строки — только пока открыта панель; активная строка исключена. */
.orders-table--open .p-datatable-tbody > tr:not(.order-row-open) {
    opacity: 0.4;
    transition: opacity 200ms ease;
}
.orders-table--open .p-datatable-tbody > tr:not(.order-row-open):hover { opacity: 0.8; }
/* Открытая строка — акцентная полоса слева + мягкая подложка. */
.p-datatable .p-datatable-tbody > tr.order-row-open > td {
    background-color: var(--color-cream-50);
}
.p-datatable .p-datatable-tbody > tr.order-row-open > td:first-child {
    box-shadow: inset 3px 0 0 var(--color-tomato-500);
}
/* Фильтр статусов — меньше текст. */
.orders-status-btn .p-togglebutton,
.orders-status-btn .p-button {
    font-size: 12px;
}
</style>
