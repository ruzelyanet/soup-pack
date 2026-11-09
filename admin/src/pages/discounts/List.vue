<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppTopbar from '@/components/AppTopbar.vue'
import { api } from '@/services/api'
import type { Discount } from '@/services/resources'
import Button from 'primevue/button'
import DataTable from 'primevue/datatable'
import { PAGINATOR_TEMPLATE, PAGINATOR_REPORT, PAGE_SIZE_OPTIONS, DEFAULT_PAGE_SIZE as PAGE_SIZE } from '@/utils/paginator'
import Column from 'primevue/column'
import InputText from 'primevue/inputtext'
import {
    DISPLAY_STATE_LABEL, DISPLAY_STATE_COLOR,
    benefitLabel, levelLabel, displayState,
    type DisplayState,
} from '@/utils/discount'

type Row = Discount & { _displayState: DisplayState }

const router = useRouter()
const loading = ref(true)
const items = ref<Row[]>([])
const q = ref('')
const activeFilter = ref<DisplayState | 'all'>('all')

async function load() {
    loading.value = true
    try {
        const qs = q.value ? `?q=${encodeURIComponent(q.value)}` : ''
        const res = await api.get('/staff/discounts' + qs)
        const now = new Date()
        items.value = ((res.data?.data || []) as Row[]).map((d) => ({
            ...d,
            _displayState: d._displayState || displayState(d, now),
        }))
    } finally { loading.value = false }
}
onMounted(load)

const counts = computed<Record<DisplayState | 'all', number>>(() => {
    const c: any = { all: 0, draft: 0, scheduled: 0, active: 0, ended: 0, paused: 0, archived: 0 }
    for (const d of items.value) {
        c.all++
        c[d._displayState]++
    }
    return c
})
const filtered = computed(() => {
    const list = items.value
    if (activeFilter.value === 'all') {
        // «Все» по умолчанию скрывают архив.
        return list.filter((d) => d._displayState !== 'archived')
    }
    return list.filter((d) => d._displayState === activeFilter.value)
})
const segments: Array<{ key: DisplayState | 'all'; label: string }> = [
    { key: 'all', label: 'Все' },
    { key: 'active', label: 'Активные' },
    { key: 'scheduled', label: 'Запланированные' },
    { key: 'draft', label: 'Черновики' },
    { key: 'paused', label: 'На паузе' },
    { key: 'ended', label: 'Завершились' },
    { key: 'archived', label: 'Архив' },
]

function targetsSummary(d: Discount): string {
    if (d.level === 'order') return 'Весь чек'
    const t = d.targets || []
    const inc = t.filter((x) => !x.exclude)
    if (!inc.length) return '—'
    if (inc.some((x) => x.targetType === 'all-products')) return 'Все товары'
    const products = inc.filter((x) => x.targetType === 'product')
    const cats = inc.filter((x) => x.targetType === 'category')
    const sets = inc.filter((x) => x.targetType === 'order-set')
    const parts: string[] = []
    if (products.length) {
        const first = products[0].product?.name || 'товар'
        parts.push(products.length > 1 ? `${first} +${products.length - 1}` : first)
    }
    if (cats.length) {
        const first = cats[0].category?.name || 'категория'
        parts.push(cats.length > 1 ? `${first} +${cats.length - 1}` : first)
    }
    if (sets.length) {
        const first = sets[0].orderSet?.name || 'набор'
        parts.push(sets.length > 1 ? `${first} +${sets.length - 1}` : first)
    }
    return parts.join(', ')
}

function fmtPeriod(d: Discount): string {
    const f = (s?: string | null) => s ? new Date(s).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) : null
    const from = f(d.startsAt)
    const to = f(d.endsAt)
    if (!from && !to) return 'бессрочно'
    return [from, to].filter(Boolean).join(' — ')
}

function newDiscount() { router.push('/discounts/new') }
function cartTierPreset() { router.push({ path: '/discounts/new', query: { preset: 'cart-tier' } }) }
</script>

<template>
    <AppTopbar title="Скидки" subtitle="Единое правило скидок для товаров, наборов и чека">
        <template #actions>
            <Button label="Скидка за сумму чека" severity="secondary" outlined icon="pi pi-receipt" @click="cartTierPreset" />
            <Button label="Новая скидка" icon="pi pi-plus" severity="primary" @click="newDiscount" />
        </template>
    </AppTopbar>

    <div class="p-8 space-y-4">
        <!-- Сегменты-фильтры -->
        <div class="flex items-center gap-2 flex-wrap">
            <button v-for="s in segments" :key="s.key" type="button"
                    @click="activeFilter = s.key"
                    class="rounded-full px-3 py-1.5 text-sm font-semibold transition"
                    :class="activeFilter === s.key ? 'bg-ink-900 text-white' : 'bg-white text-ink-700 hover:bg-ink-100'">
                {{ s.label }}
                <span class="ml-1 text-xs opacity-70">{{ counts[s.key] }}</span>
            </button>
            <div class="flex-1"></div>
            <InputText v-model="q" placeholder="Поиск по названию" class="w-64" @keyup.enter="load" />
            <Button icon="pi pi-refresh" severity="secondary" text @click="load" />
        </div>

        <!-- Таблица -->
        <div class="bg-white rounded-2xl overflow-hidden">
            <DataTable :value="filtered" :loading="loading" striped-rows row-hover paginator
                       :rows="PAGE_SIZE" :rows-per-page-options="PAGE_SIZE_OPTIONS"
                       :paginator-template="PAGINATOR_TEMPLATE"
                       :current-page-report-template="PAGINATOR_REPORT"
                       @row-click="(e: any) => router.push(`/discounts/${e.data.id}`)">
                <Column field="name" header="Название" style="min-width: 240px">
                    <template #body="{ data }">
                        <div class="font-semibold">{{ data.name }}</div>
                        <div v-if="data.publicLabel" class="text-xs text-ink-400">{{ data.publicLabel }}</div>
                    </template>
                </Column>
                <Column header="Тип" style="width: 130px">
                    <template #body="{ data }">
                        <span class="text-sm">{{ levelLabel(data.level) }}</span>
                    </template>
                </Column>
                <Column header="Выгода" style="width: 130px">
                    <template #body="{ data }">
                        <span class="font-bold text-tomato-600">{{ benefitLabel(data) }}</span>
                    </template>
                </Column>
                <Column header="На что" style="min-width: 200px">
                    <template #body="{ data }">
                        <span class="text-sm text-ink-600">{{ targetsSummary(data) }}</span>
                    </template>
                </Column>
                <Column header="Период" style="width: 160px">
                    <template #body="{ data }">
                        <span class="text-xs">{{ fmtPeriod(data) }}</span>
                    </template>
                </Column>
                <Column header="Статус" style="width: 140px">
                    <template #body="{ data }">
                        <span class="inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                              :class="DISPLAY_STATE_COLOR[(data._displayState as DisplayState)]">
                            {{ DISPLAY_STATE_LABEL[(data._displayState as DisplayState)] }}
                        </span>
                    </template>
                </Column>
                <template #empty>
                    <div class="p-8 text-center text-ink-400 space-y-3">
                        <div>Скидок пока нет.</div>
                        <div class="flex gap-2 justify-center">
                            <Button label="Новая скидка" icon="pi pi-plus" severity="primary" @click="newDiscount" />
                            <Button label="Скидка за сумму чека" icon="pi pi-receipt" severity="secondary" outlined @click="cartTierPreset" />
                        </div>
                    </div>
                </template>
            </DataTable>
        </div>
    </div>
</template>
