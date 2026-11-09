<script setup lang="ts">
import { ref } from 'vue'
import type { RequestColumn, RequestRow } from '@/services/resources'
import RequestCard from './RequestCard.vue'

const props = defineProps<{
    column: RequestColumn
    requests: RequestRow[]
    canAccept: (req: RequestRow) => boolean
    canManage?: boolean
    isDone?: boolean
    isNew?: boolean
    yellowAfter?: number
    redAfter?: number
    unseenIds?: number[]
    flashIds?: number[]
}>()

const emit = defineEmits<{
    (e: 'accept', req: RequestRow): void
    (e: 'open', req: RequestRow): void
    (e: 'convert', req: RequestRow): void
    (e: 'drop', payload: { requestId: number; columnId: number }): void
    (e: 'create-request', columnId: number): void
    (e: 'manage-goals', columnId: number): void
    (e: 'edit-column', columnId: number): void
}>()

const dragOver = ref(false)

function onDragEnter(ev: DragEvent) {
    ev.preventDefault()
    dragOver.value = true
}
function onDragOver(ev: DragEvent) {
    ev.preventDefault()
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move'
}
function onDragLeave() { dragOver.value = false }
function onDrop(ev: DragEvent) {
    ev.preventDefault()
    dragOver.value = false
    const rawId = ev.dataTransfer?.getData('text/plain')
    const id = Number(rawId)
    if (id > 0) emit('drop', { requestId: id, columnId: props.column.id })
}
</script>

<template>
    <section
        class="shrink-0 w-72 bg-ink-50 border border-ink-100 rounded-2xl flex flex-col max-h-[calc(100vh-180px)]"
        :class="dragOver ? 'ring-2 ring-tomato-500/40' : ''"
        @dragenter="onDragEnter"
        @dragover="onDragOver"
        @dragleave="onDragLeave"
        @drop="onDrop"
    >
        <header class="px-3 py-3 flex items-center gap-2 border-b border-ink-100">
            <span class="size-2 rounded-full shrink-0" :style="{ background: column.color || '#D63A1C' }"></span>
            <div class="font-display font-bold text-sm truncate flex-1">{{ column.name }}</div>
            <span class="text-xs font-semibold text-ink-400">{{ requests.length }}</span>

            <button v-if="canManage && !isNew && !isDone"
                    type="button"
                    class="rounded-md p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700 transition"
                    title="Цели колонки"
                    @click="emit('manage-goals', column.id)">
                <i class="pi pi-check-circle text-xs"></i>
            </button>
            <button v-if="canManage"
                    type="button"
                    class="rounded-md p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700 transition"
                    title="Настроить колонку"
                    @click="emit('edit-column', column.id)">
                <i class="pi pi-cog text-xs"></i>
            </button>
        </header>

        <div class="flex-1 overflow-y-auto px-2 py-2 space-y-2">
            <button v-if="isNew"
                    type="button"
                    class="w-full rounded-lg border-2 border-dashed border-ink-200 py-2.5 text-xs font-semibold text-ink-400 hover:border-tomato-500 hover:text-tomato-500 transition"
                    @click="emit('create-request', column.id)">
                + Заявка
            </button>

            <RequestCard
                v-for="req in requests"
                :key="req.id"
                :request="req"
                :can-accept="canAccept(req)"
                :duplicate-code="(req.extra as any)?.duplicateOf || null"
                :is-done="isDone"
                :yellow-after="yellowAfter"
                :red-after="redAfter"
                :is-unseen="unseenIds?.includes(req.id)"
                :flash="flashIds?.includes(req.id)"
                @accept="(r) => emit('accept', r)"
                @open="(r) => emit('open', r)"
                @convert="(r) => emit('convert', r)"
            />

            <div v-if="!requests.length && !isNew" class="text-center text-xs text-ink-400 py-4">
                Пусто
            </div>
        </div>
    </section>
</template>
