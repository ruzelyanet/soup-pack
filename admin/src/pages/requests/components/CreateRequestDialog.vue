<script setup lang="ts">
import { reactive, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import { Requests } from '@/services/requests'
import type { RequestType } from '@/services/resources'
import { useToast } from 'primevue/usetoast'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{
    (e: 'update:visible', v: boolean): void
    (e: 'created'): void
}>()

const toast = useToast()

const form = reactive({
    type: 'individual' as RequestType,
    name: '',
    phone: '',
    comment: '',
    sourceDetail: '',
})
const loading = { current: false }

watch(() => props.visible, (v) => {
    if (v) {
        form.type = 'individual'
        form.name = ''
        form.phone = ''
        form.comment = ''
        form.sourceDetail = ''
    }
})

async function save() {
    if (!form.name.trim() || !form.phone.trim()) {
        toast.add({ severity: 'warn', summary: 'Нужны имя и телефон', life: 2500 })
        return
    }
    loading.current = true
    try {
        await Requests.create({
            type: form.type,
            name: form.name.trim(),
            phone: form.phone.trim(),
            comment: form.comment.trim() || undefined,
            sourceDetail: form.sourceDetail.trim() || undefined,
        })
        emit('created')
        emit('update:visible', false)
        toast.add({ severity: 'success', summary: 'Заявка создана', life: 1800 })
    } catch (e: any) {
        toast.add({
            severity: 'error',
            summary: 'Не удалось создать',
            detail: e?.response?.data?.error?.message || e?.message,
            life: 3500,
        })
    } finally {
        loading.current = false
    }
}
</script>

<template>
    <Dialog :visible="visible" @update:visible="(v) => emit('update:visible', v)"
            modal header="Новая заявка" :style="{ width: '440px' }" dismissable-mask>
        <div class="space-y-3">
            <div>
                <label class="text-xs font-bold uppercase tracking-wider text-ink-400">Тип</label>
                <div class="mt-1 grid grid-cols-2 gap-2">
                    <button type="button"
                            class="rounded-xl py-2.5 text-sm font-semibold border transition"
                            :class="form.type === 'individual' ? 'bg-ink-900 text-cream-50 border-ink-900' : 'border-ink-200 hover:border-ink-400'"
                            @click="form.type = 'individual'">Физлицо</button>
                    <button type="button"
                            class="rounded-xl py-2.5 text-sm font-semibold border transition"
                            :class="form.type === 'shop' ? 'bg-ink-900 text-cream-50 border-ink-900' : 'border-ink-200 hover:border-ink-400'"
                            @click="form.type = 'shop'">Магазин</button>
                </div>
            </div>
            <div>
                <label class="text-xs font-bold uppercase tracking-wider text-ink-400">Имя *</label>
                <input v-model="form.name"
                       class="mt-1 w-full rounded-xl border border-ink-200 px-4 py-2.5 focus:outline-none focus:border-ink-900" />
            </div>
            <div>
                <label class="text-xs font-bold uppercase tracking-wider text-ink-400">Телефон *</label>
                <input v-model="form.phone" placeholder="+998 __ ___ __ __"
                       class="mt-1 w-full rounded-xl border border-ink-200 px-4 py-2.5 focus:outline-none focus:border-ink-900" />
            </div>
            <div>
                <label class="text-xs font-bold uppercase tracking-wider text-ink-400">Источник</label>
                <input v-model="form.sourceDetail" placeholder="instagram / site / звонок / …"
                       class="mt-1 w-full rounded-xl border border-ink-200 px-4 py-2.5 focus:outline-none focus:border-ink-900" />
            </div>
            <div>
                <label class="text-xs font-bold uppercase tracking-wider text-ink-400">Комментарий</label>
                <textarea v-model="form.comment" rows="3"
                          class="mt-1 w-full rounded-xl border border-ink-200 px-4 py-2.5 focus:outline-none focus:border-ink-900"></textarea>
            </div>
        </div>
        <template #footer>
            <Button label="Отмена" severity="secondary" outlined @click="emit('update:visible', false)" />
            <Button label="Создать" icon="pi pi-check" @click="save" />
        </template>
    </Dialog>
</template>
