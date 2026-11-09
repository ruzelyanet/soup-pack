<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import AppTopbar from '@/components/AppTopbar.vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Select from 'primevue/select'
import SelectButton from 'primevue/selectbutton'
import InputText from 'primevue/inputtext'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import FloatLabel from 'primevue/floatlabel'
import ReactiveFilter from '@/components/ReactiveFilter.vue'
import { PAGINATOR_TEMPLATE, PAGINATOR_REPORT, PAGE_SIZE_OPTIONS, DEFAULT_PAGE_SIZE } from '@/utils/paginator'
import PeriodPicker from '@/components/PeriodPicker.vue'
import Drawer from 'primevue/drawer'
import { useToast } from 'primevue/usetoast'
import { Transactions as TransactionsAPI } from '@/services/transactions'
import { Employees } from '@/services/resources'
import type { Employee, PaymentMethod, Transaction, TransactionsSummary } from '@/services/resources'
import { useAuth } from '@/stores/auth'

const toast = useToast()
const auth = useAuth()

const rows = ref<Transaction[]>([])
const summary = ref<TransactionsSummary | null>(null)
const loading = ref(true)

/** Период: по умолчанию `null` — «Все». */
const periodRange = ref<[Date, Date] | null>(null)

const ALL = 'all' as const
const method = ref<PaymentMethod | typeof ALL>(ALL)
const kind = ref<'payment' | 'refund' | typeof ALL>(ALL)
const status = ref<'completed' | 'cancelled' | typeof ALL>(ALL)
const orderSearch = ref('')
const txnSearch = ref('')

/** Серверная пагинация. */
const page = ref(1)
const pageSize = ref(DEFAULT_PAGE_SIZE)
const totalRecords = ref(0)

const employees = ref<Employee[]>([])
const receivedBy = ref<Employee | null>(null)

async function loadEmployees() {
    try { employees.value = await Employees.list({ 'pagination[pageSize]': 200 }) }
    catch { /* duty-роль может не иметь прав — просто скрываем список */ }
}

async function copyToClipboard(text: string) {
    if (!text) return
    try { await navigator.clipboard.writeText(text) } catch { /* noop */ }
    toast.add({ severity: 'success', summary: 'Скопировано', detail: text, life: 1200 })
}

async function load() {
    loading.value = true
    try {
        const range = periodRange.value
        const filters: any = {
            from: range?.[0]?.toISOString(),
            to:   range?.[1]?.toISOString(),
            method: method.value === ALL ? undefined : method.value,
            kind:   kind.value   === ALL ? undefined : kind.value,
            status: status.value === ALL ? undefined : status.value,
            employeeId: receivedBy.value?.id || undefined,
            orderCode: orderSearch.value.trim() || undefined,
            code: txnSearch.value.trim() || undefined,
            page: page.value,
            pageSize: pageSize.value,
        }
        const [list, sum] = await Promise.all([
            TransactionsAPI.list(filters),
            TransactionsAPI.summary({ from: filters.from, to: filters.to }),
        ])
        rows.value = list.data
        totalRecords.value = list.meta.pagination.total
        summary.value = sum
    } catch (e: any) {
        toast.add({ severity: 'error', summary: 'Ошибка', detail: e?.message, life: 3000 })
    } finally {
        loading.value = false
    }
}

/** Фильтры → сбрасываем на 1-ю страницу и грузим. */
function reloadFromFirstPage() { page.value = 1; load() }
watch([periodRange, method, kind, status, receivedBy, orderSearch, txnSearch],
      reloadFromFirstPage, { deep: true })
watch([page, pageSize], load)
onMounted(() => { load(); loadEmployees() })

function fmt(n: number) {
    return new Intl.NumberFormat('ru-RU').format(Math.round(Number(n || 0))) + ' сум'
}

const methodLabels: Record<string, string> = {
    cash: 'Наличные', card: 'Карта', click: 'Click', payme: 'Payme', transfer: 'Перевод',
}
const kindLabels: Record<string, string> = { payment: 'Оплата', refund: 'Возврат' }
const statusLabels: Record<string, string> = { completed: 'Проведена', cancelled: 'Сторно' }

const methodOptions = [
    { value: ALL, label: 'Все' },
    ...Object.entries(methodLabels).map(([value, label]) => ({ value, label })),
]
const kindOptions = [
    { value: ALL,       label: 'Все' },
    { value: 'payment', label: 'Оплата' },
    { value: 'refund',  label: 'Возврат' },
]
const statusOptions = [
    { value: ALL,         label: 'Все' },
    { value: 'completed', label: 'Проведена' },
    { value: 'cancelled', label: 'Сторно' },
]

const methodKeys = computed(() => Object.keys(summary.value?.byMethod || {}))

/** Единая реактивная модель фильтров — для ReactiveFilter. */
const filterForm = reactive({
    method, kind, status, periodRange,
    orderSearch, txnSearch, receivedBy,
})
function clearStaticFields() {
    txnSearch.value = ''
    receivedBy.value = null
}

/** Выделенная транзакция для сайдбара + связанные с тем же заказом. */
const open = ref<Transaction | null>(null)
const openRelated = ref<Transaction[]>([])
const relatedLoading = ref(false)

async function loadRelated(t: Transaction) {
    if (!t.order?.code) { openRelated.value = []; return }
    relatedLoading.value = true
    try {
        const res = await TransactionsAPI.list({ orderCode: t.order.code, pageSize: 100 })
        openRelated.value = res.data
    } catch {
        openRelated.value = []
    } finally {
        relatedLoading.value = false
    }
}

watch(open, (v) => {
    if (v) loadRelated(v); else openRelated.value = []
})

async function cancelTxn(t: Transaction) {
    const reason = prompt('Причина сторнирования?')
    if (!reason?.trim()) return
    try {
        await TransactionsAPI.cancel(t.id, reason.trim())
        toast.add({ severity: 'success', summary: 'Сторнировано', life: 1500 })
        await load()
    } catch (e: any) {
        toast.add({ severity: 'error', summary: 'Ошибка', detail: e?.response?.data?.error?.message || e?.message, life: 3000 })
    }
}
</script>

<template>
    <AppTopbar title="Транзакции" subtitle="Платежи, возвраты, сторно">
        <template #actions>
            <Button icon="pi pi-refresh" severity="secondary" @click="load" />
        </template>
    </AppTopbar>

    <div class="p-8 space-y-5">
        <!-- Основной фильтр со «закрывашкой» для редких полей. -->
        <div class="bg-white rounded-2xl p-4">
            <ReactiveFilter :form-data="filterForm"
                            :reactive-fields="['periodRange', 'orderSearch']"
                            :static-fields="['txnSearch', 'receivedBy']"
                            @clear-static-fields="clearStaticFields">
                <template #reactive-fields>
                    <div class="flex flex-wrap items-center gap-3">
                        <PeriodPicker v-model="periodRange"
                                      :periods="['null', 'this-year', 'this-month', 'this-week', 'today', 'other']" />
                        <div class="flex-1 min-w-[220px]">
                            <FloatLabel variant="on">
                                <IconField>
                                    <InputIcon class="pi pi-search" />
                                    <InputText id="txn-order" v-model.trim="orderSearch"
                                               class="w-full pl-10 font-mono"
                                               :class="orderSearch ? 'pr-10' : ''" />
                                    <InputIcon v-if="orderSearch"
                                               class="pi pi-times cursor-pointer"
                                               @click="orderSearch = ''" />
                                </IconField>
                                <label for="txn-order">Номер заказа</label>
                            </FloatLabel>
                        </div>
                    </div>
                </template>

                <template #static-fields>
                    <div class="flex flex-wrap items-center gap-3">
                        <div class="min-w-[220px]">
                            <FloatLabel variant="on">
                                <IconField>
                                    <InputIcon class="pi pi-search" />
                                    <InputText id="txn-code" v-model.trim="txnSearch"
                                               class="w-full pl-10 font-mono"
                                               :class="txnSearch ? 'pr-10' : ''" />
                                    <InputIcon v-if="txnSearch"
                                               class="pi pi-times cursor-pointer"
                                               @click="txnSearch = ''" />
                                </IconField>
                                <label for="txn-code">Код транзакции</label>
                            </FloatLabel>
                        </div>
                        <div class="flex-1 min-w-[220px]">
                            <FloatLabel variant="on">
                                <Select id="txn-received-by" v-model="receivedBy" :options="employees"
                                        option-label="fullName"
                                        filter show-clear
                                        :filter-placeholder="'Поиск по имени'"
                                        class="w-full" />
                                <label for="txn-received-by">Принял оплату</label>
                            </FloatLabel>
                        </div>
                    </div>
                </template>
            </ReactiveFilter>
        </div>

        <!-- Итоги по способам -->
        <div v-if="summary" class="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <div v-for="m in methodKeys" :key="m" class="bg-white rounded-2xl p-4">
                <div class="text-[10px] font-bold uppercase tracking-wider text-ink-400">{{ methodLabels[m] || m }}</div>
                <div class="font-display font-extrabold text-lg mt-1">{{ fmt(summary.byMethod[m].net) }}</div>
                <div class="text-[11px] text-ink-400 mt-0.5">
                    +{{ fmt(summary.byMethod[m].payments) }} / −{{ fmt(summary.byMethod[m].refunds) }}
                </div>
            </div>
            <div v-if="!methodKeys.length" class="col-span-5 text-sm text-ink-400 bg-white rounded-2xl p-4">
                За выбранный период нет транзакций.
            </div>
        </div>

        <!-- Таблица -->
        <div class="bg-white rounded-2xl overflow-hidden">
            <!-- Верхние (независимые) фильтры-чипы прямо над таблицей. -->
            <div class="p-4 border-b border-ink-100 flex flex-wrap items-center gap-3">
                <SelectButton v-model="method" :options="methodOptions"
                              option-label="label" option-value="value" :allow-empty="false" />
                <div class="self-stretch w-px bg-ink-100"></div>
                <SelectButton v-model="kind" :options="kindOptions"
                              option-label="label" option-value="value" :allow-empty="false" />
                <div class="self-stretch w-px bg-ink-100"></div>
                <SelectButton v-model="status" :options="statusOptions"
                              option-label="label" option-value="value" :allow-empty="false" />
            </div>
            <DataTable :value="rows" :loading="loading" data-key="id"
                       lazy paginator
                       :rows="pageSize" :first="(page - 1) * pageSize"
                       :total-records="totalRecords"
                       :rows-per-page-options="PAGE_SIZE_OPTIONS"
                       :paginator-template="PAGINATOR_TEMPLATE"
                       :current-page-report-template="PAGINATOR_REPORT"
                       @page="(ev: any) => { page = ev.page + 1; pageSize = ev.rows }"
                       @row-click="(ev: any) => open = ev.data"
                       :pt="{ bodyRow: { class: 'cursor-pointer hover:bg-cream-50/60 transition-colors' } }">
                <Column header="Код" style="width: 150px">
                    <template #body="{ data }">
                        <div class="inline-flex items-center gap-1.5">
                            <span class="font-mono text-xs">{{ (data as Transaction).code }}</span>
                            <button type="button" class="text-ink-400 hover:text-ink-900"
                                    title="Скопировать"
                                    @click.stop="copyToClipboard((data as Transaction).code)">
                                <i class="pi pi-copy text-[11px]"></i>
                            </button>
                        </div>
                    </template>
                </Column>
                <Column header="Дата" style="width: 170px">
                    <template #body="{ data }">
                        {{ new Date((data as Transaction).paidAt).toLocaleString('ru-RU') }}
                    </template>
                </Column>
                <Column header="Заказ" style="width: 170px">
                    <template #body="{ data }">
                        <div class="inline-flex items-center gap-1.5">
                            <span class="font-mono text-xs">{{ (data as Transaction).order?.code || '—' }}</span>
                            <button v-if="(data as Transaction).order?.code"
                                    type="button" class="text-ink-400 hover:text-ink-900"
                                    title="Скопировать номер"
                                    @click.stop="copyToClipboard((data as Transaction).order!.code!)">
                                <i class="pi pi-copy text-[11px]"></i>
                            </button>
                        </div>
                    </template>
                </Column>
                <Column header="Клиент">
                    <template #body="{ data }">
                        {{ (data as Transaction).client?.fullName || '—' }}
                    </template>
                </Column>
                <Column header="Тип" style="width: 100px">
                    <template #body="{ data }">
                        <span :class="(data as Transaction).kind === 'refund' ? 'text-tomato-500' : 'text-olive-500'">
                            {{ kindLabels[(data as Transaction).kind] }}
                        </span>
                    </template>
                </Column>
                <Column header="Способ" style="width: 110px">
                    <template #body="{ data }">
                        {{ methodLabels[(data as Transaction).method] }}
                    </template>
                </Column>
                <Column header="Сумма" style="width: 140px">
                    <template #body="{ data }">
                        <div class="font-semibold" :class="(data as Transaction).kind === 'refund' ? 'text-tomato-500' : ''">
                            {{ (data as Transaction).kind === 'refund' ? '−' : '+' }}{{ fmt(Number((data as Transaction).amount)) }}
                        </div>
                    </template>
                </Column>
                <Column header="Принял" style="width: 160px">
                    <template #body="{ data }">
                        {{ (data as Transaction).receivedBy?.fullName || '—' }}
                    </template>
                </Column>
                <Column header="Статус" style="width: 140px">
                    <template #body="{ data }">
                        <span class="text-xs rounded-full px-2 py-0.5"
                              :class="(data as Transaction).status === 'cancelled' ? 'bg-ink-100 text-ink-500' : 'bg-olive-500/15 text-olive-500'">
                            {{ statusLabels[(data as Transaction).status] }}
                        </span>
                        <Button v-if="auth.role === 'manager' && (data as Transaction).status === 'completed'"
                                label="Сторно" severity="danger" text size="small" class="ml-1"
                                @click.stop="cancelTxn(data as Transaction)" />
                    </template>
                </Column>
            </DataTable>
        </div>
    </div>

    <!-- Сайдбар с детализацией транзакции + связанные по тому же заказу -->
    <Drawer :visible="!!open" @update:visible="(v: boolean) => { if (!v) open = null }"
            position="right" :block-scroll="true"
            class="txn-details-drawer">
        <template #header>
            <div v-if="open" class="flex items-center gap-3 min-w-0 flex-1">
                <span class="font-mono text-sm font-semibold">{{ open.code }}</span>
                <span class="font-display font-extrabold text-lg"
                      :class="open.kind === 'refund' ? 'text-tomato-500' : 'text-olive-500'">
                    {{ open.kind === 'refund' ? '−' : '+' }}{{ fmt(Number(open.amount)) }}
                </span>
                <span class="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
                      :class="open.status === 'cancelled' ? 'bg-ink-100 text-ink-500' : 'bg-olive-500/15 text-olive-500'">
                    {{ statusLabels[open.status] }}
                </span>
            </div>
        </template>

        <div v-if="open" class="space-y-4">
            <!-- Основные поля -->
            <section class="bg-white rounded-2xl ring-1 ring-ink-100 p-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                    <div class="text-[10px] font-bold uppercase tracking-wider text-ink-400">Тип</div>
                    <div class="mt-0.5" :class="open.kind === 'refund' ? 'text-tomato-500' : 'text-olive-500'">
                        {{ kindLabels[open.kind] }}
                    </div>
                </div>
                <div>
                    <div class="text-[10px] font-bold uppercase tracking-wider text-ink-400">Способ</div>
                    <div class="mt-0.5">{{ methodLabels[open.method] }}</div>
                </div>
                <div>
                    <div class="text-[10px] font-bold uppercase tracking-wider text-ink-400">Дата</div>
                    <div class="mt-0.5">{{ new Date(open.paidAt).toLocaleString('ru-RU') }}</div>
                </div>
                <div>
                    <div class="text-[10px] font-bold uppercase tracking-wider text-ink-400">Принял</div>
                    <div class="mt-0.5">{{ open.receivedBy?.fullName || '—' }}</div>
                </div>
                <div class="col-span-2">
                    <div class="text-[10px] font-bold uppercase tracking-wider text-ink-400">Клиент</div>
                    <div class="mt-0.5">{{ open.client?.fullName || '—' }}</div>
                </div>
                <div v-if="open.comment" class="col-span-2">
                    <div class="text-[10px] font-bold uppercase tracking-wider text-ink-400">Комментарий</div>
                    <div class="mt-0.5 whitespace-pre-line">{{ open.comment }}</div>
                </div>
            </section>

            <!-- Заказ (ссылка) -->
            <section v-if="open.order" class="bg-white rounded-2xl ring-1 ring-ink-100 p-4 flex items-center gap-3">
                <div class="min-w-0 flex-1">
                    <div class="text-[10px] font-bold uppercase tracking-wider text-ink-400">Заказ</div>
                    <div class="mt-0.5 inline-flex items-center gap-1.5">
                        <span class="font-mono font-semibold">{{ open.order.code }}</span>
                        <button type="button" class="text-ink-400 hover:text-ink-900"
                                title="Скопировать номер"
                                @click="copyToClipboard(open.order.code)">
                            <i class="pi pi-copy text-[11px]"></i>
                        </button>
                    </div>
                </div>
                <RouterLink :to="{ name: 'order', params: { id: open.order.id } }"
                            class="inline-flex items-center gap-1.5 rounded-lg bg-ink-900 text-cream-50 text-xs font-semibold px-3 py-1.5 hover:bg-ink-700 no-underline">
                    <i class="pi pi-external-link text-[11px]"></i>Открыть заказ
                </RouterLink>
            </section>

            <!-- Связанные транзакции по тому же заказу -->
            <section class="bg-white rounded-2xl ring-1 ring-ink-100 p-4">
                <div class="flex items-baseline justify-between mb-2">
                    <h3 class="m-0 font-display font-bold text-sm">Все транзакции заказа</h3>
                    <span class="text-xs text-ink-400">{{ openRelated.length }}</span>
                </div>
                <div v-if="relatedLoading" class="text-xs text-ink-400">Загрузка…</div>
                <div v-else-if="!openRelated.length" class="text-xs text-ink-400">По этому заказу транзакций больше нет.</div>
                <ul v-else class="list-none m-0 p-0 divide-y divide-ink-100">
                    <li v-for="t in openRelated" :key="t.id"
                        class="py-2 flex items-center gap-2 text-xs cursor-pointer hover:bg-cream-50/60 -mx-2 px-2 rounded-md"
                        :class="[
                            t.status === 'cancelled' ? 'opacity-50 line-through' : '',
                            t.id === open.id ? 'bg-cream-50/80' : '',
                        ]"
                        @click="open = t">
                        <span class="font-mono">{{ t.code }}</span>
                        <span :class="t.kind === 'refund' ? 'text-tomato-500' : 'text-olive-500'">
                            {{ t.kind === 'refund' ? '−' : '+' }}{{ fmt(Number(t.amount)) }}
                        </span>
                        <span class="text-ink-400">{{ methodLabels[t.method] || t.method }}</span>
                        <span v-if="t.receivedBy" class="text-ink-400">· {{ t.receivedBy.fullName }}</span>
                        <span class="text-ink-400 ml-auto whitespace-nowrap">
                            {{ new Date(t.paidAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) }}
                        </span>
                    </li>
                </ul>
            </section>

            <!-- Действия -->
            <div v-if="auth.role === 'manager' && open.status === 'completed'">
                <Button label="Сторнировать транзакцию" icon="pi pi-ban" severity="danger" outlined
                        class="w-full" @click="cancelTxn(open)" />
            </div>
        </div>
    </Drawer>
</template>

<style>
.p-drawer.txn-details-drawer { width: 100% !important; }
@media (min-width: 1024px) { .p-drawer.txn-details-drawer { width: 720px !important; } }
@media (min-width: 1280px) { .p-drawer.txn-details-drawer { width: 860px !important; } }
</style>
