<script setup lang="ts">
import { ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import { Requests } from '@/services/requests'
import type { RequestColumn } from '@/services/resources'
import { useToast } from 'primevue/usetoast'

const props = defineProps<{
    visible: boolean
    columns: RequestColumn[]
    initialColumnId: number | null
}>()
const emit = defineEmits<{
    (e: 'update:visible', v: boolean): void
    (e: 'changed'): void
}>()

const toast = useToast()
const current = ref<RequestColumn | null>(null)
const draft = ref({ name: '', color: '#D63A1C', requireGoals: false })
const creating = ref(false)
const newName = ref('')

watch(() => props.visible, (v) => {
    if (!v) return
    const target = props.columns.find((c) => c.id === props.initialColumnId)
    current.value = target || null
    if (target) {
        draft.value = {
            name: target.name,
            color: target.color || '#D63A1C',
            requireGoals: Boolean(target.requireGoals),
        }
    }
    creating.value = false
    newName.value = ''
})

async function saveCurrent() {
    if (!current.value) return
    try {
        await Requests.updateColumn(current.value.id, {
            name: draft.value.name,
            color: draft.value.color,
            requireGoals: draft.value.requireGoals,
        })
        emit('changed')
        toast.add({ severity: 'success', summary: 'Сохранено', life: 1500 })
    } catch (e: any) {
        toast.add({ severity: 'error', summary: 'Ошибка', detail: e?.message, life: 3000 })
    }
}

async function removeCurrent() {
    if (!current.value || current.value.kind !== 'custom') return
    try {
        await Requests.deleteColumn(current.value.id)
        emit('changed')
        emit('update:visible', false)
        toast.add({ severity: 'success', summary: 'Удалена', life: 1500 })
    } catch (e: any) {
        const code = e?.response?.data?.error?.message
        if (code === 'COLUMN_NOT_EMPTY') {
            toast.add({ severity: 'warn', summary: 'Колонка не пуста', detail: 'Перенесите заявки и попробуйте снова', life: 3000 })
        } else {
            toast.add({ severity: 'error', summary: 'Ошибка', detail: code || e?.message, life: 3000 })
        }
    }
}

async function createNew() {
    if (!newName.value.trim()) return
    try {
        await Requests.createColumn({ name: newName.value.trim() })
        emit('changed')
        creating.value = false
        newName.value = ''
        toast.add({ severity: 'success', summary: 'Колонка создана', life: 1500 })
    } catch (e: any) {
        toast.add({ severity: 'error', summary: 'Ошибка', detail: e?.message, life: 3000 })
    }
}

function pick(c: RequestColumn) {
    current.value = c
    draft.value = {
        name: c.name,
        color: c.color || '#D63A1C',
        requireGoals: Boolean(c.requireGoals),
    }
}

async function moveLeft() {
    if (!current.value) return
    await moveBy(-1)
}
async function moveRight() {
    if (!current.value) return
    await moveBy(1)
}
async function moveBy(delta: number) {
    if (!current.value) return
    const customs = props.columns.filter((c) => c.kind === 'custom').sort((a, b) => a.position - b.position)
    const idx = customs.findIndex((c) => c.id === current.value!.id)
    if (idx < 0) return
    const to = idx + delta
    if (to < 0 || to >= customs.length) return
    const reordered = [...customs]
    const [removed] = reordered.splice(idx, 1)
    reordered.splice(to, 0, removed)
    try {
        await Requests.reorderColumns(reordered.map((c) => c.id))
        emit('changed')
    } catch (e: any) {
        toast.add({ severity: 'error', summary: 'Ошибка', detail: e?.message, life: 3000 })
    }
}
</script>

<template>
    <Dialog :visible="visible" @update:visible="(v) => emit('update:visible', v)"
            modal header="Колонки доски" :style="{ width: '640px' }" dismissable-mask>
        <div class="grid grid-cols-[200px_minmax(0,1fr)] gap-5 min-h-[320px]">
            <div class="space-y-1">
                <div v-for="c in columns" :key="c.id"
                     class="rounded-lg px-3 py-2 text-sm cursor-pointer flex items-center gap-2 transition border"
                     :class="current?.id === c.id ? 'border-ink-900 bg-ink-50' : 'border-transparent hover:bg-ink-50'"
                     @click="pick(c)">
                    <span class="size-2 rounded-full" :style="{ background: c.color || '#D63A1C' }"></span>
                    <span class="truncate flex-1">{{ c.name }}</span>
                    <span v-if="c.kind !== 'custom'" class="text-[10px] font-bold uppercase text-ink-400">{{ c.kind }}</span>
                </div>
                <button v-if="!creating" type="button"
                        class="w-full text-left rounded-lg px-3 py-2 text-sm text-tomato-500 hover:bg-tomato-500/10 transition"
                        @click="creating = true">
                    + Новая колонка
                </button>
                <div v-else class="flex gap-1">
                    <input v-model="newName" placeholder="Название"
                           class="flex-1 rounded-lg border border-ink-200 px-3 py-1.5 text-sm focus:outline-none focus:border-ink-900"
                           @keyup.enter="createNew" />
                    <button type="button" class="rounded-lg px-2 bg-tomato-500 text-cream-50 text-sm" @click="createNew">OK</button>
                </div>
            </div>

            <div v-if="current" class="space-y-3">
                <div>
                    <label class="text-xs font-bold uppercase tracking-wider text-ink-400">Название</label>
                    <input v-model="draft.name"
                           class="mt-1 w-full rounded-xl border border-ink-200 px-4 py-2.5 focus:outline-none focus:border-ink-900" />
                </div>
                <div>
                    <label class="text-xs font-bold uppercase tracking-wider text-ink-400">Цвет</label>
                    <input v-model="draft.color" type="color" class="mt-1 w-16 h-10 rounded-xl border border-ink-200" />
                </div>
                <label class="flex items-center gap-2 text-sm">
                    <input v-model="draft.requireGoals" type="checkbox" />
                    Требовать выполнения всех целей для выхода
                </label>

                <div class="pt-3 border-t border-ink-100 flex items-center gap-2">
                    <Button label="Сохранить" icon="pi pi-check" @click="saveCurrent" />
                    <Button v-if="current.kind === 'custom'" severity="secondary" outlined icon="pi pi-arrow-left" @click="moveLeft" />
                    <Button v-if="current.kind === 'custom'" severity="secondary" outlined icon="pi pi-arrow-right" @click="moveRight" />
                    <Button v-if="current.kind === 'custom'" severity="danger" outlined icon="pi pi-trash" @click="removeCurrent" />
                    <div v-if="current.kind !== 'custom'" class="text-xs text-ink-400 ml-auto">Системная колонка</div>
                </div>
            </div>
            <div v-else class="text-sm text-ink-400">Выберите колонку слева</div>
        </div>
        <template #footer>
            <Button label="Закрыть" severity="secondary" outlined @click="emit('update:visible', false)" />
        </template>
    </Dialog>
</template>
