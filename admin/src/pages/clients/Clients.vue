<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import AppTopbar from '@/components/AppTopbar.vue'
import { Clients, Orders, type Client, type Order } from '@/services/resources'
import DataTable from 'primevue/datatable'
import { PAGINATOR_TEMPLATE, PAGINATOR_REPORT, PAGE_SIZE_OPTIONS, DEFAULT_PAGE_SIZE as PAGE_SIZE } from '@/utils/paginator'
import Column from 'primevue/column'
import InputText from 'primevue/inputtext'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import FloatLabel from 'primevue/floatlabel'

const search = ref('')
const list = ref<Client[]>([])
const allOrders = ref<Order[]>([])
const loading = ref(true)
const err = ref<string | null>(null)

const page = ref(0)
const pageSize = ref(PAGE_SIZE)
const total = ref(0)

async function load() {
    loading.value = true
    try {
        const s = search.value.trim()
        const filters = s ? { $or: [
            { fullName: { $containsi: s } },
            { phone: { $containsi: s } },
        ] } : undefined
        const [c, o] = await Promise.all([
            Clients.listPaged({
                sort: 'id:desc',
                filters,
                'pagination[page]': page.value + 1,
                'pagination[pageSize]': pageSize.value,
            }),
            // Для агрегата по заказам всё ещё грузим «все» (ограничение по 100 — как было).
            allOrders.value.length ? Promise.resolve({ data: allOrders.value } as any)
                                    : Orders.list({ populate: ['client'], sort: 'createdAt:desc' }).then((d) => ({ data: d })),
        ])
        list.value = c.data
        total.value = c.meta.pagination.total
        allOrders.value = (o as any).data
    } catch (e: any) {
        err.value = e?.response?.status
            ? `${e.response.status} ${e.response.statusText}: ${e?.response?.data?.error?.message || ''}`
            : 'Нет связи с API — запустите backend (cd backend && npm run develop)'
    } finally {
        loading.value = false
    }
}

onMounted(load)

let searchDebounce: number | null = null
watch(search, () => {
    if (searchDebounce != null) clearTimeout(searchDebounce)
    searchDebounce = window.setTimeout(() => { page.value = 0; load() }, 400)
})
watch([page, pageSize], load)

const rows = computed(() =>
    list.value.map((c) => {
        const my = allOrders.value.filter((o) => o.client?.id === c.id)
        return {
            ...c,
            ordersCount: my.length,
            totalSpent: my.reduce((s, o) => s + Number(o.total || 0), 0),
            firstOrderAt: my[my.length - 1]?.createdAt,
            lastOrderAt: my[0]?.createdAt,
        }
    }),
)

function fmt(v: number) {
    return new Intl.NumberFormat('ru-RU').format(v) + ' сум'
}
</script>

<template>
    <AppTopbar title="Клиенты" subtitle="Автоматически из заказов" />

    <div class="p-8 space-y-4">
        <div v-if="err" class="bg-tomato-500/10 text-tomato-600 rounded-xl p-4 text-sm">
            {{ err }}
        </div>
        <div class="bg-white rounded-2xl p-4 flex flex-wrap items-center gap-3">
            <div class="flex-1 min-w-[260px]">
                <FloatLabel variant="on">
                    <IconField>
                        <InputIcon class="pi pi-search" />
                        <InputText id="clients-search" v-model.trim="search"
                                   class="w-full pl-10" :class="search ? 'pr-10' : ''" />
                        <InputIcon v-if="search" class="pi pi-times cursor-pointer"
                                   @click="search = ''" />
                    </IconField>
                    <label for="clients-search">Поиск: имя, телефон</label>
                </FloatLabel>
            </div>
        </div>
        <div class="bg-white rounded-2xl overflow-hidden">
            <DataTable :value="rows" :loading="loading" data-key="id"
                       lazy paginator
                       :rows="pageSize" :first="page * pageSize"
                       :total-records="total"
                       :rows-per-page-options="PAGE_SIZE_OPTIONS"
                       :paginator-template="PAGINATOR_TEMPLATE"
                       :current-page-report-template="PAGINATOR_REPORT"
                       @page="(ev: any) => { page = ev.page; pageSize = ev.rows }">
                <Column header="Клиент">
                    <template #body="{ data }">
                        <div class="font-semibold">{{ data.fullName }}</div>
                        <div class="text-xs text-ink-400">{{ data.phone }}</div>
                    </template>
                </Column>
                <Column header="Адрес">
                    <template #body="{ data }">
                        <div class="text-sm">{{ data.address || '—' }}</div>
                    </template>
                </Column>
                <Column field="ordersCount" header="Заказов" style="width: 120px" />
                <Column header="Общая сумма" style="width: 180px">
                    <template #body="{ data }">
                        <div class="font-semibold">{{ fmt(data.totalSpent) }}</div>
                    </template>
                </Column>
                <Column header="Первый / последний" style="width: 220px">
                    <template #body="{ data }">
                        <div class="text-sm">{{ data.firstOrderAt ? new Date(data.firstOrderAt).toLocaleDateString('ru-RU') : '—' }}</div>
                        <div class="text-xs text-ink-400">
                            → {{ data.lastOrderAt ? new Date(data.lastOrderAt).toLocaleDateString('ru-RU') : '—' }}
                        </div>
                    </template>
                </Column>
            </DataTable>
        </div>
    </div>
</template>
