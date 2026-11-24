<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
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
const saving = ref(false)
const error = ref('')

/** Готовая палитра — та же, что в эталоне. */
const COLOR_PALETTE = [
    '#D63A1C', '#E88E1B', '#E0B914', '#3F7A2A',
    '#1E90FF', '#6F42C1', '#B4409C', '#2A1209',
]

const editingId = ref<number | null>(null)
const form = reactive({ name: '', color: COLOR_PALETTE[0], requireGoals: false })

watch(() => props.visible, (v) => {
    if (!v) return
    error.value = ''
    const target = props.columns.find((c) => c.id === props.initialColumnId) || null
    if (target) {
        editingId.value = target.id
        form.name = target.name
        form.color = target.color || COLOR_PALETTE[0]
        form.requireGoals = Boolean(target.requireGoals)
    } else {
        editingId.value = null
        form.name = ''
        form.color = COLOR_PALETTE[0]
        form.requireGoals = false
    }
})

async function onSubmit() {
    error.value = ''
    if (!form.name.trim()) {
        error.value = 'Укажите название колонки'
        return
    }
    saving.value = true
    try {
        const payload = {
            name: form.name.trim(),
            color: form.color,
            requireGoals: form.requireGoals,
        }
        if (editingId.value != null) {
            await Requests.updateColumn(editingId.value, payload)
        } else {
            await Requests.createColumn(payload)
        }
        emit('changed')
        emit('update:visible', false)
        toast.add({ severity: 'success', summary: editingId.value != null ? 'Сохранено' : 'Колонка создана', life: 1500 })
    } catch (e: any) {
        error.value = e?.response?.data?.error?.message || e?.message || 'Не удалось сохранить'
    } finally {
        saving.value = false
    }
}
</script>

<template>
    <Dialog :visible="visible" @update:visible="(v) => emit('update:visible', v)"
            modal :header="editingId != null ? 'Редактировать колонку' : 'Новая колонка'"
            :style="{ width: '380px' }" dismissable-mask>
        <form class="flex flex-col gap-4" @submit.prevent="onSubmit">
            <div>
                <label class="text-xs font-bold uppercase tracking-wider text-ink-400">Название</label>
                <InputText v-model="form.name" fluid class="mt-1" autofocus />
            </div>
            <div>
                <label class="text-xs font-bold uppercase tracking-wider text-ink-400">Цвет метки</label>
                <div class="mt-2 flex flex-wrap gap-2">
                    <button v-for="color in COLOR_PALETTE" :key="color"
                            type="button"
                            class="size-7 rounded-full border-2 transition cursor-pointer"
                            :class="form.color === color ? 'border-ink-900' : 'border-transparent'"
                            :style="{ background: color }"
                            @click="form.color = color" />
                </div>
            </div>
            <label class="flex items-center gap-2 text-sm">
                <input v-model="form.requireGoals" type="checkbox" class="size-4" />
                Требовать выполнения всех целей для выхода из колонки
            </label>

            <div v-if="error" class="text-sm text-tomato-600 bg-tomato-50 rounded px-3 py-2">
                {{ error }}
            </div>

            <div class="flex justify-end gap-2 pt-2">
                <Button type="button" label="Отмена" severity="secondary" outlined
                        @click="emit('update:visible', false)" />
                <Button type="submit" :label="editingId != null ? 'Сохранить' : 'Создать'" :loading="saving" />
            </div>
        </form>
    </Dialog>
</template>
