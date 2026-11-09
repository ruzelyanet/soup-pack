<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import DataTable from 'primevue/datatable'
import InputText from 'primevue/inputtext'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import FloatLabel from 'primevue/floatlabel'
import { PAGINATOR_TEMPLATE, PAGINATOR_REPORT, PAGE_SIZE_OPTIONS, DEFAULT_PAGE_SIZE as PAGE_SIZE } from '@/utils/paginator'
import Column from 'primevue/column'
import AppTopbar from '@/components/AppTopbar.vue'
import { Requests } from '@/services/requests'
import type { RequestColumn, RequestRow } from '@/services/resources'
import { useRequestsFeed } from '@/stores/requestsFeed'

const router = useRouter()
const feed = useRequestsFeed()

const columns = ref<RequestColumn[]>([])
const items = ref<RequestRow[]>([])
const loading = ref(true)

const type = ref<string>('')
const outcome = ref<string>('')
const columnId = ref<string>('')
const q = ref('')

const notInFilter = ref(0)       // новых заявок, не прошедших текущие фильтры
const newWhileScrolled = ref(0)  // новых строк, пока прокручены вниз
const tableWrap = ref<HTMLElement | null>(null)
const pendingIds = new Set<number>()
let batchTimer: number | null = null

const typeLabel: Record<string, string> = { individual: 'Физлицо', shop: 'Магазин' }
const outcomeLabel: Record<string, string> = { open: 'Открыта', converted: 'В заказе', lost: 'Закрыта' }

const columnName = computed(() => {
    const map: Record<number, string> = {}
    columns.value.forEach((c) => (map[c.id] = c.name))
    return map
})

function listParams(extra: Record<string, any> = {}): Record<string, any> {
    const p: Record<string, any> = { scope: 'all', ...extra }
    if (type.value) p.type = type.value
    if (outcome.value) p.outcome = outcome.value
    if (columnId.value) p.columnId = Number(columnId.value)
    if (q.value.trim()) p.q = q.value.trim()
    return p
}

const page = ref(0)
const pageSize = ref(PAGE_SIZE)
const total = ref(0)

async function fetchAll() {
    loading.value = true
    try {
        const [cols, res] = await Promise.all([
            Requests.listColumns(),
            Requests.listPaged(listParams({ page: page.value + 1, pageSize: pageSize.value })),
        ])
        columns.value = cols
        items.value = res.data.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
        total.value = res.meta?.pagination.total ?? items.value.length
    } finally {
        loading.value = false
    }
}

async function reloadIds(ids: number[]) {
    if (!ids.length) return
    try {
        const rows = await Requests.list(listParams({ ids }))
        const scrolledDown = (tableWrap.value?.scrollTop ?? 0) > 200
        const byId = new Map(rows.map((r) => [r.id, r]))
        for (const id of ids) {
            const next = byId.get(id)
            const idx = items.value.findIndex((r) => r.id === id)
            if (next) {
                if (idx >= 0) items.value.splice(idx, 1, next)
                else {
                    items.value.unshift(next)
                    if (scrolledDown) newWhileScrolled.value += 1
                }
            } else {
                if (idx >= 0) items.value.splice(idx, 1)
                else notInFilter.value += 1
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
    }, 250)
}

function openRow(ev: { data: RequestRow }) {
    router.push(`/requests/${ev.data.id}`)
}

function scrollToTop() {
    newWhileScrolled.value = 0
    tableWrap.value?.scrollTo({ top: 0, behavior: 'smooth' })
}

function resetFilters() {
    notInFilter.value = 0
    type.value = ''
    outcome.value = ''
    columnId.value = ''
    q.value = ''
}

watch([type, outcome, columnId], () => { notInFilter.value = 0; page.value = 0; fetchAll() })
watch([page, pageSize], fetchAll)

const offs: Array<() => void> = []
onMounted(() => {
    fetchAll()
    offs.push(feed.onCreated((e) => queueId(e.requestId)))
    offs.push(feed.onUpdated((e) => queueId(e.requestId)))
    offs.push(feed.onResync(() => { notInFilter.value = 0; fetchAll() }))
})
onBeforeUnmount(() => {
    for (const off of offs) try { off() } catch { /* noop */ }
    if (batchTimer != null) clearTimeout(batchTimer)
})
</script>

<template>
    <AppTopbar title="Все заявки" subtitle="Фильтруемая таблица" back="/requests" />

    <div class="p-8 space-y-4">
        <div class="flex flex-wrap items-center gap-3">
            <div class="flex-1 min-w-[260px]">
                <FloatLabel variant="on">
                    <IconField>
                        <InputIcon class="pi pi-search" />
                        <InputText id="requests-search" v-model.trim="q"
                                   class="w-full pl-10" :class="q ? 'pr-10' : ''"
                                   @keyup.enter="fetchAll" />
                        <InputIcon v-if="q" class="pi pi-times cursor-pointer"
                                   @click="q = ''" />
                    </IconField>
                    <label for="requests-search">Поиск: имя, телефон, код</label>
                </FloatLabel>
            </div>
            <select v-model="type" class="rounded-xl border border-ink-200 px-3 py-2.5 bg-white">
                <option value="">Все типы</option>
                <option value="individual">Физлица</option>
                <option value="shop">Магазины</option>
            </select>
            <select v-model="outcome" class="rounded-xl border border-ink-200 px-3 py-2.5 bg-white">
                <option value="">Любой исход</option>
                <option value="open">Открытые</option>
                <option value="converted">В заказе</option>
                <option value="lost">Закрытые</option>
            </select>
            <select v-model="columnId" class="rounded-xl border border-ink-200 px-3 py-2.5 bg-white">
                <option value="">Все колонки</option>
                <option v-for="c in columns" :key="c.id" :value="String(c.id)">{{ c.name }}</option>
            </select>
        </div>

        <div v-if="notInFilter > 0"
             class="rounded-xl bg-saffron-300/15 text-ink-700 text-sm px-4 py-2 flex items-center gap-3">
            <i class="pi pi-filter text-saffron-500"></i>
            <span>{{ notInFilter }} новых заявок не попадают в фильтр</span>
            <button class="ml-auto text-xs font-semibold text-tomato-500 hover:underline"
                    type="button" @click="resetFilters">
                Сбросить фильтры
            </button>
        </div>

        <div ref="tableWrap" class="relative bg-white rounded-2xl overflow-auto max-h-[calc(100vh-240px)]">
            <button v-if="newWhileScrolled > 0"
                    type="button"
                    class="sticky top-2 ml-auto mr-2 z-10 rounded-full bg-ink-900 text-cream-50 text-xs font-semibold px-3 py-1.5 shadow-lg hover:bg-ink-700 transition"
                    @click="scrollToTop">
                ↑ {{ newWhileScrolled }} новых
            </button>
            <DataTable :value="items" :loading="loading"
                       lazy paginator
                       :rows="pageSize" :first="page * pageSize"
                       :total-records="total"
                       :rows-per-page-options="PAGE_SIZE_OPTIONS"
                       :paginator-template="PAGINATOR_TEMPLATE"
                       :current-page-report-template="PAGINATOR_REPORT"
                       :row-class="() => 'cursor-pointer'"
                       data-key="id"
                       @page="(ev: any) => { page = ev.page; pageSize = ev.rows }"
                       @row-click="openRow">
                <Column header="Код" style="width: 110px">
                    <template #body="{ data }">
                        <div class="flex items-center gap-1.5">
                            <span>{{ (data as RequestRow).code }}</span>
                            <span v-if="feed.unseenIds.includes((data as RequestRow).id)"
                                  class="rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase bg-tomato-500 text-cream-50">
                                Новая
                            </span>
                        </div>
                    </template>
                </Column>
                <Column header="Тип" style="width: 110px">
                    <template #body="{ data }">{{ typeLabel[(data as RequestRow).type] }}</template>
                </Column>
                <Column header="Имя" field="name" />
                <Column header="Телефон" field="phone" style="width: 160px" />
                <Column header="Колонка" style="width: 180px">
                    <template #body="{ data }">
                        {{ columnName[(data as RequestRow).column?.id || 0] || '—' }}
                    </template>
                </Column>
                <Column header="Ответственный" style="width: 180px">
                    <template #body="{ data }">
                        {{ (data as RequestRow).assignee?.fullName || '—' }}
                    </template>
                </Column>
                <Column header="Исход" style="width: 120px">
                    <template #body="{ data }">
                        {{ outcomeLabel[(data as RequestRow).outcome] }}
                    </template>
                </Column>
                <Column header="Создана" field="createdAt" :sortable="true" style="width: 170px">
                    <template #body="{ data }">
                        {{ new Date((data as RequestRow).createdAt).toLocaleString('ru-RU') }}
                    </template>
                </Column>
            </DataTable>
        </div>
    </div>
</template>
