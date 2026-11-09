<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import AppTopbar from '@/components/AppTopbar.vue'
import { api } from '@/services/api'
import { Categories, Products, OrderSets, type Discount, type DiscountLevel, type BenefitType, type Category, type Product, type OrderSet } from '@/services/resources'
import Button from 'primevue/button'
import Select from 'primevue/select'
import DatePicker from 'primevue/datepicker'
import InputText from 'primevue/inputtext'
import MultiSelect from 'primevue/multiselect'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import { describeDiscount, benefitLabel, targetsToForm, formToTargets, type DraftTargetsForm } from '@/utils/discount'
import ProductPickerField from '@/components/ProductPickerField.vue'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const confirm = useConfirm()

const isNew = computed(() => !route.params.id || route.params.id === 'new' || route.name === 'discount-new')
const loading = ref(!isNew.value)
const saving = ref(false)
const discountId = ref<number | null>(null)
const existingStatus = ref<string | null>(null)
const existingApplications = ref<number>(0)
const dirty = ref(false)

type Form = {
    name: string
    publicLabel: string
    level: DiscountLevel
    benefitType: BenefitType
    benefitValue: number
    maxDiscountAmount: number | null
    maxDiscountEnabled: boolean
    startsAt: Date | null
    endsAt: Date | null
    showInCatalog: boolean
    stackable: boolean
    exclusiveGroup: string
    priority: number
}
const form = reactive<Form>({
    name: '',
    publicLabel: '',
    level: 'line',
    benefitType: 'percent',
    benefitValue: 10,
    maxDiscountAmount: null,
    maxDiscountEnabled: false,
    startsAt: null,
    endsAt: null,
    showInCatalog: true,
    stackable: true,
    exclusiveGroup: '',
    priority: 100,
})

const targetsForm = reactive<DraftTargetsForm>({
    allProducts: false,
    productIds: [],
    categoryIds: [],
    excludeProductIds: [],
    orderSetIds: [],
})

type ConditionKey = 'minSubtotal' | 'minQty' | 'deliveryMethods' | 'paymentMethods' | 'weekdays' | 'time'
const conditionsEnabled = reactive<Record<ConditionKey, boolean>>({
    minSubtotal: false, minQty: false, deliveryMethods: false,
    paymentMethods: false, weekdays: false, time: false,
})
const conditionsValues = reactive({
    minSubtotal: null as number | null,
    minQty: null as number | null,
    deliveryMethods: [] as string[],
    paymentMethods: [] as string[],
    weekdays: [] as number[],
    timeFrom: '',
    timeTo: '',
})

const errors = reactive<Record<string, string>>({})

// Options
const levelCards = [
    { value: 'line' as const, icon: 'pi-tag', title: 'На товары', desc: 'Скидка на отдельные товары или категории', shown: 'В каталоге, на странице товара' },
    { value: 'set' as const, icon: 'pi-box', title: 'На набор', desc: 'Скидка на готовый набор целиком', shown: 'На странице набора' },
    { value: 'order' as const, icon: 'pi-receipt', title: 'На весь чек', desc: 'Скидка на сумму заказа, обычно от порога', shown: 'В корзине и на чекауте' },
]
const benefitOptions = computed(() => {
    const line = [
        { value: 'percent' as const, label: 'Процент', hint: '−N% от цены' },
        { value: 'fixed_amount' as const, label: 'Сумма', hint: '−N сум от цены' },
        { value: 'fixed_price' as const, label: 'Фиксированная цена', hint: 'товар стоит ровно N сум' },
    ]
    if (form.level === 'order') return line.slice(0, 2).map((b) => b.value === 'fixed_amount' ? { ...b, hint: '−N сум от суммы заказа' } : b)
    return line
})
const deliveryOptions = [{ label: 'Курьером сейчас', value: 'courier_now' }, { label: 'Предзаказ', value: 'preorder' }]
const paymentOptions = [
    { label: 'Наличные', value: 'cash' }, { label: 'Карта', value: 'card' },
    { label: 'Click', value: 'click' }, { label: 'Payme', value: 'payme' }, { label: 'Перевод', value: 'transfer' },
]
const weekdayOptions = [
    { label: 'Пн', value: 1 }, { label: 'Вт', value: 2 }, { label: 'Ср', value: 3 },
    { label: 'Чт', value: 4 }, { label: 'Пт', value: 5 }, { label: 'Сб', value: 6 }, { label: 'Вс', value: 7 },
]

const categoryList = ref<Category[]>([])
const productList = ref<Product[]>([])
const setList = ref<OrderSet[]>([])
const existingGroups = ref<string[]>([])

const livePreview = ref<any | null>(null)
let previewTimer: any = null

async function loadExisting(id: number) {
    try {
        const res = await api.get(`/staff/discounts/${id}`)
        const d = res.data?.data as any
        if (d.status === 'archived') {
            toast.add({ severity: 'warn', summary: 'Скидка в архиве', detail: 'Редактировать нельзя, только создать копию.', life: 3500 })
            router.replace(`/discounts/${id}`)
            return
        }
        discountId.value = d.id
        existingStatus.value = d.status
        existingApplications.value = Number(d._stats?.applications || 0)
        form.name = d.name
        form.publicLabel = d.publicLabel || ''
        form.level = d.level
        form.benefitType = d.benefitType
        form.benefitValue = d.benefitValue
        form.maxDiscountAmount = d.maxDiscountAmount ?? null
        form.maxDiscountEnabled = form.maxDiscountAmount != null
        form.startsAt = d.startsAt ? new Date(d.startsAt) : null
        form.endsAt = d.endsAt ? new Date(d.endsAt) : null
        form.showInCatalog = d.showInCatalog !== false
        form.stackable = d.stackable !== false
        form.exclusiveGroup = d.exclusiveGroup || ''
        form.priority = Number(d.priority ?? 100)
        Object.assign(targetsForm, targetsToForm(d.targets || []))
        const c = d.conditions || {}
        conditionsEnabled.minSubtotal = typeof c.minSubtotal === 'number'
        conditionsEnabled.minQty = typeof c.minQty === 'number'
        conditionsEnabled.deliveryMethods = Array.isArray(c.deliveryMethods) && c.deliveryMethods.length > 0
        conditionsEnabled.paymentMethods = Array.isArray(c.paymentMethods) && c.paymentMethods.length > 0
        conditionsEnabled.weekdays = Array.isArray(c.weekdays) && c.weekdays.length > 0
        conditionsEnabled.time = Boolean(c.timeFrom || c.timeTo)
        Object.assign(conditionsValues, {
            minSubtotal: c.minSubtotal ?? null,
            minQty: c.minQty ?? null,
            deliveryMethods: c.deliveryMethods || [],
            paymentMethods: c.paymentMethods || [],
            weekdays: c.weekdays || [],
            timeFrom: c.timeFrom || '',
            timeTo: c.timeTo || '',
        })
    } catch (e: any) {
        toast.add({ severity: 'error', summary: 'Не удалось загрузить', detail: e?.response?.data?.error?.message, life: 3500 })
    } finally { loading.value = false }
}

async function loadCopy(id: number) {
    const res = await api.get(`/staff/discounts/${id}`)
    const d = res.data?.data as any
    form.name = (d.name || '') + ' (копия)'
    form.publicLabel = d.publicLabel || ''
    form.level = d.level
    form.benefitType = d.benefitType
    form.benefitValue = d.benefitValue
    form.maxDiscountAmount = d.maxDiscountAmount ?? null
    form.maxDiscountEnabled = form.maxDiscountAmount != null
    form.showInCatalog = d.showInCatalog !== false
    form.stackable = d.stackable !== false
    form.exclusiveGroup = d.exclusiveGroup || ''
    form.priority = Number(d.priority ?? 100)
    Object.assign(targetsForm, targetsToForm(d.targets || []))
    const c = d.conditions || {}
    conditionsEnabled.minSubtotal = typeof c.minSubtotal === 'number'
    conditionsEnabled.minQty = typeof c.minQty === 'number'
    conditionsEnabled.deliveryMethods = Array.isArray(c.deliveryMethods) && c.deliveryMethods.length > 0
    conditionsEnabled.paymentMethods = Array.isArray(c.paymentMethods) && c.paymentMethods.length > 0
    conditionsEnabled.weekdays = Array.isArray(c.weekdays) && c.weekdays.length > 0
    conditionsEnabled.time = Boolean(c.timeFrom || c.timeTo)
    Object.assign(conditionsValues, {
        minSubtotal: c.minSubtotal ?? null, minQty: c.minQty ?? null,
        deliveryMethods: c.deliveryMethods || [], paymentMethods: c.paymentMethods || [],
        weekdays: c.weekdays || [], timeFrom: c.timeFrom || '', timeTo: c.timeTo || '',
    })
}

async function loadExistingGroups() {
    try {
        const res = await api.get('/staff/discounts')
        const list = (res.data?.data || []) as Discount[]
        existingGroups.value = Array.from(new Set(list.map((x) => x.exclusiveGroup).filter(Boolean) as string[]))
    } catch {}
}

onMounted(async () => {
    try {
        const [cats, prods, sets] = await Promise.all([
            Categories.list({ sort: 'sort:asc' }),
            Products.list({ populate: ['image'], sort: 'name:asc', 'pagination[pageSize]': 500 }),
            OrderSets.list({ sort: 'name:asc', 'pagination[pageSize]': 500 }),
        ])
        categoryList.value = cats
        productList.value = prods
        setList.value = sets
    } catch { /* ignore */ }

    await loadExistingGroups()

    if (route.query.preset === 'cart-tier' && isNew.value) {
        form.level = 'order'
        form.benefitType = 'percent'
        form.benefitValue = 10
        form.exclusiveGroup = 'cart-tier'
        form.name = 'Скидка за сумму чека'
        conditionsEnabled.minSubtotal = true
        conditionsEnabled.deliveryMethods = true
        conditionsValues.minSubtotal = 150000
        conditionsValues.deliveryMethods = ['courier_now']
    }

    const copyFrom = Number(route.query.copyFrom)
    if (isNew.value && copyFrom) {
        await loadCopy(copyFrom)
    }

    if (!isNew.value) {
        await loadExisting(Number(route.params.id))
    }

    // Прокрутка к хешу (из «Изменить» в карточке).
    if (route.hash) {
        setTimeout(() => {
            const el = document.getElementById(route.hash.slice(1))
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }, 50)
    }

    // Старт отслеживания изменений.
    setTimeout(() => { dirty.value = false; watchDirty() }, 300)
})

function watchDirty() {
    const trigger = () => { dirty.value = true }
    watch(form, trigger, { deep: true })
    watch(targetsForm, trigger, { deep: true })
    watch(conditionsEnabled, trigger, { deep: true })
    watch(conditionsValues, trigger, { deep: true })
}

// Prevent accidental leave.
function beforeUnload(e: BeforeUnloadEvent) {
    if (dirty.value && !saving.value) { e.preventDefault(); e.returnValue = '' }
}
window.addEventListener('beforeunload', beforeUnload)
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))

onBeforeRouteLeave((_to, _from, next) => {
    if (!dirty.value || saving.value) return next()
    confirm.require({
        header: 'Выйти без сохранения?',
        message: 'Внесённые изменения будут потеряны.',
        accept: () => next(),
        reject: () => next(false),
    })
})

// ─── payload build ───
function buildConditionsPayload() {
    const c: Record<string, any> = {}
    if (conditionsEnabled.minSubtotal && (conditionsValues.minSubtotal || 0) > 0) c.minSubtotal = conditionsValues.minSubtotal
    if (conditionsEnabled.minQty && (conditionsValues.minQty || 0) > 1) c.minQty = conditionsValues.minQty
    if (conditionsEnabled.deliveryMethods && conditionsValues.deliveryMethods.length) c.deliveryMethods = conditionsValues.deliveryMethods
    if (conditionsEnabled.paymentMethods && conditionsValues.paymentMethods.length) c.paymentMethods = conditionsValues.paymentMethods
    if (conditionsEnabled.weekdays && conditionsValues.weekdays.length) c.weekdays = conditionsValues.weekdays
    if (conditionsEnabled.time) {
        if (conditionsValues.timeFrom) c.timeFrom = conditionsValues.timeFrom
        if (conditionsValues.timeTo) c.timeTo = conditionsValues.timeTo
    }
    return Object.keys(c).length ? c : null
}
function buildPayload() {
    return {
        name: form.name.trim(),
        publicLabel: form.publicLabel.trim() || null,
        level: form.level,
        benefitType: form.benefitType,
        benefitValue: Number(form.benefitValue),
        maxDiscountAmount: form.maxDiscountEnabled ? form.maxDiscountAmount : null,
        startsAt: form.startsAt ? form.startsAt.toISOString() : null,
        endsAt: form.endsAt ? form.endsAt.toISOString() : null,
        conditions: buildConditionsPayload(),
        priority: Number(form.priority) || 100,
        stackable: form.stackable,
        exclusiveGroup: form.exclusiveGroup.trim() || null,
        showInCatalog: form.showInCatalog,
        targets: formToTargets(targetsForm, form.level),
    }
}

// ─── validation (клиентская, предохраняет от обязательных ошибок) ───
function validate(): boolean {
    for (const k of Object.keys(errors)) delete errors[k]
    if (!form.name.trim()) errors.name = 'Укажите название'
    if (!(form.benefitValue > 0)) errors.benefitValue = 'Значение должно быть больше 0'
    if (form.benefitType === 'percent' && (form.benefitValue < 1 || form.benefitValue > 99)) errors.benefitValue = 'Процент — от 1 до 99'
    if (form.level === 'line' && !targetsForm.allProducts && !targetsForm.productIds.length && !targetsForm.categoryIds.length) {
        errors.targets = 'Выберите товары или категории'
    }
    if (form.level === 'set' && !targetsForm.orderSetIds.length) {
        errors.targets = 'Выберите хотя бы один набор'
    }
    if (form.startsAt && form.endsAt && form.startsAt >= form.endsAt) {
        errors.period = 'Начало должно быть раньше окончания'
    }
    return Object.keys(errors).length === 0
}

async function save() {
    if (!validate()) {
        toast.add({ severity: 'warn', summary: 'Проверьте форму', life: 2500 })
        // Прокрутка к первой ошибке.
        const firstErr = Object.keys(errors)[0]
        if (firstErr) {
            const el = document.querySelector(`[data-error-anchor="${firstErr}"]`)
            if (el) (el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
        return
    }

    // Confirm при редактировании active с версионированием.
    if (!isNew.value && existingStatus.value === 'active' && existingApplications.value > 0) {
        return new Promise<void>((resolve) => {
            confirm.require({
                header: 'Сохранить изменения',
                message: 'Если изменены тип, размер, условия или цели — будет создана новая версия. Оформленные заказы останутся на предыдущей.',
                accept: async () => { await doSave(); resolve() },
                reject: () => resolve(),
            })
        })
    }
    await doSave()
}

async function doSave() {
    saving.value = true
    const payload = buildPayload()
    try {
        if (isNew.value) {
            const res = await api.post('/staff/discounts', payload)
            const created = res.data?.data as Discount
            dirty.value = false
            toast.add({ severity: 'success', summary: 'Черновик сохранён', life: 1800 })
            router.replace(`/discounts/${created.id}`)
        } else {
            const res = await api.patch(`/staff/discounts/${discountId.value}`, payload)
            const updated = res.data?.data as Discount
            dirty.value = false
            if (res.data?.versionCreated) {
                toast.add({ severity: 'success', summary: `Создана версия ${updated.version}`, life: 2500 })
            } else {
                toast.add({ severity: 'success', summary: 'Сохранено', life: 1800 })
            }
            router.replace(`/discounts/${updated.id}`)
        }
    } catch (e: any) {
        const err = e?.response?.data?.error
        if (err?.details?.code === 'STATUS_NOT_EDITABLE') {
            toast.add({ severity: 'error', summary: 'Статус меняется кнопками в карточке', life: 3500 })
        } else {
            toast.add({ severity: 'error', summary: 'Не удалось сохранить', detail: err?.message, life: 3500 })
        }
    } finally { saving.value = false }
}

function cancel() {
    router.push(discountId.value ? `/discounts/${discountId.value}` : '/discounts')
}

// Смена типа при заполненных целях.
function changeLevel(to: DiscountLevel) {
    if (form.level === to) return
    const hasTargets = targetsForm.allProducts || targetsForm.productIds.length || targetsForm.categoryIds.length || targetsForm.orderSetIds.length
    if (hasTargets) {
        confirm.require({
            header: 'Изменить тип скидки',
            message: 'Выбранные товары/наборы будут сброшены.',
            accept: () => {
                form.level = to
                targetsForm.allProducts = false
                targetsForm.productIds = []
                targetsForm.categoryIds = []
                targetsForm.excludeProductIds = []
                targetsForm.orderSetIds = []
            },
        })
    } else {
        form.level = to
    }
}

// Живое превью (debounce).
function schedulePreview() {
    if (previewTimer) clearTimeout(previewTimer)
    previewTimer = setTimeout(doPreview, 400)
}
async function doPreview() {
    if (!form.name.trim() || !(form.benefitValue > 0)) { livePreview.value = null; return }
    try {
        const res = await api.post('/staff/discounts/preview', { draft: { ...buildPayload() } })
        livePreview.value = res.data?.data
    } catch { livePreview.value = null }
}
watch([() => form.level, () => form.benefitType, () => form.benefitValue, () => form.name, () => form.publicLabel, targetsForm, conditionsEnabled, conditionsValues], schedulePreview, { deep: true })

const liveDescription = computed(() => describeDiscount({
    name: form.name,
    publicLabel: form.publicLabel,
    level: form.level,
    benefitType: form.benefitType,
    benefitValue: form.benefitValue,
    maxDiscountAmount: form.maxDiscountEnabled ? form.maxDiscountAmount : null,
    startsAt: form.startsAt?.toISOString() || null,
    endsAt: form.endsAt?.toISOString() || null,
    conditions: buildConditionsPayload() as any,
    targets: formToTargets(targetsForm, form.level).map((t) => ({
        targetType: t.targetType, exclude: t.exclude,
        product: t.product ? { id: t.product, name: productList.value.find((p) => p.id === t.product)?.name || '' } : undefined,
        category: t.category ? { id: t.category, name: categoryList.value.find((c) => c.id === t.category)?.name || '' } : undefined,
        orderSet: t.orderSet ? { id: t.orderSet, name: setList.value.find((s) => s.id === t.orderSet)?.name || '' } : undefined,
    })) as any,
}))

// Быстрые периоды.
function presetPeriod(kind: 'none' | 'today' | '7d' | 'month') {
    const now = new Date()
    if (kind === 'none') { form.startsAt = null; form.endsAt = null; return }
    if (kind === 'today') { form.startsAt = now; const end = new Date(now); end.setHours(23, 59, 0); form.endsAt = end; return }
    if (kind === '7d') { form.startsAt = now; form.endsAt = new Date(now.getTime() + 7 * 86400 * 1000); return }
    if (kind === 'month') {
        form.startsAt = now
        const eom = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59)
        form.endsAt = eom
    }
}

const blockStatus = (keys: string[], filled: boolean) => filled ? '✓' : '·'
const nameFilled = computed(() => Boolean(form.name.trim()))
const benefitFilled = computed(() => form.benefitValue > 0)
const targetsFilled = computed(() => {
    if (form.level === 'order') return true
    if (form.level === 'line') return targetsForm.allProducts || targetsForm.productIds.length > 0 || targetsForm.categoryIds.length > 0
    return targetsForm.orderSetIds.length > 0
})
const periodFilled = computed(() => Boolean(form.startsAt || form.endsAt))
const conditionsFilled = computed(() => Object.values(conditionsEnabled).some(Boolean))

const navSections = computed(() => [
    { id: 'name', label: '1. Название', st: blockStatus(['name'], nameFilled.value), err: !!errors.name },
    { id: 'level', label: '2. Тип скидки', st: '✓', err: false },
    { id: 'benefit', label: '3. Размер скидки', st: blockStatus(['benefit'], benefitFilled.value), err: !!errors.benefitValue },
    ...(form.level !== 'order' ? [{ id: 'targets', label: '4. На что действует', st: blockStatus(['t'], targetsFilled.value), err: !!errors.targets }] : []),
    { id: 'conditions', label: '5. Условия', st: blockStatus(['c'], conditionsFilled.value), err: false },
    { id: 'period', label: '6. Период', st: blockStatus(['p'], periodFilled.value), err: !!errors.period },
    { id: 'visibility', label: '7. Показ клиентам', st: '·', err: false },
    { id: 'stacking', label: '8. Сочетание', st: '·', err: false },
])

function scrollTo(id: string) {
    const el = document.getElementById(id)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function fmt(v: number) { return new Intl.NumberFormat('ru-RU').format(v) + ' сум' }

const firstTargetProduct = computed(() => {
    const pid = targetsForm.productIds[0] || (targetsForm.allProducts && productList.value[0]?.id)
    if (!pid) return null
    return productList.value.find((p) => p.id === pid) || null
})
const livePriceSample = computed(() => {
    const p = firstTargetProduct.value
    if (!p) return null
    const base = Number((p as any).pricing?.basePrice ?? p.price)
    if (!(base > 0)) return null
    let next = base
    if (form.benefitType === 'percent') next = Math.round(base * (1 - form.benefitValue / 100))
    else if (form.benefitType === 'fixed_amount') next = Math.max(1, base - form.benefitValue)
    else if (form.benefitType === 'fixed_price') next = Math.max(1, form.benefitValue)
    return { name: p.name, base, next, warn: form.benefitType === 'fixed_price' && form.benefitValue > base }
})

function toggleWeekdayPreset(kind: 'weekdays' | 'weekends') {
    conditionsEnabled.weekdays = true
    conditionsValues.weekdays = kind === 'weekdays' ? [1, 2, 3, 4, 5] : [6, 7]
}
</script>

<template>
    <AppTopbar :title="isNew ? 'Новая скидка' : (form.name || 'Редактирование')"
               :subtitle="isNew ? 'Создайте правило скидки' : 'Редактирование'">
        <template #actions>
            <Button label="Отмена" severity="secondary" text @click="cancel" />
            <Button :label="isNew ? 'Сохранить черновик' : 'Сохранить'"
                    icon="pi pi-check" severity="primary" :loading="saving" @click="save" />
        </template>
    </AppTopbar>

    <div v-if="loading" class="p-8 text-ink-400">Загрузка…</div>

    <div v-else class="p-8 flex flex-col md:flex-row md:items-start gap-6 max-w-[1500px]">
        <!-- Навигация — слева от формы -->
        <aside class="shrink-0 md:w-[220px] md:sticky md:top-20">
            <nav class="bg-white rounded-2xl p-3 flex flex-col gap-1">
                <button v-for="s in navSections" :key="s.id" type="button"
                        @click="scrollTo(s.id)"
                        class="flex items-center justify-between px-3 py-2 rounded-xl text-sm text-left hover:bg-ink-50"
                        :class="s.err ? 'text-tomato-600 font-semibold' : ''">
                    <span>{{ s.label }}</span>
                    <span class="text-xs" :class="s.err ? 'text-tomato-600' : 'text-ink-400'">
                        {{ s.err ? '!' : s.st }}
                    </span>
                </button>
            </nav>
        </aside>

        <!-- Форма -->
        <main class="flex-1 min-w-0 space-y-6">
            <!-- 1. Название -->
            <section id="name" class="bg-white rounded-2xl p-6 space-y-3 scroll-mt-24" data-error-anchor="name">
                <h2 class="font-display font-bold">1. Название и подпись для клиента</h2>
                <p class="text-sm text-ink-500">Название видно только сотрудникам. Подпись — то, что увидит клиент на бейдже и странице «Скидки».</p>
                <div>
                    <label class="text-sm font-semibold">Название</label>
                    <InputText v-model="form.name" placeholder="Борщ −20% ноябрь" class="mt-1 w-full" />
                    <div v-if="errors.name" class="text-xs text-tomato-600 mt-1">{{ errors.name }}</div>
                </div>
                <div>
                    <label class="text-sm font-semibold">Подпись для клиента</label>
                    <InputText v-model="form.publicLabel" placeholder="−20% на борщ до пятницы" class="mt-1 w-full" />
                    <div class="text-xs text-ink-400 mt-1">
                        {{ form.publicLabel.length }}/40 · если пусто — клиент увидит название
                    </div>
                </div>
            </section>

            <!-- 2. Тип -->
            <section id="level" class="bg-white rounded-2xl p-6 space-y-3 scroll-mt-24">
                <h2 class="font-display font-bold">2. Тип скидки</h2>
                <p class="text-sm text-ink-500">На что распространяется скидка.</p>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <button v-for="l in levelCards" :key="l.value" type="button"
                            @click="changeLevel(l.value)"
                            class="rounded-2xl border-2 p-4 text-left transition"
                            :class="form.level === l.value ? 'border-tomato-500 bg-tomato-50' : 'border-ink-200 hover:border-ink-400'">
                        <span class="pi text-xl" :class="l.icon"></span>
                        <div class="mt-2 font-display font-bold">{{ l.title }}</div>
                        <div class="text-xs text-ink-500 mt-1">{{ l.desc }}</div>
                        <div class="text-xs text-ink-400 mt-1">Видно: {{ l.shown }}</div>
                    </button>
                </div>
                <div v-if="!isNew && existingApplications > 0 && existingStatus === 'active'"
                     class="rounded-xl bg-saffron-300/15 p-3 text-sm text-ink-700">
                    Изменение типа создаст новую версию скидки. Старые заказы останутся на предыдущей.
                </div>
            </section>

            <!-- 3. Размер -->
            <section id="benefit" class="bg-white rounded-2xl p-6 space-y-3 scroll-mt-24" data-error-anchor="benefitValue">
                <h2 class="font-display font-bold">3. Размер скидки</h2>
                <p class="text-sm text-ink-500">Сколько клиент экономит.</p>
                <div class="flex flex-wrap gap-2">
                    <button v-for="b in benefitOptions" :key="b.value" type="button"
                            @click="form.benefitType = b.value"
                            class="rounded-xl border px-4 py-2 text-sm transition"
                            :class="form.benefitType === b.value ? 'border-tomato-500 bg-tomato-50 font-semibold' : 'border-ink-200 hover:border-ink-400'">
                        <div>{{ b.label }}</div>
                        <div class="text-xs text-ink-500">{{ b.hint }}</div>
                    </button>
                </div>
                <div class="flex items-center gap-2">
                    <input v-model.number="form.benefitValue" type="number"
                           class="w-32 rounded-xl border border-ink-200 px-4 py-3 focus:outline-none focus:border-ink-900" />
                    <span class="text-ink-500">{{ form.benefitType === 'percent' ? '%' : 'сум' }}</span>
                </div>
                <div v-if="errors.benefitValue" class="text-xs text-tomato-600">{{ errors.benefitValue }}</div>
                <div v-if="livePriceSample" class="text-sm text-ink-600">
                    Пример: «{{ livePriceSample.name }}» {{ fmt(livePriceSample.base) }} → <b>{{ fmt(livePriceSample.next) }}</b>
                    <span v-if="livePriceSample.warn" class="text-tomato-600 ml-2">Цена выше обычной — скидки не будет</span>
                </div>
                <div class="pt-2 border-t border-ink-100">
                    <label class="flex items-center gap-2 text-sm">
                        <input type="checkbox" v-model="form.maxDiscountEnabled" class="size-4" />
                        Ограничить скидку суммой
                    </label>
                    <div v-if="form.maxDiscountEnabled" class="mt-2">
                        <input v-model.number="form.maxDiscountAmount" type="number" placeholder="30000"
                               class="w-40 rounded-xl border border-ink-200 px-3 py-2" />
                        <div class="text-xs text-ink-400 mt-1">Например, −20%, но не больше 30 000 сум на заказ</div>
                    </div>
                </div>
            </section>

            <!-- 4. На что действует -->
            <section v-if="form.level !== 'order'" id="targets" class="bg-white rounded-2xl p-6 space-y-3 scroll-mt-24" data-error-anchor="targets">
                <h2 class="font-display font-bold">4. На что действует</h2>
                <p class="text-sm text-ink-500">
                    <template v-if="form.level === 'line'">Выберите, к каким товарам применяется скидка. Можно сочетать товары и категории, исключить отдельные товары.</template>
                    <template v-else>Выберите один или несколько наборов.</template>
                </p>

                <div v-if="form.level === 'line'" class="space-y-3">
                    <label class="flex items-center gap-2 text-sm">
                        <input type="checkbox" v-model="targetsForm.allProducts" class="size-4" />
                        Все товары
                    </label>
                    <div>
                        <label class="text-sm font-semibold block mb-1">Товары</label>
                        <ProductPickerField v-model="targetsForm.productIds" :products="productList"
                                            :hide-ids="targetsForm.excludeProductIds"
                                            placeholder="Выбрать товары"
                                            dialog-title="Добавить товары" />
                    </div>
                    <div>
                        <label class="text-sm font-semibold">Категории</label>
                        <MultiSelect v-model="targetsForm.categoryIds" :options="categoryList"
                                     option-label="name" option-value="id" filter
                                     placeholder="Выберите категории" class="mt-1 w-full" />
                    </div>
                    <div v-if="targetsForm.allProducts || targetsForm.categoryIds.length">
                        <label class="text-sm font-semibold block mb-1">Кроме товаров</label>
                        <ProductPickerField v-model="targetsForm.excludeProductIds" :products="productList"
                                            :hide-ids="targetsForm.productIds"
                                            placeholder="Выбрать исключения"
                                            dialog-title="Исключить товары" />
                    </div>
                </div>

                <div v-else>
                    <label class="text-sm font-semibold">Наборы</label>
                    <MultiSelect v-model="targetsForm.orderSetIds" :options="setList"
                                 option-label="name" option-value="id" filter
                                 placeholder="Выберите наборы" class="mt-1 w-full" />
                </div>

                <div v-if="errors.targets" class="text-xs text-tomato-600">{{ errors.targets }}</div>
            </section>
            <section v-else class="bg-white rounded-2xl p-6">
                <div class="text-sm text-ink-500">Скидка действует на весь заказ — ограничения задаются в условиях.</div>
            </section>

            <!-- 5. Условия -->
            <section id="conditions" class="bg-white rounded-2xl p-6 space-y-3 scroll-mt-24">
                <h2 class="font-display font-bold">5. Условия</h2>
                <p class="text-sm text-ink-500">Когда скидка срабатывает. Без условий — для всех заказов в период действия.</p>

                <div class="space-y-3">
                    <!-- minSubtotal -->
                    <div class="flex items-start gap-3">
                        <input type="checkbox" v-model="conditionsEnabled.minSubtotal" class="size-4 mt-2" />
                        <div class="flex-1">
                            <div class="text-sm font-semibold">Минимальная сумма заказа</div>
                            <div class="text-xs text-ink-500">Скидка сработает, если сумма заказа не меньше N сум.</div>
                            <input v-if="conditionsEnabled.minSubtotal" v-model.number="conditionsValues.minSubtotal" type="number"
                                   class="mt-1 w-40 rounded-xl border border-ink-200 px-3 py-2" placeholder="150000" />
                        </div>
                    </div>
                    <!-- minQty -->
                    <div v-if="form.level === 'line'" class="flex items-start gap-3">
                        <input type="checkbox" v-model="conditionsEnabled.minQty" class="size-4 mt-2" />
                        <div class="flex-1">
                            <div class="text-sm font-semibold">Минимальное количество</div>
                            <div class="text-xs text-ink-500">Нужно купить не меньше N шт. этого товара.</div>
                            <input v-if="conditionsEnabled.minQty" v-model.number="conditionsValues.minQty" type="number"
                                   class="mt-1 w-28 rounded-xl border border-ink-200 px-3 py-2" placeholder="2" />
                        </div>
                    </div>
                    <!-- delivery -->
                    <div class="flex items-start gap-3">
                        <input type="checkbox" v-model="conditionsEnabled.deliveryMethods" class="size-4 mt-2" />
                        <div class="flex-1">
                            <div class="text-sm font-semibold">Способ получения</div>
                            <MultiSelect v-if="conditionsEnabled.deliveryMethods" v-model="conditionsValues.deliveryMethods"
                                         :options="deliveryOptions" option-label="label" option-value="value"
                                         placeholder="Любые" class="mt-1 w-full max-w-md" />
                        </div>
                    </div>
                    <!-- payment -->
                    <div class="flex items-start gap-3">
                        <input type="checkbox" v-model="conditionsEnabled.paymentMethods" class="size-4 mt-2" />
                        <div class="flex-1">
                            <div class="text-sm font-semibold">Способ оплаты</div>
                            <MultiSelect v-if="conditionsEnabled.paymentMethods" v-model="conditionsValues.paymentMethods"
                                         :options="paymentOptions" option-label="label" option-value="value"
                                         placeholder="Любые" class="mt-1 w-full max-w-md" />
                        </div>
                    </div>
                    <!-- weekdays -->
                    <div class="flex items-start gap-3">
                        <input type="checkbox" v-model="conditionsEnabled.weekdays" class="size-4 mt-2" />
                        <div class="flex-1">
                            <div class="text-sm font-semibold">Дни недели</div>
                            <div v-if="conditionsEnabled.weekdays" class="mt-1 space-y-2">
                                <div class="flex flex-wrap gap-1">
                                    <button v-for="w in weekdayOptions" :key="w.value" type="button"
                                            @click="conditionsValues.weekdays.includes(w.value)
                                                ? conditionsValues.weekdays.splice(conditionsValues.weekdays.indexOf(w.value), 1)
                                                : conditionsValues.weekdays.push(w.value)"
                                            class="w-10 h-10 rounded-full text-sm font-semibold"
                                            :class="conditionsValues.weekdays.includes(w.value) ? 'bg-tomato-500 text-white' : 'bg-ink-100'">
                                        {{ w.label }}
                                    </button>
                                </div>
                                <div class="flex gap-2">
                                    <Button size="small" severity="secondary" outlined label="Будни" @click="toggleWeekdayPreset('weekdays')" />
                                    <Button size="small" severity="secondary" outlined label="Выходные" @click="toggleWeekdayPreset('weekends')" />
                                </div>
                            </div>
                        </div>
                    </div>
                    <!-- time -->
                    <div class="flex items-start gap-3">
                        <input type="checkbox" v-model="conditionsEnabled.time" class="size-4 mt-2" />
                        <div class="flex-1">
                            <div class="text-sm font-semibold">Время</div>
                            <div class="text-xs text-ink-500">По Ташкенту.</div>
                            <div v-if="conditionsEnabled.time" class="mt-1 flex items-center gap-2">
                                <InputText v-model="conditionsValues.timeFrom" placeholder="10:00" class="w-24" />
                                —
                                <InputText v-model="conditionsValues.timeTo" placeholder="22:00" class="w-24" />
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <!-- 6. Период -->
            <section id="period" class="bg-white rounded-2xl p-6 space-y-3 scroll-mt-24" data-error-anchor="period">
                <h2 class="font-display font-bold">6. Период</h2>
                <p class="text-sm text-ink-500">Когда скидка действует. Время — по Ташкенту.</p>
                <div class="flex flex-wrap gap-2">
                    <Button size="small" severity="secondary" outlined label="Бессрочно" @click="presetPeriod('none')" />
                    <Button size="small" severity="secondary" outlined label="Сегодня" @click="presetPeriod('today')" />
                    <Button size="small" severity="secondary" outlined label="7 дней" @click="presetPeriod('7d')" />
                    <Button size="small" severity="secondary" outlined label="До конца месяца" @click="presetPeriod('month')" />
                </div>
                <div class="grid grid-cols-2 gap-3 max-w-md">
                    <div>
                        <label class="text-sm font-semibold">С</label>
                        <DatePicker v-model="form.startsAt" show-time hour-format="24" class="mt-1 w-full" />
                    </div>
                    <div>
                        <label class="text-sm font-semibold">По</label>
                        <DatePicker v-model="form.endsAt" show-time hour-format="24" class="mt-1 w-full" />
                    </div>
                </div>
                <div v-if="errors.period" class="text-xs text-tomato-600">{{ errors.period }}</div>
                <p class="text-xs text-ink-400">Скидка с будущей датой после активации будет «Запланирована» и включится сама.</p>
            </section>

            <!-- 7. Показ -->
            <section id="visibility" class="bg-white rounded-2xl p-6 space-y-3 scroll-mt-24">
                <h2 class="font-display font-bold">7. Показ клиентам</h2>
                <label class="flex items-center gap-2 text-sm">
                    <input type="checkbox" v-model="form.showInCatalog" class="size-4" />
                    Показывать в каталоге и на странице «Скидки»
                </label>
                <p class="text-xs text-ink-400">Если выключено — бейджа и страницы не будет, но скидка всё равно применится в корзине (например, для скрытых скидок по способу оплаты).</p>
            </section>

            <!-- 8. Сочетание -->
            <section id="stacking" class="bg-white rounded-2xl p-6 space-y-3 scroll-mt-24">
                <h2 class="font-display font-bold">8. Сочетание с другими скидками</h2>
                <p class="text-sm text-ink-500">Нужно, только если на один товар или чек может действовать несколько скидок одновременно.</p>
                <label class="flex items-center gap-2 text-sm">
                    <input type="checkbox" v-model="form.stackable" class="size-4" />
                    Можно сочетать с другими скидками
                </label>
                <p class="text-xs text-ink-400">Если выключено, из подходящих скидок того же типа применится одна — самая выгодная для клиента.</p>
                <div>
                    <label class="text-sm font-semibold">Группа</label>
                    <input v-model="form.exclusiveGroup" list="group-list" class="mt-1 w-full max-w-md rounded-xl border border-ink-200 px-3 py-2" />
                    <datalist id="group-list">
                        <option v-for="g in existingGroups" :key="g" :value="g" />
                    </datalist>
                    <p class="text-xs text-ink-400 mt-1">Из скидок одной группы клиент получит только одну, самую выгодную. Пример: пороги «−5% от 150 000», «−10% от 250 000» в группе «cart-tier».</p>
                </div>
                <div>
                    <label class="text-sm font-semibold">Порядок применения</label>
                    <input v-model.number="form.priority" type="number"
                           class="mt-1 w-32 rounded-xl border border-ink-200 px-3 py-2" />
                    <p class="text-xs text-ink-400 mt-1">Меньше — раньше. Важен, только если скидки сочетаются.</p>
                </div>
                <p class="text-xs text-ink-500 pt-2 border-t border-ink-100">
                    Скидки на товары, наборы и чек всегда применяются по очереди: сначала товары, потом наборы, потом чек.
                </p>
            </section>
        </main>

        <!-- Правая колонка: итог. Показываем на xl, иначе занимает место формы. -->
        <aside class="hidden xl:block shrink-0 xl:w-[340px] space-y-4 xl:sticky xl:top-20">
            <div class="bg-white rounded-2xl p-5">
                <div class="font-display font-bold mb-2">Итог</div>
                <div class="text-lg font-display font-black text-tomato-600">
                    {{ benefitLabel({ benefitType: form.benefitType, benefitValue: form.benefitValue }) }}
                </div>
                <div class="text-sm text-ink-600 mt-2">{{ liveDescription }}</div>
                <div v-if="livePreview?.notes?.length" class="mt-3 space-y-2">
                    <div v-for="(n, i) in livePreview.notes" :key="i"
                         class="text-xs flex gap-1.5 items-start bg-saffron-300/15 rounded-xl p-2">
                        <span class="pi pi-info-circle mt-0.5"></span>
                        <span>{{ n.message }}</span>
                    </div>
                </div>
            </div>
        </aside>
    </div>
</template>
