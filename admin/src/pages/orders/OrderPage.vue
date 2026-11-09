<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import { Orders, type Order, type OrderStatus, type Transaction } from '@/services/resources'
import { Transactions as TransactionsAPI } from '@/services/transactions'
import { orderErrorText } from '@/services/orders'
import { api } from '@/services/api'
import { useAuth } from '@/stores/auth'
import { useOrdersFeed } from '@/stores/ordersFeed'
import { STATUS_LABEL, stageChip } from '@/utils/orderFlow'
import OrderDetails from './components/OrderDetails.vue'
import CancelOrderDialog from './components/CancelOrderDialog.vue'
import AcceptPaymentDialog from './components/AcceptPaymentDialog.vue'
import RefundDialog from './components/RefundDialog.vue'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const auth = useAuth()
const feed = useOrdersFeed()

const orderId = computed(() => Number(route.params.id))
const order = ref<Order | null>(null)
const txns = ref<Transaction[]>([])
const loading = ref(true)
const notFound = ref(false)
const banner = ref<{ text: string } | null>(null)

const cancelOpen = ref(false)
const payOpen = ref(false)
const refundOpen = ref(false)
const menuOpen = ref(false)

/** Полный заказ: состав с товарами, клиент, сотрудник, заявка, транзакции, история с авторами. */
const POPULATE = {
    items: { populate: ['product'] },
    client: true,
    employee: true,
    request: true,
    transactions: true,
    events: { populate: ['actor'] },
}

async function load(silent = false) {
    if (!orderId.value) { notFound.value = true; loading.value = false; return }
    if (!silent) loading.value = true
    try {
        const rows = await Orders.list({ filters: { id: { $eq: orderId.value } }, populate: POPULATE })
        order.value = rows[0] ?? null
        notFound.value = !order.value
        if (order.value) await loadTxns()
    } catch (e: any) {
        toast.add({ severity: 'error', summary: 'Не удалось загрузить заказ', detail: e?.message, life: 3000 })
    } finally {
        loading.value = false
    }
}

async function loadTxns() {
    const o = order.value
    if (!o) { txns.value = []; return }
    try {
        const res = await TransactionsAPI.list({ orderCode: o.code, pageSize: 100 })
        txns.value = res.data.filter((t) => t.order?.id === o.id)
    } catch {
        txns.value = []
    }
}

onMounted(() => load())
watch(orderId, () => load())

// ───────────── Живое обновление ─────────────
const offs: Array<() => void> = []
let reloadTimer: number | null = null
function scheduleReload() {
    if (reloadTimer != null) clearTimeout(reloadTimer)
    reloadTimer = window.setTimeout(() => { reloadTimer = null; load(true) }, 300)
}
onMounted(() => {
    feed.markSeen(orderId.value)
    offs.push(feed.onUpdated((e) => {
        if (e.orderId !== orderId.value) return
        scheduleReload()
        if (e.actorId != null && e.actorId !== auth.employee?.id) {
            banner.value = { text: 'Заказ изменил коллега — данные обновлены' }
        }
    }))
    offs.push(feed.onResync(() => load(true)))
})
onBeforeUnmount(() => {
    for (const off of offs) try { off() } catch { /* noop */ }
    if (reloadTimer != null) clearTimeout(reloadTimer)
})

// ───────────── Действия ─────────────
function errText(e: any) {
    const code = e?.response?.data?.error?.message
    return orderErrorText(code) || code || e?.message
}

async function take() {
    if (!order.value) return
    try {
        await api.post(`/staff/orders/${order.value.id}/take`, {})
        toast.add({ severity: 'success', summary: 'Заказ взят в работу', life: 1800 })
    } catch (e: any) {
        if (e?.response?.status === 409) {
            toast.add({ severity: 'warn', summary: 'Заказ уже взят', detail: 'Кто-то успел раньше', life: 3000 })
        } else {
            toast.add({ severity: 'error', summary: 'Ошибка', detail: errText(e), life: 3000 })
        }
    }
    await load(true)
}

async function changeStatus(status: OrderStatus, extra: Record<string, any> = {}) {
    if (!order.value) return
    try {
        await Orders.update(order.value.documentId, { status, ...extra } as any)
        toast.add({ severity: 'success', summary: STATUS_LABEL[status], life: 1500 })
    } catch (e: any) {
        toast.add({ severity: 'error', summary: 'Ошибка', detail: errText(e), life: 3000 })
    }
    await load(true)
}

async function cancelTxn(t: Transaction) {
    const reason = prompt('Причина сторнирования?')
    if (!reason?.trim()) return
    try {
        await TransactionsAPI.cancel(t.id, reason.trim())
        toast.add({ severity: 'success', summary: 'Сторнировано', life: 1500 })
    } catch (e: any) {
        toast.add({ severity: 'error', summary: 'Ошибка', detail: errText(e), life: 3000 })
    }
    await load(true)
}

function goEdit() {
    if (order.value) router.push({ name: 'order-edit', params: { id: order.value.id } })
}

async function copy(text: string, label: string) {
    try {
        await navigator.clipboard.writeText(text)
        toast.add({ severity: 'success', summary: label, life: 1200 })
    } catch { /* noop */ }
}

// ───────────── Отображение ─────────────
const chip = computed(() => (order.value ? stageChip(order.value) : null))
const canEdit = computed(() =>
    order.value?.status === 'new' && (auth.role === 'manager' || auth.role === 'duty'),
)
const canCancel = computed(() =>
    !!order.value && order.value.status !== 'done' && order.value.status !== 'canceled',
)
const pageLink = computed(() => (order.value ? `${window.location.origin}/admin/orders/${order.value.id}` : ''))
const cancelledTxns = computed(() => txns.value.filter((t) => t.status === 'cancelled').length)

const sourceLabel = computed(() => {
    const o = order.value
    if (!o) return ''
    if (o.source === 'catalog') return 'из каталога'
    if (o.source === 'telegram') return 'через Telegram'
    if (o.source === 'manual') return 'вручную'
    return (o as any).request?.code ? `из заявки ${(o as any).request.code}` : 'из заявки'
})
const createdLabel = computed(() => {
    const o = order.value
    if (!o) return ''
    const d = new Date(o.createdAt)
    const today = new Date().toDateString() === d.toDateString()
    const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    return today ? `сегодня ${time}` : d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
})
</script>

<template>
    <div class="min-h-screen bg-ink-50 text-ink-900">
        <!-- Шапка -->
        <header class="bg-white border-b border-ink-100 px-6 lg:px-8 pt-4 pb-5 flex flex-col gap-3 sticky top-0 z-30">
            <nav aria-label="Навигация" class="flex items-center gap-2 text-[13px] text-ink-500">
                <RouterLink to="/orders" class="inline-flex items-center gap-1.5 font-semibold text-ink-700 hover:text-ink-900 no-underline">
                    <i class="pi pi-arrow-left text-xs"></i>Заказы
                </RouterLink>
                <span aria-hidden="true">/</span>
                <span>{{ order?.code || `#${orderId}` }}</span>
            </nav>

            <div v-if="order" class="flex flex-wrap items-center gap-x-3.5 gap-y-2">
                <h1 class="m-0 font-display font-extrabold text-[28px] tracking-tight leading-none">{{ order.code }}</h1>
                <button type="button" class="text-ink-400 hover:text-ink-900 p-1" title="Скопировать номер"
                        @click="copy(order.code, 'Номер скопирован')">
                    <i class="pi pi-copy text-xs"></i>
                </button>
                <span v-if="chip" class="rounded-full px-2.5 py-1 text-xs font-bold" :class="chip.cls">{{ chip.label }}</span>
                <span class="text-[13px] text-ink-500">{{ sourceLabel }} · {{ createdLabel }}</span>
                <div class="flex-1"></div>
                <button v-if="canEdit" type="button"
                        class="h-11 px-4 rounded-xl border border-ink-200 bg-white text-sm font-semibold inline-flex items-center gap-2 hover:border-ink-400 transition"
                        @click="goEdit">
                    <i class="pi pi-pencil text-xs"></i>Редактировать
                </button>
                <button v-if="canCancel" type="button"
                        class="h-11 px-3.5 rounded-xl text-sm font-semibold text-tomato-600 hover:bg-tomato-500/10 transition"
                        @click="cancelOpen = true">
                    Отменить заказ
                </button>
                <div class="relative">
                    <button type="button" aria-label="Ещё"
                            class="w-11 h-11 rounded-xl border border-ink-100 bg-white inline-flex items-center justify-center text-ink-500 hover:bg-ink-50"
                            @click="menuOpen = !menuOpen">
                        <i class="pi pi-ellipsis-h text-sm"></i>
                    </button>
                    <div v-if="menuOpen"
                         class="absolute right-0 mt-1 w-56 bg-white rounded-xl shadow-lg ring-1 ring-ink-100 py-1 z-40 text-sm"
                         @click="menuOpen = false">
                        <RouterLink :to="{ path: '/orders', query: { open: String(order.id) } }"
                                    class="block px-3 py-2 hover:bg-ink-50 text-ink-900 no-underline">
                            <i class="pi pi-list text-xs mr-2"></i>Показать в списке
                        </RouterLink>
                        <button type="button" class="w-full text-left px-3 py-2 hover:bg-ink-50"
                                @click="copy(pageLink, 'Ссылка скопирована')">
                            <i class="pi pi-link text-xs mr-2"></i>Скопировать ссылку
                        </button>
                        <button type="button" class="w-full text-left px-3 py-2 hover:bg-ink-50"
                                @click="copy(order.code, 'Номер скопирован')">
                            <i class="pi pi-copy text-xs mr-2"></i>Скопировать номер
                        </button>
                    </div>
                </div>
            </div>

            <!-- Пояснение о правке / отмене -->
            <template v-if="order">
                <div v-if="order.status === 'canceled'"
                     class="flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl bg-tomato-500/10 text-[13px] text-[#651d15]">
                    <i class="pi pi-times-circle text-sm mt-0.5"></i>
                    <span>
                        Заказ отменён<template v-if="order.cancelReason">: {{ order.cancelReason }}</template>.
                        <template v-if="cancelledTxns">Транзакции заказа сторнированы ({{ cancelledTxns }}).</template>
                    </span>
                </div>
                <div v-else-if="order.status === 'new'"
                     class="flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl bg-[#fdf6e3] text-[13px] text-[#5a4500]">
                    <i class="pi pi-info-circle text-sm mt-0.5"></i>
                    <span>Заказ можно редактировать, пока клиент его не подтвердил. После подтверждения состав, адрес и оплата фиксируются.</span>
                </div>
                <div v-else
                     class="flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl bg-ink-100/70 text-[13px] text-ink-700">
                    <i class="pi pi-lock text-sm mt-0.5"></i>
                    <span>Клиент подтвердил заказ — состав и данные зафиксированы. Изменить можно только статус и оплату.</span>
                </div>
            </template>
        </header>

        <main class="px-6 lg:px-8 py-6">
            <div v-if="loading" class="space-y-5">
                <div class="h-36 rounded-2xl bg-white ring-1 ring-ink-100 animate-pulse"></div>
                <div class="grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
                    <div class="h-96 rounded-2xl bg-white ring-1 ring-ink-100 animate-pulse"></div>
                    <div class="h-96 rounded-2xl bg-white ring-1 ring-ink-100 animate-pulse"></div>
                </div>
            </div>

            <div v-else-if="notFound" class="max-w-md mx-auto mt-16 text-center space-y-3">
                <div class="font-display font-bold text-xl">Заказ не найден</div>
                <p class="text-sm text-ink-500">Возможно, ссылка устарела или у вас нет доступа.</p>
                <RouterLink to="/orders" class="inline-flex h-11 px-4 items-center rounded-xl bg-ink-900 text-white text-sm font-semibold no-underline">
                    К списку заказов
                </RouterLink>
            </div>

            <OrderDetails v-else-if="order"
                          :order="order" :events="((order as any).events) ?? []" :transactions="txns"
                          :panel-banner="banner" layout="page"
                          @take="take"
                          @confirm="(note: string) => changeStatus('accepted', { statusNote: note || undefined })"
                          @move="(to: OrderStatus) => changeStatus(to)"
                          @cancel="cancelOpen = true"
                          @pay-open="payOpen = true" @refund-open="refundOpen = true"
                          @cancel-txn="cancelTxn" @banner-close="banner = null"
                          @edit="goEdit" />
        </main>

        <CancelOrderDialog v-model:visible="cancelOpen" :order="order" :transactions="txns" @canceled="load(true)" />
        <AcceptPaymentDialog v-model:visible="payOpen" :order="order" @saved="load(true)" />
        <RefundDialog v-model:visible="refundOpen" :order="order" @saved="load(true)" />
    </div>
</template>
