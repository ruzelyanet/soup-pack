<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'
import Toast, { type ToastMessageOptions } from 'primevue/toast'
import { useToast } from 'primevue/usetoast'
import { useRequestsFeed } from '@/stores/requestsFeed'
import type { RequestSummary } from '@/services/realtime'
import { playChime, showSystemNotification } from '@/services/notifyPrefs'

const GROUP = 'requests'
const MAX_TOASTS = 3
const LIFE_MS = 15_000
const SUMMARY_KEY = '__summary__'

type Kind = 'new' | 'overdue'
type Entry = {
    key: string
    kind: Kind
    requestId: number
    summary: RequestSummary
    at: number
    waitMin?: number
}

const toast = useToast()
const router = useRouter()
const feed = useRequestsFeed()

const entries = ref<Map<string, Entry>>(new Map())
const overflow = ref<Entry[]>([])
const tick = ref(0)
let tickTimer: number | null = null

const sourceLabel: Record<RequestSummary['source'], string> = {
    manual: 'Вручную', form: 'Форма на сайте', api: 'API',
}
const typeLabel: Record<RequestSummary['type'], string> = {
    individual: 'Физлицо', shop: 'Магазин',
}

function formatRel(fromMs: number): string {
    void tick.value // держим реактивность
    const diff = Math.max(0, Date.now() - fromMs)
    const min = Math.floor(diff / 60_000)
    if (min < 1) return 'только что'
    if (min < 60) return `${min} мин назад`
    return `${Math.floor(min / 60)} ч назад`
}

const summaryOverflowCount = computed(() => overflow.value.length)

function pushToast(entry: Entry) {
    entries.value.set(entry.key, entry)
    toast.add({
        group: GROUP,
        severity: entry.kind === 'overdue' ? 'warn' : 'info',
        summary: entry.key,
        life: LIFE_MS,
    })
}

function ensureSummaryToast() {
    if (toastExists(SUMMARY_KEY)) return
    toast.add({ group: GROUP, severity: 'info', summary: SUMMARY_KEY })
}

function toastExists(key: string): boolean {
    // PrimeVue не отдаёт список активных сообщений — ведём учёт сами.
    return key === SUMMARY_KEY ? overflow.value.length > 0 : entries.value.has(key)
}

function remove(key: string) {
    entries.value.delete(key)
    overflow.value = overflow.value.filter((e) => e.key !== key)
    // PrimeVue 4: удалить конкретный тост возможно только через toast.removeGroup —
    // но тосты закрываются по life, поэтому ждём автоудаления; если нужно скрыть
    // сразу, достаточно, что entries.get(key) === undefined — слот отрисует пусто.
}

function openRequest(id: number, key: string) {
    feed.markSeen(id)
    remove(key)
    router.push({ path: `/requests/${id}` })
}

function openAll() {
    overflow.value.splice(0)
    toast.removeGroup(GROUP)
    entries.value.clear()
    router.push({ path: '/requests' })
}

function onNew(e: { requestId: number; summary: RequestSummary }) {
    if (location.pathname.endsWith('/requests/' + e.requestId)) return
    const entry: Entry = {
        key: `new-${e.requestId}`,
        kind: 'new',
        requestId: e.requestId,
        summary: e.summary,
        at: Date.parse(e.summary.createdAt) || Date.now(),
    }
    if (entries.value.size >= MAX_TOASTS) {
        overflow.value.push(entry)
        ensureSummaryToast()
        return
    }
    pushToast(entry)
    if (feed.isLeader) {
        playChime()
        showSystemNotification(
            `Новая заявка · ${e.summary.code}`,
            `${typeLabel[e.summary.type]} · ${e.summary.name}`,
            () => openRequest(e.requestId, entry.key),
        )
    }
}

function onOverdue(e: { requestId: number; summary: RequestSummary }) {
    const at = Date.parse(e.summary.createdAt) || Date.now()
    const entry: Entry = {
        key: `overdue-${e.requestId}`,
        kind: 'overdue',
        requestId: e.requestId,
        summary: e.summary,
        at,
        waitMin: Math.round((Date.now() - at) / 60_000),
    }
    if (entries.value.has(entry.key)) return
    if (entries.value.size >= MAX_TOASTS) {
        overflow.value.push(entry)
        ensureSummaryToast()
        return
    }
    pushToast(entry)
    if (feed.isLeader) {
        playChime()
        showSystemNotification(
            `Заявка ждёт ${entry.waitMin} мин · ${e.summary.code}`,
            `${typeLabel[e.summary.type]} · ${e.summary.name}`,
            () => openRequest(e.requestId, entry.key),
        )
    }
}

function onUpdated(e: { requestId: number; kind: string }) {
    if (!['accepted', 'lost', 'converted'].includes(e.kind)) return
    remove(`new-${e.requestId}`)
    remove(`overdue-${e.requestId}`)
}

function onToastClose(ev: { message: ToastMessageOptions }) {
    const k = ev.message.summary as string
    if (!k || k === SUMMARY_KEY) {
        if (k === SUMMARY_KEY) overflow.value.splice(0)
        return
    }
    entries.value.delete(k)
}

let offCreated: (() => void) | null = null
let offOverdue: (() => void) | null = null
let offUpdated: (() => void) | null = null

onMounted(() => {
    offCreated = feed.onCreated(onNew)
    offOverdue = feed.onOverdue(onOverdue)
    offUpdated = feed.onUpdated(onUpdated)
    tickTimer = window.setInterval(() => { tick.value++ }, 30_000)
})
onBeforeUnmount(() => {
    offCreated?.(); offOverdue?.(); offUpdated?.()
    if (tickTimer != null) clearInterval(tickTimer)
})
</script>

<template>
    <Toast :group="GROUP" position="top-right" @close="onToastClose" @life-end="onToastClose">
        <template #message="slot">
            <template v-if="(slot.message.summary as string) === SUMMARY_KEY">
                <div v-if="summaryOverflowCount > 0" class="w-[320px]">
                    <div class="flex items-center gap-3 p-3 bg-white rounded-2xl shadow-lg ring-1 ring-ink-100">
                        <div class="w-10 h-10 rounded-xl inline-flex items-center justify-center bg-ink-100 text-ink-500 shrink-0">
                            <i class="pi pi-ellipsis-h text-base"></i>
                        </div>
                        <div class="min-w-0 flex-1">
                            <div class="font-display font-extrabold text-sm">+ ещё {{ summaryOverflowCount }} новых заявок</div>
                            <div class="text-[11px] text-ink-400 mt-0.5">Открой список, чтобы увидеть все</div>
                        </div>
                        <button class="rounded-lg bg-ink-900 text-cream-50 text-xs font-semibold px-3 py-1.5 hover:bg-ink-700 transition"
                                type="button" @click="openAll">
                            К заявкам
                        </button>
                    </div>
                </div>
            </template>
            <template v-else>
                <template v-for="entry in [entries.get(slot.message.summary as string)]" :key="entry?.key || 'nil'">
                    <div v-if="entry" class="w-[320px]">
                        <div class="flex items-start gap-3 p-3 bg-white rounded-2xl shadow-lg ring-1"
                             :class="entry.kind === 'overdue' ? 'ring-saffron-300/60' : 'ring-ink-100'">
                            <div class="w-10 h-10 rounded-xl inline-flex items-center justify-center shrink-0"
                                 :class="entry.kind === 'overdue' ? 'bg-saffron-300/30 text-saffron-500' : 'bg-tomato-500/15 text-tomato-500'">
                                <i :class="['pi', entry.kind === 'overdue' ? 'pi-clock' : 'pi-inbox', 'text-base']"></i>
                            </div>
                            <div class="min-w-0 flex-1">
                                <div class="flex items-baseline gap-2">
                                    <div class="font-display font-extrabold text-sm">
                                        {{ entry.kind === 'overdue' ? `Ждёт ${entry.waitMin} мин` : 'Новая заявка' }}
                                    </div>
                                    <code class="font-mono text-[11px] text-ink-500">{{ entry.summary.code }}</code>
                                    <span class="ml-auto text-[11px] text-ink-400 whitespace-nowrap">
                                        {{ formatRel(entry.at) }}
                                    </span>
                                </div>
                                <div class="text-sm text-ink-700 truncate mt-0.5">{{ entry.summary.name }}</div>
                                <div class="text-[11px] text-ink-400 mt-0.5 truncate">
                                    {{ typeLabel[entry.summary.type] }} ·
                                    {{ entry.summary.sourceDetail || sourceLabel[entry.summary.source] }}
                                </div>
                                <div class="mt-2 flex gap-2">
                                    <button class="rounded-lg bg-ink-900 text-cream-50 text-xs font-semibold px-3 py-1.5 hover:bg-ink-700 transition"
                                            type="button" @click="openRequest(entry.requestId, entry.key)">
                                        Открыть
                                    </button>
                                </div>
                            </div>
                            <button class="text-ink-300 hover:text-ink-500" type="button" @click="remove(entry.key)">
                                <i class="pi pi-times text-xs"></i>
                            </button>
                        </div>
                    </div>
                </template>
            </template>
        </template>
    </Toast>
</template>
