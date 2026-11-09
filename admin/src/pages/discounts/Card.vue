<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppTopbar from '@/components/AppTopbar.vue'
import { api, mediaUrl } from '@/services/api'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import type { Discount } from '@/services/resources'
import {
    DISPLAY_STATE_LABEL, DISPLAY_STATE_COLOR, benefitLabel, levelLabel,
    describeDiscount, describeConditions, reasonLabel,
    type DisplayState,
} from '@/utils/discount'
import PhoneFrame from '@/components/client-preview/PhoneFrame.vue'
import ProductCardPreview from '@/components/client-preview/ProductCardPreview.vue'
import DiscountTilePreview from '@/components/client-preview/DiscountTilePreview.vue'
import SetCardPreview from '@/components/client-preview/SetCardPreview.vue'
import CheckoutDiscountPreview from '@/components/client-preview/CheckoutDiscountPreview.vue'

type Problem = { field: string; code: string; message: string }
type EventRow = {
    id: number; type: string; fromStatus?: string | null; toStatus?: string | null
    comment?: string | null; payload?: any; createdAt: string
    employee?: { id: number; name?: string | null } | null
    discountVersion?: number | null
}
type VersionRow = { id: number; version: number; status: string; createdAt: string }
type Loaded = Discount & {
    _displayState: DisplayState
    _readiness: { ready: boolean; problems: Problem[] }
    _stats: { applications: number; amountTotal: number; ordersCount: number; lastAppliedAt: string | null; byVersion?: Array<{ id: number; version: number; applications: number; amount: number }> }
    _versions: VersionRow[]
    _events: EventRow[]
}

const route = useRoute()
const router = useRouter()
const confirm = useConfirm()
const toast = useToast()

const loading = ref(true)
const d = ref<Loaded | null>(null)
const withActive = ref(false)
const preview = ref<any | null>(null)
const previewLoading = ref(false)

const simOpen = ref(false)
const simResult = ref<any | null>(null)
const simRunning = ref(false)
const simItems = ref<Array<{ kind: 'product' | 'set'; refId: number | null; qty: number }>>([{ kind: 'product', refId: null, qty: 1 }])

const now = new Date()

async function load() {
    loading.value = true
    try {
        const res = await api.get(`/staff/discounts/${route.params.id}`)
        d.value = res.data?.data as Loaded
        // Архив → в чистый просмотр, но если пришли из /edit — редирект (обработан в Editor).
        await loadPreview()
    } catch (e: any) {
        toast.add({ severity: 'error', summary: 'Не удалось загрузить', detail: e?.response?.data?.error?.message, life: 3500 })
    } finally {
        loading.value = false
    }
}
async function loadPreview() {
    if (!d.value) return
    previewLoading.value = true
    try {
        const res = await api.post('/staff/discounts/preview', { discountId: d.value.id, withActive: withActive.value })
        const p = res.data?.data
        if (p?.products) p.products = p.products.map((x: any) => ({ ...x, image: x.image ? mediaUrl(x.image) : null }))
        if (p?.sets) p.sets = p.sets.map((x: any) => ({ ...x, banner: x.banner ? mediaUrl(x.banner) : null }))
        preview.value = p
    } catch {
        preview.value = null
    } finally {
        previewLoading.value = false
    }
}
onMounted(load)

const stateChip = computed(() => d.value ? DISPLAY_STATE_LABEL[d.value._displayState] : '')
const stateColor = computed(() => d.value ? DISPLAY_STATE_COLOR[d.value._displayState] : '')

const heroBenefit = computed(() => d.value ? benefitLabel(d.value) : '')
const heroText = computed(() => d.value ? describeDiscount(d.value) : '')

function fmt(v: number) { return new Intl.NumberFormat('ru-RU').format(v) + ' сум' }
function fmtDate(s?: string | null) {
    if (!s) return ''
    return new Date(s).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function fmtDateShort(s?: string | null) {
    if (!s) return ''
    return new Date(s).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

async function changeStatus(to: 'active' | 'paused' | 'archived') {
    if (!d.value) return
    try {
        await api.post(`/staff/discounts/${d.value.id}/status`, { status: to })
        toast.add({ severity: 'success', summary: 'Статус изменён', life: 1500 })
        await load()
    } catch (e: any) {
        const err = e?.response?.data?.error
        if (err?.details?.code === 'DISCOUNT_NOT_READY') {
            toast.add({ severity: 'warn', summary: 'Скидка не готова', detail: err.details.problems?.map((p: Problem) => p.message).join('; '), life: 4000 })
        } else {
            toast.add({ severity: 'error', summary: 'Ошибка', detail: err?.message, life: 3500 })
        }
    }
}
function activate() {
    if (!d.value) return
    if (!d.value._readiness.ready) {
        toast.add({ severity: 'warn', summary: 'Исправьте замечания', life: 2500 })
        return
    }
    confirm.require({
        header: 'Активировать скидку',
        message: d.value.startsAt && new Date(d.value.startsAt) > now
            ? `Скидка начнёт действовать с ${fmtDate(d.value.startsAt)}.`
            : 'Скидка начнёт действовать сразу.',
        accept: () => changeStatus('active'),
    })
}
function pause() {
    confirm.require({
        header: 'Поставить на паузу',
        message: 'Клиенты перестанут получать скидку сразу. Уже оформленные заказы не изменятся.',
        accept: () => changeStatus('paused'),
    })
}
function resume() {
    confirm.require({
        header: 'Возобновить скидку',
        message: 'Скидка снова начнёт применяться.',
        accept: () => changeStatus('active'),
    })
}
function archive() {
    confirm.require({
        header: 'В архив',
        message: 'Это нельзя отменить. Скидка перестанет действовать и её нельзя будет редактировать — только создать копию.',
        acceptClass: 'p-button-danger',
        accept: () => changeStatus('archived'),
    })
}
function deleteDraft() {
    if (!d.value) return
    confirm.require({
        header: 'Удалить черновик',
        message: 'Черновик будет удалён без возможности восстановления.',
        acceptClass: 'p-button-danger',
        accept: async () => {
            try {
                await api.delete(`/staff/discounts/${d.value!.id}`)
                toast.add({ severity: 'success', summary: 'Удалено', life: 1500 })
                router.push('/discounts')
            } catch (e: any) {
                toast.add({ severity: 'error', summary: 'Ошибка', detail: e?.response?.data?.error?.message, life: 3500 })
            }
        },
    })
}
function duplicate() {
    if (!d.value) return
    router.push(`/discounts/new?copyFrom=${d.value.id}`)
}
function edit(section?: string) {
    if (!d.value) return
    router.push(`/discounts/${d.value.id}/edit${section ? '#' + section : ''}`)
}

async function runSimulate() {
    if (!d.value) return
    simRunning.value = true
    try {
        const payload = {
            items: simItems.value
                .filter((i) => i.refId != null)
                .map((i) => i.kind === 'product'
                    ? { type: 'product', productId: Number(i.refId), qty: Number(i.qty || 1) }
                    : { type: 'set', orderSetId: Number(i.refId), qty: Number(i.qty || 1) }),
            includeDiscountIds: [d.value.id],
        }
        const res = await api.post('/staff/pricing/simulate', payload)
        simResult.value = res.data?.data
    } catch (e: any) {
        toast.add({ severity: 'error', summary: 'Ошибка', detail: e?.response?.data?.error?.message, life: 3500 })
    } finally { simRunning.value = false }
}
function addSimItem() { simItems.value.push({ kind: 'product', refId: null, qty: 1 }) }
function removeSimItem(i: number) { simItems.value.splice(i, 1) }

// События — иконки по типу.
const EVENT_ICON: Record<string, string> = {
    created: 'pi-plus-circle',
    updated: 'pi-pencil',
    status_changed: 'pi-sync',
    version_created: 'pi-copy',
    duplicated: 'pi-clone',
}
const EVENT_LABEL: Record<string, string> = {
    created: 'Создана',
    updated: 'Отредактирована',
    status_changed: 'Статус изменён',
    version_created: 'Создана новая версия',
    duplicated: 'Скопирована',
}
const STATUS_LABEL_SHORT: Record<string, string> = {
    draft: 'Черновик', active: 'Активна', paused: 'Пауза', archived: 'Архив',
}
function eventTitle(e: EventRow): string {
    const base = EVENT_LABEL[e.type] || e.type
    if (e.type === 'status_changed' && e.fromStatus && e.toStatus) {
        return `${base}: ${STATUS_LABEL_SHORT[e.fromStatus] || e.fromStatus} → ${STATUS_LABEL_SHORT[e.toStatus] || e.toStatus}`
    }
    return base
}

const conditionsList = computed(() => d.value ? describeConditions(d.value.conditions as any) : [])
</script>

<template>
    <AppTopbar v-if="d" :title="d.name" :subtitle="`${levelLabel(d.level)} · версия ${d.version}`">
        <template #actions>
            <Button label="Назад" icon="pi pi-arrow-left" severity="secondary" text @click="router.push('/discounts')" />

            <template v-if="d.status === 'draft'">
                <Button label="Редактировать" icon="pi pi-pencil" severity="secondary" outlined @click="edit()" />
                <Button label="Активировать" icon="pi pi-check" severity="primary"
                        :disabled="!d._readiness.ready" @click="activate" />
            </template>
            <template v-else-if="d.status === 'active'">
                <Button label="Редактировать" icon="pi pi-pencil" severity="secondary" outlined @click="edit()" />
                <Button label="Поставить на паузу" icon="pi pi-pause" severity="warn" outlined @click="pause" />
                <Button icon="pi pi-ellipsis-v" severity="secondary" text @click="archive" v-tooltip.bottom="'В архив'" />
            </template>
            <template v-else-if="d.status === 'paused'">
                <Button label="Редактировать" icon="pi pi-pencil" severity="secondary" outlined @click="edit()" />
                <Button label="Возобновить" icon="pi pi-play" severity="primary" @click="resume" />
                <Button icon="pi pi-ellipsis-v" severity="secondary" text @click="archive" v-tooltip.bottom="'В архив'" />
            </template>
            <template v-else>
                <Button label="Создать копию" icon="pi pi-clone" severity="secondary" outlined @click="duplicate" />
            </template>
        </template>
    </AppTopbar>

    <div v-if="loading" class="p-8 text-ink-400">Загрузка…</div>

    <div v-else-if="d" class="p-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] max-w-[1400px]">
        <!-- Левая колонка -->
        <div class="space-y-6 min-w-0">
            <!-- 1. Hero -->
            <section class="bg-white rounded-2xl p-6 flex items-center gap-5">
                <div class="font-display font-black text-5xl text-tomato-600 shrink-0">{{ heroBenefit }}</div>
                <div class="flex-1">
                    <div class="font-display font-bold text-xl">{{ d.name }}</div>
                    <div class="text-sm text-ink-500 mt-1">{{ heroText }}</div>
                    <div class="text-xs text-ink-400 mt-2">
                        <span v-if="d.publicLabel">Клиент видит: «{{ d.publicLabel }}»</span>
                        <span v-else>Метка не задана — клиент увидит название</span>
                    </div>
                </div>
                <span class="rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider" :class="stateColor">
                    {{ stateChip }}
                </span>
            </section>

            <!-- 2. Как увидит клиент -->
            <section class="bg-white rounded-2xl p-6">
                <div class="flex items-center justify-between mb-4">
                    <div>
                        <div class="font-display font-bold">Как увидит клиент</div>
                        <p class="text-sm text-ink-500 mt-1">
                            Данные из движка расчёта. Отражает реальный каталог клиента.
                        </p>
                    </div>
                    <label class="flex items-center gap-2 text-sm">
                        <input type="checkbox" v-model="withActive" @change="loadPreview" class="size-4" />
                        С учётом других активных скидок
                    </label>
                </div>

                <div v-if="previewLoading" class="text-ink-400 text-sm py-6 text-center">Считаю превью…</div>

                <div v-else-if="preview">
                    <!-- Что подхватила скидка -->
                    <div class="mb-3 text-xs text-ink-500">
                        <template v-if="d.level === 'order'">
                            Применяется ко всему чеку
                        </template>
                        <template v-else-if="d.targets?.length">
                            Применяется к:
                            <span class="font-semibold text-ink-700">
                                <template v-for="(t, i) in d.targets.filter(x => !x.exclude)" :key="'ap-' + i">
                                    <span v-if="i > 0">, </span>
                                    <template v-if="t.targetType === 'all-products'">всем товарам каталога</template>
                                    <template v-else-if="t.targetType === 'product'">«{{ t.product?.name || 'товар' }}»</template>
                                    <template v-else-if="t.targetType === 'category'">категории «{{ t.category?.name || 'категория' }}»</template>
                                    <template v-else-if="t.targetType === 'order-set'">набору «{{ t.orderSet?.name || 'набор' }}»</template>
                                </template>
                            </span>
                        </template>
                        <template v-else>
                            Целей не выбрано — скидка ни к чему не применится.
                        </template>
                    </div>

                    <!-- notes -->
                    <div v-if="preview.notes?.length" class="space-y-2 mb-4">
                        <div v-for="(n, i) in preview.notes" :key="i"
                             class="flex gap-2 items-start text-sm bg-saffron-300/15 rounded-xl p-3">
                            <span class="pi pi-info-circle text-saffron-700 mt-0.5"></span>
                            <span>{{ n.message }}</span>
                        </div>
                    </div>

                    <!-- Для черновика/паузы — полоса -->
                    <div v-if="d.status !== 'active'" class="mb-3 text-xs uppercase tracking-wider font-bold text-ink-400">
                        Так будет выглядеть после активации
                    </div>

                    <div class="flex flex-wrap gap-6 justify-start">
                        <!-- Карточки товаров -->
                        <PhoneFrame v-if="preview.products?.length" title="В каталоге">
                            <div class="grid grid-cols-2 gap-3">
                                <ProductCardPreview v-for="p in preview.products.slice(0, 2)" :key="p.id" :product="p" />
                            </div>
                        </PhoneFrame>

                        <!-- Плитка на странице «Скидки» (горизонтальная плитка — другой лейаут) -->
                        <PhoneFrame v-if="preview.placements?.includes('discounts_page') && preview.products?.length" title="На странице «Скидки»">
                            <DiscountTilePreview :item="{ kind: 'product', ...preview.products[0] }" />
                        </PhoneFrame>

                        <!-- Карточки наборов -->
                        <PhoneFrame v-if="preview.sets?.length" title="На странице набора">
                            <div class="flex flex-col gap-4">
                                <SetCardPreview v-for="s in preview.sets" :key="s.id" :set="s" />
                            </div>
                        </PhoneFrame>

                        <!-- Чекаут -->
                        <PhoneFrame v-if="preview.checkout" title="На чекауте">
                            <CheckoutDiscountPreview :below="preview.checkout.sampleBelow" :above="preview.checkout.sampleAbove" />
                        </PhoneFrame>
                    </div>

                    <div v-if="!preview.placements?.length && !preview.products?.length && !preview.sets?.length"
                         class="text-sm text-ink-400 text-center py-8">
                        Клиент не увидит эту скидку в каталоге —
                        {{ preview.notes?.[0]?.message || 'условия не позволяют показать её вне корзины.' }}
                    </div>
                </div>

                <div v-else class="text-sm text-ink-400 py-6 text-center">Нет данных для превью.</div>
            </section>

            <!-- 3. Детали -->
            <section class="grid gap-4 md:grid-cols-2 2xl:grid-cols-3 items-start">
                <!-- Выгода -->
                <div class="bg-white rounded-2xl p-5 h-full">
                    <div class="flex items-center justify-between">
                        <div class="font-display font-bold">Выгода</div>
                        <Button v-if="d.status !== 'archived'" icon="pi pi-pencil" severity="secondary" text @click="edit('benefit')" />
                    </div>
                    <div class="mt-2 text-sm">
                        <div>{{ benefitLabel(d) }} — {{ d.benefitType === 'percent' ? 'процент' : d.benefitType === 'fixed_amount' ? 'сумма со скидкой' : 'фиксированная цена' }}</div>
                        <div v-if="d.maxDiscountAmount" class="text-ink-500 mt-1">
                            Не больше {{ fmt(d.maxDiscountAmount) }} на заказ
                        </div>
                    </div>
                </div>

                <!-- На что действует (длинный список целей — шире) -->
                <div class="bg-white rounded-2xl p-5 h-full"
                     :class="(d.targets?.length || 0) > 4 ? 'md:col-span-2' : ''">
                    <div class="flex items-center justify-between">
                        <div class="font-display font-bold">На что действует</div>
                        <Button v-if="d.status !== 'archived' && d.level !== 'order'" icon="pi pi-pencil" severity="secondary" text @click="edit('targets')" />
                    </div>
                    <div class="mt-2 text-sm">
                        <div v-if="d.level === 'order'">На весь чек</div>
                        <template v-else-if="d.targets?.length">
                            <div class="flex flex-wrap gap-2">
                                <span v-for="t in d.targets.filter(x => !x.exclude)" :key="'in-' + (t.product?.id || t.category?.id || t.orderSet?.id || t.targetType)"
                                      class="inline-flex rounded-full bg-ink-100 px-3 py-1 text-xs font-semibold">
                                    <template v-if="t.targetType === 'all-products'">Все товары</template>
                                    <template v-else-if="t.targetType === 'product'">{{ t.product?.name || 'товар' }}</template>
                                    <template v-else-if="t.targetType === 'category'">{{ t.category?.name || 'категория' }}</template>
                                    <template v-else-if="t.targetType === 'order-set'">{{ t.orderSet?.name || 'набор' }}</template>
                                </span>
                            </div>
                            <div v-if="d.targets.some(x => x.exclude)" class="mt-2 text-ink-500">
                                Кроме:
                                <span v-for="t in d.targets.filter(x => x.exclude)" :key="'ex-' + (t.product?.id || 0)" class="mx-1">
                                    «{{ t.product?.name || 'товар' }}»
                                </span>
                            </div>
                        </template>
                        <div v-else class="text-ink-400">Цели не выбраны</div>
                    </div>
                </div>

                <!-- Условия -->
                <div class="bg-white rounded-2xl p-5 h-full">
                    <div class="flex items-center justify-between">
                        <div class="font-display font-bold">Условия</div>
                        <Button v-if="d.status !== 'archived'" icon="pi pi-pencil" severity="secondary" text @click="edit('conditions')" />
                    </div>
                    <div class="mt-2 text-sm">
                        <ul v-if="conditionsList.length" class="list-disc list-inside space-y-1">
                            <li v-for="(c, i) in conditionsList" :key="i">{{ c }}</li>
                        </ul>
                        <div v-else class="text-ink-500">Без условий — для всех заказов</div>
                    </div>
                </div>

                <!-- Период -->
                <div class="bg-white rounded-2xl p-5 h-full">
                    <div class="flex items-center justify-between">
                        <div class="font-display font-bold">Период</div>
                        <Button v-if="d.status !== 'archived'" icon="pi pi-pencil" severity="secondary" text @click="edit('period')" />
                    </div>
                    <div class="mt-2 text-sm">
                        <div v-if="!d.startsAt && !d.endsAt" class="text-ink-500">Бессрочно</div>
                        <div v-else>
                            <span v-if="d.startsAt">с {{ fmtDateShort(d.startsAt) }}</span>
                            <span v-if="d.endsAt" class="ml-1">по {{ fmtDateShort(d.endsAt) }}</span>
                        </div>
                    </div>
                </div>

                <!-- Сочетание -->
                <div class="bg-white rounded-2xl p-5 h-full">
                    <div class="flex items-center justify-between">
                        <div class="font-display font-bold">Сочетание с другими скидками</div>
                        <Button v-if="d.status !== 'archived'" icon="pi pi-pencil" severity="secondary" text @click="edit('stacking')" />
                    </div>
                    <div class="mt-2 text-sm space-y-1">
                        <div>Порядок применения: {{ d.priority }} (меньше — раньше)</div>
                        <div v-if="d.exclusiveGroup">
                            Группа «{{ d.exclusiveGroup }}» — из скидок одной группы применится самая выгодная клиенту.
                        </div>
                        <div>{{ d.stackable ? 'Сочетается с другими скидками того же типа' : 'Не сочетается — применится одна самая выгодная' }}</div>
                    </div>
                </div>

                <!-- Показ -->
                <div class="bg-white rounded-2xl p-5 h-full">
                    <div class="flex items-center justify-between">
                        <div class="font-display font-bold">Показ</div>
                        <Button v-if="d.status !== 'archived'" icon="pi pi-pencil" severity="secondary" text @click="edit('visibility')" />
                    </div>
                    <div class="mt-2 text-sm">
                        {{ d.showInCatalog ? 'Показывается в каталоге и на странице «Скидки»' : 'Скрыта — применяется только в корзине' }}
                    </div>
                </div>
            </section>

            <!-- 4. Проверить на тестовой корзине -->
            <section class="bg-white rounded-2xl p-6">
                <button type="button" class="w-full flex items-center justify-between" @click="simOpen = !simOpen">
                    <div class="font-display font-bold">Проверить на тестовой корзине</div>
                    <span class="pi" :class="simOpen ? 'pi-chevron-up' : 'pi-chevron-down'"></span>
                </button>
                <div v-if="simOpen" class="mt-4 space-y-3">
                    <div v-for="(it, idx) in simItems" :key="idx" class="grid grid-cols-[minmax(0,1fr)_100px_auto] gap-3 items-center bg-ink-50 rounded-xl p-3">
                        <input v-model.number="it.refId" type="number" placeholder="ID товара"
                               class="rounded-xl border border-ink-200 px-3 py-2" />
                        <input v-model.number="it.qty" type="number" min="1"
                               class="rounded-xl border border-ink-200 px-3 py-2" />
                        <Button icon="pi pi-trash" severity="danger" text @click="removeSimItem(idx)" />
                    </div>
                    <Button icon="pi pi-plus" label="Строка" size="small" severity="secondary" outlined @click="addSimItem" />
                    <Button label="Посчитать" icon="pi pi-calculator" severity="primary" :loading="simRunning" @click="runSimulate" />

                    <div v-if="simResult" class="rounded-xl bg-ink-50 p-4 space-y-2 text-sm">
                        <div class="flex justify-between"><span>Базовая сумма</span><span>{{ fmt(simResult.subtotal) }}</span></div>
                        <div class="flex justify-between text-tomato-600"><span>Скидки</span><span>− {{ fmt(simResult.discountTotal) }}</span></div>
                        <div class="flex justify-between font-display font-extrabold"><span>Итого</span><span>{{ fmt(simResult.total) }}</span></div>
                        <div v-if="simResult.explanations?.length" class="pt-2 border-t border-ink-200">
                            <div class="text-xs font-bold uppercase tracking-wider text-ink-400 mb-1">Разбор</div>
                            <ul class="space-y-0.5 text-xs">
                                <li v-for="(e, i) in simResult.explanations" :key="i">
                                    #{{ e.discountId }}:
                                    <span v-if="e.applied" class="text-green-700 font-semibold">применена</span>
                                    <span v-else class="text-ink-400">не применена — {{ reasonLabel(e.reason) }}</span>
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>
            </section>
        </div>

        <!-- Правая колонка -->
        <aside class="space-y-4">
            <!-- Статус-баннер -->
            <div class="bg-white rounded-2xl p-5">
                <div v-if="d.status === 'draft'">
                    <div class="font-display font-bold">Черновик</div>
                    <p class="text-sm text-ink-500 mt-1">Клиенты не видят эту скидку.</p>
                    <div class="mt-3 space-y-1 text-sm">
                        <div v-if="d._readiness.ready" class="text-green-700 font-semibold">
                            <span class="pi pi-check-circle"></span> Готова к активации
                        </div>
                        <template v-else>
                            <div v-for="p in d._readiness.problems" :key="p.code" class="text-tomato-600 flex items-start gap-2">
                                <span class="pi pi-times-circle mt-0.5"></span><span>{{ p.message }}</span>
                            </div>
                        </template>
                    </div>
                    <Button class="mt-3 w-full" label="Активировать" icon="pi pi-check" severity="primary" :disabled="!d._readiness.ready" @click="activate" />
                    <Button class="mt-2 w-full" label="Удалить черновик" icon="pi pi-trash" severity="danger" text @click="deleteDraft" />
                </div>
                <div v-else-if="d._displayState === 'scheduled'">
                    <div class="font-display font-bold">Запланирована</div>
                    <p class="text-sm text-ink-500 mt-1">Начнёт действовать {{ fmtDate(d.startsAt) }}.</p>
                </div>
                <div v-else-if="d._displayState === 'active'">
                    <div class="font-display font-bold text-green-700">Активна</div>
                    <p v-if="d.startsAt" class="text-sm text-ink-500 mt-1">Действует с {{ fmtDateShort(d.startsAt) }}.</p>
                    <p v-else class="text-sm text-ink-500 mt-1">Действует без ограничения по дате начала.</p>
                </div>
                <div v-else-if="d._displayState === 'ended'">
                    <div class="font-display font-bold">Период завершился</div>
                    <p class="text-sm text-ink-500 mt-1">
                        {{ fmtDateShort(d.endsAt) }}. Скидка больше не применяется. Продлите период или отправьте в архив.
                    </p>
                </div>
                <div v-else-if="d.status === 'paused'">
                    <div class="font-display font-bold">На паузе</div>
                    <p class="text-sm text-ink-500 mt-1">Клиенты сейчас не получают скидку.</p>
                </div>
                <div v-else-if="d.status === 'archived'">
                    <div class="font-display font-bold text-ink-400">В архиве</div>
                    <p class="text-sm text-ink-500 mt-1">Только просмотр. Создайте копию, если нужно начать заново.</p>
                </div>
            </div>

            <!-- Статистика -->
            <div class="bg-white rounded-2xl p-5">
                <div class="font-display font-bold mb-3">Статистика</div>
                <div class="grid grid-cols-2 gap-3 text-sm">
                    <div>
                        <div class="text-xs text-ink-400">Применений</div>
                        <div class="font-bold text-lg">{{ d._stats.applications }}</div>
                    </div>
                    <div>
                        <div class="text-xs text-ink-400">Заказов</div>
                        <div class="font-bold text-lg">{{ d._stats.ordersCount }}</div>
                    </div>
                    <div class="col-span-2">
                        <div class="text-xs text-ink-400">Сумма скидок</div>
                        <div class="font-bold">{{ fmt(d._stats.amountTotal) }}</div>
                    </div>
                    <div v-if="d._stats.lastAppliedAt" class="col-span-2">
                        <div class="text-xs text-ink-400">Последнее применение</div>
                        <div class="font-semibold">{{ fmtDate(d._stats.lastAppliedAt) }}</div>
                    </div>
                </div>
                <div v-if="d._stats.byVersion?.length" class="mt-3 pt-3 border-t border-ink-100 text-xs space-y-1">
                    <div class="text-ink-400 uppercase tracking-wider font-bold">По версиям</div>
                    <div v-for="v in d._stats.byVersion" :key="v.id" class="flex justify-between">
                        <span>v{{ v.version }}</span>
                        <span>{{ v.applications }} · {{ fmt(v.amount) }}</span>
                    </div>
                </div>
            </div>

            <!-- Версии -->
            <div v-if="d._versions.length > 1" class="bg-white rounded-2xl p-5">
                <div class="font-display font-bold mb-3">Версии</div>
                <ul class="space-y-1 text-sm">
                    <li v-for="v in d._versions" :key="v.id"
                        class="flex items-center justify-between"
                        :class="{ 'font-bold': v.id === d.id }">
                        <RouterLink :to="`/discounts/${v.id}`" class="text-ink-700 hover:text-ink-900">
                            v{{ v.version }}
                        </RouterLink>
                        <span class="text-xs text-ink-400">{{ STATUS_LABEL_SHORT[v.status] || v.status }}</span>
                    </li>
                </ul>
            </div>

            <!-- История -->
            <div class="bg-white rounded-2xl p-5">
                <div class="font-display font-bold mb-3">История</div>
                <div v-if="!d._events.length" class="text-sm text-ink-400">Пока событий нет.</div>
                <ul v-else class="space-y-3 text-sm">
                    <li v-for="e in d._events" :key="e.id" class="flex gap-2">
                        <span class="pi mt-0.5" :class="EVENT_ICON[e.type] || 'pi-circle'"></span>
                        <div class="flex-1 min-w-0">
                            <div class="font-semibold">{{ eventTitle(e) }}</div>
                            <div class="text-xs text-ink-400">
                                {{ fmtDate(e.createdAt) }}
                                <span v-if="e.employee?.name"> · {{ e.employee.name }}</span>
                                <span v-if="e.discountVersion"> · v{{ e.discountVersion }}</span>
                            </div>
                            <div v-if="e.comment" class="text-xs text-ink-500 mt-0.5">{{ e.comment }}</div>
                        </div>
                    </li>
                </ul>
            </div>
        </aside>
    </div>
</template>
