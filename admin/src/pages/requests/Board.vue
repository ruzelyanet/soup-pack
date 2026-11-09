<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import { useToast } from 'primevue/usetoast'
import AppTopbar from '@/components/AppTopbar.vue'
import BoardColumn from './components/BoardColumn.vue'
import CreateRequestDialog from './components/CreateRequestDialog.vue'
import ColumnDialog from './components/ColumnDialog.vue'
import ColumnGoalsDialog from './components/ColumnGoalsDialog.vue'
import { Requests } from '@/services/requests'
import { Settings } from '@/services/settings'
import type { RequestColumn, RequestRow, RequestType } from '@/services/resources'
import { useAuth } from '@/stores/auth'
import { useRequestsFeed } from '@/stores/requestsFeed'

const router = useRouter()
const auth = useAuth()
const toast = useToast()
const feed = useRequestsFeed()

const columns = ref<RequestColumn[]>([])
const items = ref<RequestRow[]>([])
const loading = ref(true)
const typeFilter = ref<RequestType | 'all'>('all')
const scope = ref<'all' | 'mine'>(auth.role === 'manager' ? 'all' : 'mine')
const sla = ref<{ yellowAfterMin: number; redAfterMin: number }>({ yellowAfterMin: 10, redAfterMin: 30 })

const flashIds = ref<number[]>([])
const dragging = ref(false)
const pendingWhileDragging: Array<() => void> = []
const pendingIds = new Set<number>()
let batchTimer: number | null = null

const createOpen = ref(false)
const columnDlgOpen = ref(false)
const columnDlgInitialId = ref<number | null>(null)
const goalsDlgOpen = ref(false)
const goalsDlgColumnId = ref<number | null>(null)

const canManage = computed(() => auth.role === 'manager')

function listParams(extra: Record<string, any> = {}): Record<string, any> {
    const params: Record<string, any> = { outcome: 'open', ...extra }
    if (typeFilter.value !== 'all') params.type = typeFilter.value
    if (auth.role === 'duty' && scope.value === 'mine') params.scope = 'mine'
    else if (auth.role === 'duty') params.scope = 'all'
    else params.scope = scope.value === 'mine' ? 'mine' : 'all'
    return params
}

async function fetchAll() {
    try {
        const [cols, rows] = await Promise.all([
            Requests.listColumns(),
            Requests.list(listParams()),
        ])
        columns.value = cols.sort((a, b) => a.position - b.position)
        items.value = rows
    } catch (e: any) {
        if (e?.response?.status === 401) return
        toast.add({ severity: 'error', summary: 'Не удалось загрузить', detail: e?.message, life: 3000 })
    } finally {
        loading.value = false
    }
}

/** Догрузить одну или несколько конкретных заявок c текущими фильтрами
 *  → upsert или удаление, если под фильтр не подходят. */
async function reloadIds(ids: number[]) {
    if (!ids.length) return
    try {
        const rows = await Requests.list(listParams({ ids }))
        const byId = new Map(rows.map((r) => [r.id, r]))
        for (const id of ids) {
            const next = byId.get(id)
            const idx = items.value.findIndex((r) => r.id === id)
            if (next) {
                const isNew = idx < 0
                if (idx >= 0) items.value.splice(idx, 1, next)
                else items.value.push(next)
                if (isNew) {
                    flashIds.value = [...flashIds.value, id]
                    setTimeout(() => { flashIds.value = flashIds.value.filter((x) => x !== id) }, 4000)
                }
            } else if (idx >= 0) {
                items.value.splice(idx, 1)
            }
        }
    } catch { /* сервер мог ещё не отдать — следующая сверка подхватит */ }
}

function queueId(id: number) {
    pendingIds.add(id)
    if (batchTimer != null) return
    batchTimer = window.setTimeout(async () => {
        batchTimer = null
        const ids = Array.from(pendingIds).slice(0, 50)
        pendingIds.clear()
        if (dragging.value) {
            pendingWhileDragging.push(() => reloadIds(ids))
            return
        }
        await reloadIds(ids)
    }, 250)
}

function requestsByColumn(colId: number): RequestRow[] {
    return items.value
        .filter((r) => r.column?.id === colId)
        .sort((a, b) => a.position - b.position)
}

function canAccept(req: RequestRow): boolean {
    if (!auth.role || auth.role === 'courier') return false
    if (req.acceptedById) return false
    return true
}

async function onAccept(req: RequestRow) {
    try {
        await Requests.accept(req.id)
        await fetchAll()
        toast.add({ severity: 'success', summary: 'Принята', life: 1500 })
    } catch (e: any) {
        const code = e?.response?.data?.error?.message
        if (e?.response?.status === 409 || code === 'ALREADY_TAKEN') {
            toast.add({
                severity: 'warn',
                summary: 'Заявку уже приняли',
                detail: 'Другой сотрудник оказался быстрее',
                life: 3000,
            })
            await fetchAll()
        } else {
            toast.add({ severity: 'error', summary: 'Ошибка', detail: code || e?.message, life: 3000 })
        }
    }
}

function onOpen(req: RequestRow) {
    router.push(`/requests/${req.id}`)
}

function onConvert(req: RequestRow) {
    // Создание заказа из заявки — будет в фазе 3; пока отправляем на страницу заявки.
    router.push(`/requests/${req.id}`)
}

async function onDrop(payload: { requestId: number; columnId: number }) {
    const req = items.value.find((r) => r.id === payload.requestId)
    if (!req) return
    if (req.column?.id === payload.columnId) return
    // Оптимистично перенесём.
    const prevColumnId = req.column?.id
    req.column = columns.value.find((c) => c.id === payload.columnId) || req.column
    dragging.value = true
    try {
        await Requests.move(req.id, payload.columnId, null)
    } catch (e: any) {
        const code = e?.response?.data?.error?.message
        req.column = columns.value.find((c) => c.id === prevColumnId) || req.column
        toast.add({ severity: 'warn', summary: 'Нельзя перенести', detail: code || e?.message, life: 3000 })
    } finally {
        dragging.value = false
        for (const fn of pendingWhileDragging.splice(0)) try { fn() } catch { /* noop */ }
    }
}

function openColumnDialog(id: number | null) {
    columnDlgInitialId.value = id
    columnDlgOpen.value = true
}

function openGoalsDialog(colId: number) {
    goalsDlgColumnId.value = colId
    goalsDlgOpen.value = true
}

async function fetchSla() {
    try {
        sla.value = await Settings.getSla()
    } catch { /* fallback по дефолтам */ }
}

const unseen = computed(() => feed.unseenIds)

const offs: Array<() => void> = []
onMounted(() => {
    fetchSla()
    fetchAll()
    offs.push(feed.onCreated((e) => queueId(e.requestId)))
    offs.push(feed.onUpdated((e) => queueId(e.requestId)))
    offs.push(feed.onReordered(() => fetchAll()))
    offs.push(feed.onResync(() => fetchAll()))
})
onUnmounted(() => {
    for (const off of offs) try { off() } catch { /* noop */ }
    if (batchTimer != null) clearTimeout(batchTimer)
})
</script>

<template>
    <AppTopbar title="Заявки" subtitle="Входящие обращения с конвейером">
        <template #actions>
            <Button v-if="canManage" label="Колонки" icon="pi pi-cog" severity="secondary" outlined @click="openColumnDialog(null)" />
            <Button label="Все заявки" icon="pi pi-list" severity="secondary" outlined @click="router.push('/requests/all')" />
            <Button label="+ Заявка" icon="pi pi-plus" @click="createOpen = true" />
        </template>
    </AppTopbar>

    <div class="px-8 py-4 flex items-center gap-3 flex-wrap">
        <div class="flex items-center gap-1 bg-ink-50 rounded-xl p-1">
            <button type="button" class="rounded-lg px-3 py-1.5 text-sm font-semibold"
                    :class="typeFilter === 'all' ? 'bg-ink-900 text-cream-50' : 'text-ink-500 hover:bg-ink-100'"
                    @click="typeFilter = 'all'; fetchAll()">Все типы</button>
            <button type="button" class="rounded-lg px-3 py-1.5 text-sm font-semibold"
                    :class="typeFilter === 'individual' ? 'bg-ink-900 text-cream-50' : 'text-ink-500 hover:bg-ink-100'"
                    @click="typeFilter = 'individual'; fetchAll()">Физлица</button>
            <button type="button" class="rounded-lg px-3 py-1.5 text-sm font-semibold"
                    :class="typeFilter === 'shop' ? 'bg-ink-900 text-cream-50' : 'text-ink-500 hover:bg-ink-100'"
                    @click="typeFilter = 'shop'; fetchAll()">Магазины</button>
        </div>

        <div class="flex items-center gap-1 bg-ink-50 rounded-xl p-1">
            <button type="button" class="rounded-lg px-3 py-1.5 text-sm font-semibold"
                    :class="scope === 'all' ? 'bg-ink-900 text-cream-50' : 'text-ink-500 hover:bg-ink-100'"
                    @click="scope = 'all'; fetchAll()">Все</button>
            <button type="button" class="rounded-lg px-3 py-1.5 text-sm font-semibold"
                    :class="scope === 'mine' ? 'bg-ink-900 text-cream-50' : 'text-ink-500 hover:bg-ink-100'"
                    @click="scope = 'mine'; fetchAll()">Мои</button>
        </div>
    </div>

    <div class="px-8 pb-8 overflow-x-auto">
        <div class="flex gap-3 min-h-[400px]">
            <BoardColumn
                v-for="col in columns"
                :key="col.id"
                :column="col"
                :requests="requestsByColumn(col.id)"
                :can-accept="canAccept"
                :can-manage="canManage"
                :is-new="col.kind === 'new'"
                :is-done="col.kind === 'done'"
                :yellow-after="sla.yellowAfterMin"
                :red-after="sla.redAfterMin"
                :unseen-ids="unseen"
                :flash-ids="flashIds"
                @accept="onAccept"
                @open="onOpen"
                @convert="onConvert"
                @drop="onDrop"
                @create-request="() => createOpen = true"
                @manage-goals="openGoalsDialog"
                @edit-column="(id) => openColumnDialog(id)"
            />
        </div>

        <div v-if="loading" class="mt-8 text-center text-ink-400 text-sm">Загрузка…</div>
    </div>

    <CreateRequestDialog v-model:visible="createOpen" @created="fetchAll" />

    <ColumnDialog v-if="canManage"
                  v-model:visible="columnDlgOpen"
                  :columns="columns"
                  :initial-column-id="columnDlgInitialId"
                  @changed="fetchAll" />

    <ColumnGoalsDialog v-model:visible="goalsDlgOpen"
                       :column-id="goalsDlgColumnId"
                       :column-name="columns.find((c) => c.id === goalsDlgColumnId)?.name" />
</template>
