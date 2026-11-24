<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import { Employees, dispatchOrder, type Employee, type Order } from '@/services/resources'
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
const mode = ref<'courier' | 'yandex'>('courier')
const selectedCourierDocId = ref('')
const couriers = ref<Employee[]>([])
const loadingList = ref(false)
const saving = ref(false)

async function loadCouriers() {
    loadingList.value = true
    try {
        const res = await Employees.listPaged({
            'filters[role][$eq]': 'courier',
            'filters[active][$ne]': false,
            populate: ['photo'],
            sort: 'fullName:asc',
            'pagination[pageSize]': 100,
        })
        couriers.value = res.data
    } finally {
        loadingList.value = false
    }
}

watch(() => props.visible, (v) => {
    if (!v) return
    const curDoc = (props.order?.employee as any)?.documentId
    selectedCourierDocId.value = curDoc || ''
    mode.value = props.order?.deliveryBy === 'yandex' ? 'yandex' : 'courier'
    loadCouriers()
})

onMounted(() => { if (props.visible) loadCouriers() })

async function save() {
    if (!props.order) return
    if (mode.value === 'courier' && !selectedCourierDocId.value) {
        toast.add({ severity: 'warn', summary: 'Выберите курьера', life: 1800 })
        return
    }
    saving.value = true
    try {
        const updated = await dispatchOrder(
            props.order.documentId,
            mode.value,
            mode.value === 'courier' ? selectedCourierDocId.value : null,
        )
        emit('saved', updated)
        emit('update:visible', false)
        toast.add({
            severity: 'success',
            summary: mode.value === 'yandex' ? 'Яндекс-доставка' : 'Курьер назначен',
            life: 1800,
        })
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
            <div class="grid grid-cols-2 gap-2">
                <button type="button"
                        class="rounded-xl py-3 px-4 border font-semibold transition"
                        :class="mode === 'courier' ? 'bg-ink-900 text-cream-50 border-ink-900' : 'border-ink-200 hover:border-ink-400'"
                        @click="mode = 'courier'">
                    <i class="pi pi-user mr-2" /> Курьер
                </button>
                <button type="button"
                        class="rounded-xl py-3 px-4 border font-semibold transition"
                        :class="mode === 'yandex' ? 'bg-ink-900 text-cream-50 border-ink-900' : 'border-ink-200 hover:border-ink-400'"
                        @click="mode = 'yandex'">
                    <i class="pi pi-truck mr-2" /> Яндекс-доставка
                </button>
            </div>

            <div v-if="mode === 'courier'" class="space-y-2">
                <div class="text-xs font-bold uppercase tracking-wider text-ink-400">Выберите курьера</div>
                <div v-if="loadingList" class="text-sm text-ink-400 py-2">Загрузка…</div>
                <div v-else-if="!couriers.length" class="text-sm text-ink-400 py-4 text-center">
                    Нет активных курьеров. Добавьте в разделе Сотрудники.
                </div>
                <div v-else class="max-h-[320px] overflow-y-auto space-y-1.5">
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

            <div v-else class="rounded-xl bg-saffron-300/20 p-3 text-sm text-ink-700">
                Заказ будет помечен как переданный в Яндекс-доставку. Курьерам системы он не придёт.
            </div>
        </div>

        <template #footer>
            <Button label="Отмена" severity="secondary" text @click="emit('update:visible', false)" />
            <Button label="Назначить" icon="pi pi-check" severity="primary"
                    :disabled="saving" @click="save" />
        </template>
    </Dialog>
</template>
