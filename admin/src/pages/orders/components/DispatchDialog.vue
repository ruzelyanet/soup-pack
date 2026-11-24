<script setup lang="ts">
import { ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import Select from 'primevue/select'
import {
    DeliveryMethods, Employees, dispatchOrder,
    type DeliveryMethod, type Employee, type Order,
} from '@/services/resources'
import { mediaUrl } from '@/services/api'
import { useToast } from 'primevue/usetoast'

const props = defineProps<{
    visible: boolean
    order: Order | null
}>()
const emit = defineEmits<{
    (e: 'update:visible', v: boolean): void
    (e: 'saved', updated: Order): void
}>()

const toast = useToast()
const methods = ref<DeliveryMethod[]>([])
const couriers = ref<Employee[]>([])
const selectedCode = ref<string>('')
const selectedCourierDocId = ref<string | null>(null)
const loading = ref(false)
const saving = ref(false)

async function loadAll() {
    loading.value = true
    try {
        const [m, c] = await Promise.all([
            DeliveryMethods.list({ sort: 'sort:asc', 'filters[active][$ne]': false }),
            Employees.listPaged({
                'filters[role][$eq]': 'courier',
                'filters[active][$ne]': false,
                populate: ['photo'],
                sort: 'fullName:asc',
                'pagination[pageSize]': 100,
            }),
        ])
        methods.value = m as DeliveryMethod[]
        couriers.value = c.data
    } finally {
        loading.value = false
    }
}

watch(() => props.visible, (v) => {
    if (!v) return
    selectedCode.value = props.order?.deliveryMethodCode || ''
    selectedCourierDocId.value = (props.order?.employee as any)?.documentId ?? null
    loadAll()
})

async function save() {
    if (!props.order) return
    if (!selectedCode.value) {
        toast.add({ severity: 'warn', summary: 'Выберите способ доставки', life: 1800 })
        return
    }
    saving.value = true
    try {
        const updated = await dispatchOrder(
            props.order.documentId,
            selectedCode.value,
            selectedCourierDocId.value || null,
        )
        emit('saved', updated)
        emit('update:visible', false)
        toast.add({ severity: 'success', summary: 'Доставка назначена', life: 1800 })
    } catch (e: any) {
        toast.add({ severity: 'error', summary: 'Ошибка', detail: e?.response?.data?.error?.message || e?.message, life: 2500 })
    } finally {
        saving.value = false
    }
}

function initials(name: string | undefined) {
    return (name || '').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase() || '—'
}
</script>

<template>
    <Dialog :visible="visible" @update:visible="(v: boolean) => emit('update:visible', v)"
            modal dismissable-mask header="Назначить доставку" :style="{ width: '520px' }"
            :pt="{ root: { class: 'rounded-2xl' } }">
        <div class="space-y-4">
            <div>
                <label class="text-xs font-bold uppercase tracking-wider text-ink-400">Способ доставки</label>
                <Select v-model="selectedCode" :options="methods" option-label="name" option-value="code"
                        placeholder="Выберите способ…" :loading="loading" fluid class="mt-1" />
                <div v-if="!loading && !methods.length" class="mt-1 text-xs text-tomato-500">
                    Нет активных способов. Создайте их в разделе «Способы доставки».
                </div>
            </div>

            <div v-if="selectedCode">
                <label class="text-xs font-bold uppercase tracking-wider text-ink-400">
                    Курьер
                    <span class="text-ink-300 font-normal normal-case">— опционально</span>
                </label>
                <div v-if="!couriers.length" class="mt-1 text-xs text-ink-400">
                    Нет активных курьеров. Добавьте в разделе Сотрудники.
                </div>
                <div v-else class="mt-1 space-y-1.5 max-h-[260px] overflow-y-auto">
                    <button type="button"
                            class="w-full text-left rounded-xl p-3 border flex items-center gap-3 transition"
                            :class="!selectedCourierDocId ? 'border-ink-900 bg-ink-50' : 'border-ink-200 hover:border-ink-400'"
                            @click="selectedCourierDocId = null">
                        <div class="size-10 rounded-full bg-ink-100 text-ink-400 flex items-center justify-center shrink-0">
                            <i class="pi pi-ban" />
                        </div>
                        <div class="flex-1 text-sm font-semibold">Без назначения курьера</div>
                        <i v-if="!selectedCourierDocId" class="pi pi-check text-ink-900" />
                    </button>
                    <button v-for="c in couriers" :key="c.id" type="button"
                            class="w-full text-left rounded-xl p-3 border flex items-center gap-3 transition"
                            :class="selectedCourierDocId === c.documentId ? 'border-ink-900 bg-ink-50' : 'border-ink-200 hover:border-ink-400'"
                            @click="selectedCourierDocId = c.documentId">
                        <img v-if="c.photo?.url" :src="mediaUrl(c.photo.url)" alt=""
                             class="size-10 rounded-full object-cover shrink-0" />
                        <div v-else class="size-10 rounded-full bg-ink-900 text-cream-50 flex items-center justify-center text-xs font-bold shrink-0">
                            {{ initials(c.fullName) }}
                        </div>
                        <div class="flex-1 min-w-0">
                            <div class="font-semibold truncate">{{ c.fullName }}</div>
                            <div class="text-xs text-ink-400">{{ c.phone }}</div>
                        </div>
                        <i v-if="selectedCourierDocId === c.documentId" class="pi pi-check text-ink-900" />
                    </button>
                </div>
            </div>
        </div>
        <template #footer>
            <div class="pt-4 flex justify-end gap-2 w-full">
                <Button label="Отмена" severity="secondary" text @click="emit('update:visible', false)" />
                <Button label="Назначить" icon="pi pi-check" severity="primary"
                        :disabled="saving || !selectedCode" @click="save" />
            </div>
        </template>
    </Dialog>
</template>
