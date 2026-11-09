<script setup lang="ts">
import { computed } from 'vue'
import type { RequestRow } from '@/services/resources'

const props = defineProps<{
    request: RequestRow
    canAccept: boolean
    canOpen?: boolean
    duplicateCode?: string | null
    isDone?: boolean
    yellowAfter?: number
    redAfter?: number
    isUnseen?: boolean
    flash?: boolean
}>()

const emit = defineEmits<{
    (e: 'accept', req: RequestRow): void
    (e: 'open', req: RequestRow): void
    (e: 'dragstart', req: RequestRow, ev: DragEvent): void
    (e: 'convert', req: RequestRow): void
}>()

const typeLabel = computed(() => props.request.type === 'shop' ? 'Магазин' : 'Физлицо')
const typeClass = computed(() =>
    props.request.type === 'shop'
        ? 'bg-saffron-300/80 text-ink-900'
        : 'bg-olive-500/15 text-olive-500',
)

const waitingMinutes = computed(() => {
    if (!props.request || props.request.acceptedAt) return null
    const t = new Date(props.request.createdAt).getTime()
    const now = Date.now()
    return Math.floor((now - t) / 60000)
})

const waitingColor = computed(() => {
    const m = waitingMinutes.value
    if (m == null) return ''
    const red = props.redAfter ?? 30
    const yellow = props.yellowAfter ?? 10
    if (m > red) return 'text-tomato-500'
    if (m > yellow) return 'text-saffron-300'
    return 'text-ink-400'
})

function onDragStart(ev: DragEvent) {
    ev.dataTransfer?.setData('text/plain', String(props.request.id))
    emit('dragstart', props.request, ev)
}
</script>

<template>
    <article
        class="bg-white rounded-2xl p-3 border border-ink-100 shadow-sm cursor-grab active:cursor-grabbing hover:border-tomato-500/40 transition"
        :class="[flash ? 'rc-flash' : '']"
        draggable="true"
        @dragstart="onDragStart"
        @click="canOpen !== false && emit('open', request)"
    >
        <div class="flex items-center gap-2 mb-1.5">
            <span class="text-[10px] font-bold uppercase tracking-wider text-ink-400">{{ request.code }}</span>
            <span v-if="isUnseen" class="rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase bg-tomato-500 text-cream-50">Новая</span>
            <span class="rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase" :class="typeClass">{{ typeLabel }}</span>
            <span v-if="duplicateCode" class="rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase bg-tomato-500/15 text-tomato-500" :title="`Открытая заявка ${duplicateCode}`">
                Дубль
            </span>
            <span v-if="waitingMinutes != null" :class="`ml-auto text-[11px] font-semibold ${waitingColor}`">
                {{ waitingMinutes }}м
            </span>
        </div>
        <div class="font-semibold text-sm truncate">{{ request.name }}</div>
        <div class="text-xs text-ink-400 truncate">{{ request.phone }}</div>

        <div v-if="request.assignee" class="mt-2 flex items-center gap-1.5 text-xs text-ink-500">
            <i class="pi pi-user text-[10px]"></i>
            <span class="truncate">{{ request.assignee.fullName }}</span>
        </div>

        <div class="mt-3 flex items-center gap-2">
            <button v-if="!request.acceptedAt && canAccept"
                    type="button"
                    class="flex-1 rounded-lg bg-tomato-500 hover:bg-tomato-600 text-cream-50 text-xs font-semibold py-2 transition"
                    @click.stop="emit('accept', request)">
                Принять
            </button>
            <button v-if="isDone"
                    type="button"
                    class="flex-1 rounded-lg bg-olive-500 hover:bg-olive-600 text-cream-50 text-xs font-semibold py-2 transition"
                    @click.stop="emit('convert', request)">
                Создать заказ
            </button>
        </div>
    </article>
</template>

<style scoped>
@keyframes rc-flash-kf {
    0%   { background-color: rgba(209, 72, 54, 0.18); }
    100% { background-color: #fff; }
}
.rc-flash { animation: rc-flash-kf 3.5s ease-out 1; }
</style>
