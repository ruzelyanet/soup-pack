<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppTopbar from '@/components/AppTopbar.vue'
import ClientFormDialog from './ClientFormDialog.vue'
import {
    Clients, Orders,
    type Client, type ClientStats, type Order, type Transaction,
} from '@/services/resources'
import { Transactions as TransactionsAPI } from '@/services/transactions'
import { mediaUrl } from '@/services/api'
import Button from 'primevue/button'
import Drawer from 'primevue/drawer'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

use([BarChart, GridComponent, TooltipComponent, CanvasRenderer])
import { PAGINATOR_TEMPLATE, PAGINATOR_REPORT, PAGE_SIZE_OPTIONS, DEFAULT_PAGE_SIZE } from '@/utils/paginator'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const confirm = useConfirm()

const client = ref<Client | null>(null)
const loading = ref(true)

function emptyMonths() {
    const now = new Date()
    const months: Array<{ ym: string; label: string; count: number; amount: number }> = []
    for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        months.push({
            ym: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
            label: d.toLocaleString('ru-RU', { month: 'short' }),
            count: 0,
            amount: 0,
        })
    }
    return months
}
const stats = ref<ClientStats>({ totalCount: 0, totalAmount: 0, avgCheck: 0, lastPurchaseAt: null, months: emptyMonths() })

const orders = ref<Order[]>([])
const ordersPage = ref(0)
const ordersPageSize = ref(DEFAULT_PAGE_SIZE)
const ordersTotal = ref(0)
const ordersLoading = ref(false)

const dialog = ref(false)
const selectedOrder = ref<Order | null>(null)

const subTab = ref<'purchases' | 'transactions'>('purchases')

// --- Transactions table ---
const txns = ref<Transaction[]>([])
const txnsPage = ref(0)
const txnsPageSize = ref(DEFAULT_PAGE_SIZE)
const txnsTotal = ref(0)
const txnsLoading = ref(false)

async function loadTxns() {
    txnsLoading.value = true
    try {
        const res = await TransactionsAPI.list({
            page: txnsPage.value + 1,
            pageSize: txnsPageSize.value,
            ...({ clientDocId: route.params.id } as any),
        })
        txns.value = res.data
        txnsTotal.value = res.meta.pagination.total
    } finally {
        txnsLoading.value = false
    }
}

function pickSubTab(t: 'purchases' | 'transactions') {
    subTab.value = t
    if (t === 'transactions' && !txns.value.length) loadTxns()
}

const TXN_METHOD_LABEL: Record<string, string> = {
    cash: 'Наличные', card: 'Карта', click: 'Click', payme: 'Payme', transfer: 'Перевод',
}
const TXN_KIND_LABEL: Record<string, string> = { payment: 'Оплата', refund: 'Возврат' }

const PAY_LABEL: Record<string, string> = {
    paid: 'Оплачен', unpaid: 'Не оплачен', partial: 'Частично', overpaid: 'Переплата', refunded: 'Возврат',
}
const PAY_PILL: Record<string, string> = {
    paid: 'bg-emerald-500/15 text-emerald-600',
    unpaid: 'bg-tomato-500/15 text-tomato-500',
    partial: 'bg-saffron-300/40 text-saffron-500',
    overpaid: 'bg-saffron-300/40 text-saffron-500',
    refunded: 'bg-ink-100 text-ink-500',
}

/** Считаем статистику из списка заказов клиента (без отменённых). */
function computeStats(orders: Order[]): ClientStats {
    const live = orders.filter((o) => o.status !== 'canceled')
    const totalCount = live.length
    const totalAmount = live.reduce((s, o) => s + Number(o.total || 0), 0)
    const avgCheck = totalCount > 0 ? Math.round(totalAmount / totalCount) : 0
    const lastPurchaseAt = live.reduce((max: string | null, o) => {
        return !max || new Date(o.createdAt) > new Date(max) ? o.createdAt : max
    }, null)

    const months = emptyMonths()
    for (const o of live) {
        const d = new Date(o.createdAt)
        const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        const bucket = months.find((m) => m.ym === ym)
        if (bucket) { bucket.count++; bucket.amount += Number(o.total || 0) }
    }
    return { totalCount, totalAmount, avgCheck, lastPurchaseAt, months }
}

async function loadClient() {
    loading.value = true
    try {
        const docId = route.params.id as string
        const [c, allOrders] = await Promise.all([
            Clients.get(docId, { populate: ['photo'] }),
            // Для агрегата тянем все заказы клиента (до 500) — хватит для любого реального кейса.
            Orders.list({
                'filters[client][documentId][$eq]': docId,
                sort: 'createdAt:desc',
                'pagination[pageSize]': 500,
            }).catch(() => [] as Order[]),
        ])
        client.value = c
        stats.value = computeStats(allOrders)
    } catch (e: any) {
        toast.add({ severity: 'error', summary: 'Не удалось загрузить', detail: e?.message, life: 2500 })
    } finally {
        loading.value = false
    }
}

async function loadOrders() {
    ordersLoading.value = true
    try {
        const res = await Orders.listPaged({
            populate: ['items', 'employee'],
            'filters[client][documentId][$eq]': route.params.id,
            sort: 'createdAt:desc',
            'pagination[page]': ordersPage.value + 1,
            'pagination[pageSize]': ordersPageSize.value,
        })
        orders.value = res.data
        ordersTotal.value = res.meta.pagination.total
    } finally {
        ordersLoading.value = false
    }
}

onMounted(async () => {
    await loadClient()
    await loadOrders()
})

const initials = computed(() =>
    (client.value?.fullName || '').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase() || '—',
)
const photoUrl = computed(() => mediaUrl(client.value?.photo?.url))

const genderLabel = computed(() => {
    if (client.value?.gender === 'male') return 'Мужской'
    if (client.value?.gender === 'female') return 'Женский'
    return '—'
})

const registrationLabel = computed(() => {
    const iso = client.value?.createdAt
    if (!iso) return '—'
    const d = new Date(iso)
    const now = new Date()
    if (d.getFullYear() === now.getFullYear()) return 'В этом году'
    if (d.getFullYear() === now.getFullYear() - 1) return 'В прошлом году'
    return `В ${d.getFullYear()} году`
})

function fmtSum(v: number | null | undefined) {
    return new Intl.NumberFormat('ru-RU').format(Math.round(Number(v || 0)))
}
function fmtDate(iso: string | null | undefined) {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('ru-RU')
}
function fmtDateTime(iso: string) {
    return new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); toast.add({ severity: 'info', summary: 'Скопировано', life: 1200 }) }
    catch { /* noop */ }
}

function onSaved(c: Client) {
    client.value = { ...client.value, ...c } as Client
}

function askDelete() {
    if (!client.value) return
    confirm.require({
        header: 'Удалить клиента?',
        message: `Клиент «${client.value.fullName}» будет безвозвратно удалён. Его заказы останутся, но без привязки.`,
        acceptLabel: 'Удалить',
        rejectLabel: 'Отмена',
        acceptProps: { severity: 'danger' },
        accept: async () => {
            try {
                await Clients.remove(client.value!.documentId)
                router.push('/clients')
            } catch (e: any) {
                toast.add({ severity: 'error', summary: 'Ошибка', detail: e?.message, life: 2500 })
            }
        },
    })
}

const chartOption = computed(() => ({
    grid: { top: 10, right: 8, bottom: 24, left: 8, containLabel: true },
    tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: '#111',
        borderWidth: 0,
        textStyle: { color: '#fff', fontSize: 12 },
        formatter: (p: any) => {
            const point = Array.isArray(p) ? p[0] : p
            const m = stats.value.months[point.dataIndex]
            return `<b>${m?.label || ''}</b><br/>${fmtSum(m?.amount || 0)} сум · ${m?.count || 0} заказов`
        },
    },
    xAxis: {
        type: 'category',
        data: stats.value.months.map((m) => m.label),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: '#64748b', fontSize: 11, fontWeight: 600 },
    },
    yAxis: {
        type: 'value',
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { show: false },
        splitLine: { lineStyle: { color: '#f1f5f9', type: 'dashed' } },
    },
    series: [{
        type: 'bar',
        data: stats.value.months.map((m) => m.amount),
        itemStyle: {
            color: '#14b8a6',
            borderRadius: [8, 8, 0, 0],
        },
        barMaxWidth: 48,
        emphasis: { itemStyle: { color: '#0d9488' } },
    }],
}))

</script>

<template>
    <AppTopbar :title="client?.fullName || 'Клиент'" back="/clients" />

    <div v-if="loading" class="p-8 text-ink-400">Загрузка…</div>

    <div v-else-if="client" class="p-6 space-y-5">
        <!-- TOP ROW: profile + stats+chart -->
        <div class="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
            <!-- LEFT: profile -->
            <div class="bg-white rounded-3xl p-5 flex flex-col gap-4">
                <div class="flex items-center gap-4">
                    <img v-if="photoUrl" :src="photoUrl" alt="" class="size-16 rounded-2xl object-cover" />
                    <div v-else class="size-16 rounded-2xl bg-teal-500/15 text-teal-600 flex items-center justify-center font-display font-black text-2xl">
                        {{ initials }}
                    </div>
                    <div class="min-w-0 flex-1">
                        <div class="font-display font-black text-xl truncate">{{ client.fullName || '—' }}</div>
                        <button type="button"
                                class="mt-0.5 text-sm text-ink-600 hover:text-ink-900 inline-flex items-center gap-1"
                                @click="copy(client.phone)">
                            {{ client.phone }} <i class="pi pi-copy text-[10px] opacity-60" />
                        </button>
                    </div>
                </div>

                <div class="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                    <div>
                        <div class="text-xs text-ink-400">Зарегистрирован</div>
                        <div class="font-bold mt-0.5">{{ registrationLabel }}</div>
                    </div>
                    <div>
                        <div class="text-xs text-ink-400">День рождения</div>
                        <div class="font-bold mt-0.5">{{ fmtDate(client.birthDate) }}</div>
                    </div>
                    <div>
                        <div class="text-xs text-ink-400">Пол</div>
                        <div class="font-bold mt-0.5">{{ genderLabel }}</div>
                    </div>
                    <div>
                        <div class="text-xs text-ink-400">Телефон</div>
                        <div class="font-bold mt-0.5">{{ client.phone }}</div>
                    </div>
                    <div>
                        <div class="text-xs text-ink-400">Telegram</div>
                        <div class="font-bold mt-0.5">
                            <a v-if="client.telegramUsername" :href="`https://t.me/${client.telegramUsername}`"
                               target="_blank" rel="noopener"
                               class="text-ink-900 no-underline hover:underline">@{{ client.telegramUsername }}</a>
                            <span v-else>—</span>
                        </div>
                    </div>
                    <div class="col-span-2">
                        <div class="text-xs text-ink-400">Адрес</div>
                        <div class="font-bold mt-0.5">{{ client.address || '—' }}</div>
                    </div>
                    <div class="col-span-2">
                        <div class="text-xs text-ink-400">Откуда пришёл клиент</div>
                        <div class="font-bold mt-0.5">{{ client.source || '—' }}</div>
                    </div>
                </div>

                <div class="grid grid-cols-2 gap-2 mt-auto pt-2">
                    <Button label="Редактировать" icon="pi pi-pencil" severity="secondary"
                            outlined class="w-full" @click="dialog = true" />
                    <Button label="Удалить клиента" icon="pi pi-trash" severity="danger"
                            outlined class="w-full" @click="askDelete" />
                </div>
            </div>

            <!-- CENTER: 4 stats + chart -->
            <div class="space-y-4">
                <div class="grid grid-cols-2 gap-3">
                    <div class="rounded-2xl bg-white p-5">
                        <div class="text-xs text-ink-400">Всего покупок</div>
                        <div class="mt-1 font-display font-black text-2xl">
                            {{ fmtSum(stats.totalAmount) }} <span class="text-sm text-ink-400 font-semibold">Сум</span>
                        </div>
                    </div>
                    <div class="rounded-2xl bg-white p-5">
                        <div class="text-xs text-ink-400">Количество покупок</div>
                        <div class="mt-1 font-display font-black text-2xl">{{ stats.totalCount }}</div>
                    </div>
                    <div class="rounded-2xl bg-white p-5">
                        <div class="text-xs text-ink-400">Средний чек</div>
                        <div class="mt-1 font-display font-black text-2xl">
                            {{ fmtSum(stats.avgCheck) }} <span class="text-sm text-ink-400 font-semibold">Сум</span>
                        </div>
                    </div>
                    <div class="rounded-2xl bg-white p-5">
                        <div class="text-xs text-ink-400">Последняя покупка</div>
                        <div class="mt-1 font-display font-black text-xl">{{ fmtDate(stats.lastPurchaseAt) }}</div>
                    </div>
                </div>

                <!-- Dynamics chart (ECharts) -->
                <div class="bg-white rounded-2xl p-5">
                    <div class="font-display font-bold text-base">Динамика покупок</div>
                    <div class="text-xs text-ink-400 mt-0.5">Последние 6 месяцев</div>
                    <div class="mt-4" style="width: 100%; height: 220px;">
                        <VChart :option="chartOption" style="width: 100%; height: 100%;" autoresize />
                    </div>
                </div>
            </div>

        </div>

        <!-- HISTORY -->
        <div class="bg-white rounded-3xl p-5 space-y-4">
            <!-- Sub-tabs — segmented control -->
            <div class="inline-flex p-1 rounded-full bg-ink-50">
                <button type="button"
                        class="rounded-full px-5 py-2 text-sm font-bold transition inline-flex items-center gap-2"
                        :class="subTab === 'purchases' ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-700'"
                        @click="pickSubTab('purchases')">
                    <i class="pi pi-shopping-bag text-xs" /> Покупки
                    <span v-if="ordersTotal > 0" class="text-xs opacity-60">({{ ordersTotal }})</span>
                </button>
                <button type="button"
                        class="rounded-full px-5 py-2 text-sm font-bold transition inline-flex items-center gap-2"
                        :class="subTab === 'transactions' ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-700'"
                        @click="pickSubTab('transactions')">
                    <i class="pi pi-money-bill text-xs" /> Транзакции
                    <span v-if="txnsTotal > 0" class="text-xs opacity-60">({{ txnsTotal }})</span>
                </button>
            </div>

            <DataTable v-if="subTab === 'purchases'" :value="orders" :loading="ordersLoading" data-key="id"
                       lazy paginator
                       :rows="ordersPageSize" :first="ordersPage * ordersPageSize"
                       :total-records="ordersTotal"
                       :rows-per-page-options="PAGE_SIZE_OPTIONS"
                       :paginator-template="PAGINATOR_TEMPLATE"
                       :current-page-report-template="PAGINATOR_REPORT"
                       @page="(ev: any) => { ordersPage = ev.page; ordersPageSize = ev.rows; loadOrders() }"
                       @row-click="(e: any) => selectedOrder = e.data"
                       :pt="{ bodyRow: { class: 'cursor-pointer' } }">
                <Column header="ID чека">
                    <template #body="{ data }">
                        <code class="text-xs bg-ink-50 rounded px-2 py-1">{{ data.code }}</code>
                    </template>
                </Column>
                <Column header="Дата / время" style="width: 200px">
                    <template #body="{ data }">
                        <span class="text-sm text-ink-700">{{ fmtDateTime(data.createdAt) }}</span>
                    </template>
                </Column>
                <Column header="Тип продажи" style="width: 180px">
                    <template #body>
                        <span class="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 text-emerald-600 px-3 py-1 text-xs font-bold">
                            <i class="pi pi-check text-[10px]" />Прямая продажа
                        </span>
                    </template>
                </Column>
                <Column header="Оплата" style="width: 160px">
                    <template #body="{ data }">
                        <span class="rounded-full px-3 py-1 text-xs font-bold"
                              :class="PAY_PILL[data.paymentStatus || 'unpaid']">
                            {{ PAY_LABEL[data.paymentStatus || 'unpaid'] }}
                        </span>
                    </template>
                </Column>
                <Column header="Сумма продажи" class="text-right" style="width: 180px">
                    <template #body="{ data }">
                        <span class="font-display font-bold">{{ fmtSum(data.total) }} <span class="text-xs text-ink-400">UZS</span></span>
                    </template>
                </Column>
            </DataTable>

            <DataTable v-else-if="subTab === 'transactions'" :value="txns" :loading="txnsLoading" data-key="id"
                       lazy paginator
                       :rows="txnsPageSize" :first="txnsPage * txnsPageSize"
                       :total-records="txnsTotal"
                       :rows-per-page-options="PAGE_SIZE_OPTIONS"
                       :paginator-template="PAGINATOR_TEMPLATE"
                       :current-page-report-template="PAGINATOR_REPORT"
                       @page="(ev: any) => { txnsPage = ev.page; txnsPageSize = ev.rows; loadTxns() }">
                <Column header="Код">
                    <template #body="{ data }">
                        <code class="text-xs bg-ink-50 rounded px-2 py-1">{{ data.code }}</code>
                    </template>
                </Column>
                <Column header="Заказ" style="width: 140px">
                    <template #body="{ data }">
                        <span v-if="data.order?.code" class="text-xs text-ink-600">#{{ data.order.code }}</span>
                        <span v-else class="text-ink-300">—</span>
                    </template>
                </Column>
                <Column header="Тип" style="width: 120px">
                    <template #body="{ data }">
                        <span class="rounded-full px-3 py-1 text-xs font-bold"
                              :class="data.kind === 'payment' ? 'bg-emerald-500/15 text-emerald-600' : 'bg-tomato-500/15 text-tomato-500'">
                            {{ TXN_KIND_LABEL[data.kind] || data.kind }}
                        </span>
                    </template>
                </Column>
                <Column header="Способ" style="width: 120px">
                    <template #body="{ data }">
                        <span class="text-sm text-ink-700">{{ TXN_METHOD_LABEL[data.method] || data.method }}</span>
                    </template>
                </Column>
                <Column header="Дата" style="width: 180px">
                    <template #body="{ data }">
                        <span class="text-sm text-ink-600">{{ fmtDateTime(data.paidAt || data.createdAt) }}</span>
                    </template>
                </Column>
                <Column header="Сумма" class="text-right" style="width: 160px">
                    <template #body="{ data }">
                        <span class="font-display font-bold" :class="data.kind === 'refund' ? 'text-tomato-500' : ''">
                            {{ data.kind === 'refund' ? '−' : '' }}{{ fmtSum(data.amount) }}
                            <span class="text-xs text-ink-400">{{ data.currency || 'UZS' }}</span>
                        </span>
                    </template>
                </Column>
                <Column header="Статус" style="width: 120px">
                    <template #body="{ data }">
                        <span class="text-xs font-semibold"
                              :class="data.status === 'cancelled' ? 'text-ink-400 line-through' : 'text-ink-700'">
                            {{ data.status === 'cancelled' ? 'Отменена' : 'Проведена' }}
                        </span>
                    </template>
                </Column>
            </DataTable>
        </div>
    </div>

    <!-- Order drawer -->
    <Drawer :visible="!!selectedOrder" @update:visible="(v: boolean) => { if (!v) selectedOrder = null }"
            position="right" :style="{ width: '440px' }">
        <template #header>
            <div v-if="selectedOrder" class="flex items-center gap-2 min-w-0">
                <span class="font-display font-black text-lg">#{{ selectedOrder.code }}</span>
            </div>
        </template>
        <div v-if="selectedOrder" class="space-y-5">
            <div class="text-xs text-ink-400">
                ID чека · {{ fmtDateTime(selectedOrder.createdAt) }} · {{ selectedOrder.items?.length ?? 0 }} позиций
            </div>

            <div v-if="selectedOrder.items?.length">
                <div class="text-xs font-bold uppercase text-ink-400 mb-2">Товары</div>
                <div class="space-y-2">
                    <div v-for="(it, i) in selectedOrder.items" :key="i"
                         class="flex items-start gap-3 py-2 border-b border-ink-100 last:border-0">
                        <span class="shrink-0 size-6 rounded bg-ink-100 flex items-center justify-center text-xs font-bold">{{ it.qty }}</span>
                        <div class="flex-1 min-w-0">
                            <div class="font-semibold text-sm">{{ it.name }}</div>
                        </div>
                        <div class="shrink-0 font-bold text-sm">{{ fmtSum(Number(it.price) * Number(it.qty)) }} <span class="text-xs text-ink-400">UZS</span></div>
                    </div>
                </div>
            </div>

            <div class="pt-4 border-t-2 border-ink-100 space-y-1">
                <div class="flex items-center justify-between">
                    <span class="text-sm text-ink-600">Оплачено</span>
                    <span class="font-bold">{{ fmtSum(selectedOrder.paidAmount) }} <span class="text-xs text-ink-400">UZS</span></span>
                </div>
                <div class="flex items-center justify-between">
                    <span class="font-display font-bold">Всего</span>
                    <span class="font-display font-black text-xl">{{ fmtSum(selectedOrder.total) }} <span class="text-xs text-ink-400">UZS</span></span>
                </div>
            </div>
        </div>
    </Drawer>

    <!-- Edit dialog -->
    <ClientFormDialog v-model:visible="dialog" :client="client" @saved="onSaved" />
</template>
