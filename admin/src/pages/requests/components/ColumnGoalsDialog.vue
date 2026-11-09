<script setup lang="ts">
import { ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import { Requests } from '@/services/requests'
import type { RequestGoal } from '@/services/resources'
import { useToast } from 'primevue/usetoast'

const props = defineProps<{
    visible: boolean
    columnId: number | null
    columnName?: string
}>()
const emit = defineEmits<{
    (e: 'update:visible', v: boolean): void
    (e: 'changed'): void
}>()

const toast = useToast()
const goals = ref<RequestGoal[]>([])
const newText = ref('')
const editing = ref<Record<number, string>>({})

watch(
    () => [props.visible, props.columnId] as const,
    async ([v, id]) => {
        if (!v || !id) return
        try {
            goals.value = await Requests.listGoals(id as number)
        } catch (e: any) {
            toast.add({ severity: 'error', summary: 'Ошибка', detail: e?.message, life: 3000 })
        }
    },
)

async function add() {
    if (!props.columnId || !newText.value.trim()) return
    try {
        const g = await Requests.createGoal(props.columnId, newText.value.trim())
        goals.value = [...goals.value, g]
        newText.value = ''
        emit('changed')
    } catch (e: any) {
        toast.add({ severity: 'error', summary: 'Ошибка', detail: e?.message, life: 3000 })
    }
}

async function save(g: RequestGoal) {
    if (!props.columnId) return
    const text = editing.value[g.id]?.trim()
    if (!text) return
    try {
        await Requests.updateGoal(props.columnId, g.id, { text })
        g.text = text
        delete editing.value[g.id]
        emit('changed')
    } catch (e: any) {
        toast.add({ severity: 'error', summary: 'Ошибка', detail: e?.message, life: 3000 })
    }
}

async function remove(g: RequestGoal) {
    if (!props.columnId) return
    if (!confirm(`Удалить цель «${g.text}»?`)) return
    try {
        await Requests.deleteGoal(props.columnId, g.id)
        goals.value = goals.value.filter((x) => x.id !== g.id)
        emit('changed')
    } catch (e: any) {
        toast.add({ severity: 'error', summary: 'Ошибка', detail: e?.message, life: 3000 })
    }
}
</script>

<template>
    <Dialog :visible="visible" @update:visible="(v) => emit('update:visible', v)"
            modal :header="`Цели · ${columnName || ''}`" :style="{ width: '520px' }" dismissable-mask>
        <div class="space-y-2 max-h-[50vh] overflow-y-auto">
            <div v-for="g in goals" :key="g.id"
                 class="rounded-xl border border-ink-100 bg-white px-3 py-2 flex items-center gap-2">
                <template v-if="editing[g.id] != null">
                    <input v-model="editing[g.id]"
                           class="flex-1 rounded-lg border border-ink-200 px-3 py-1.5 text-sm focus:outline-none focus:border-ink-900"
                           @keyup.enter="save(g)" />
                    <Button icon="pi pi-check" severity="secondary" outlined size="small" @click="save(g)" />
                    <Button icon="pi pi-times" severity="secondary" outlined size="small" @click="delete editing[g.id]" />
                </template>
                <template v-else>
                    <div class="flex-1 text-sm">{{ g.text }}</div>
                    <Button icon="pi pi-pencil" severity="secondary" text size="small" @click="editing[g.id] = g.text" />
                    <Button icon="pi pi-trash" severity="danger" text size="small" @click="remove(g)" />
                </template>
            </div>
            <div v-if="!goals.length" class="text-sm text-ink-400 py-2">Пока нет целей</div>
        </div>
        <div class="pt-3 flex gap-2 border-t border-ink-100 mt-3">
            <input v-model="newText" placeholder="Новая цель"
                   class="flex-1 rounded-xl border border-ink-200 px-4 py-2.5 focus:outline-none focus:border-ink-900"
                   @keyup.enter="add" />
            <Button label="Добавить" icon="pi pi-plus" @click="add" />
        </div>
        <template #footer>
            <Button label="Закрыть" severity="secondary" outlined @click="emit('update:visible', false)" />
        </template>
    </Dialog>
</template>
