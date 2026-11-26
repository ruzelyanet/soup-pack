<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import AppTopbar from '@/components/AppTopbar.vue'
import ProductPickerField from '@/components/ProductPickerField.vue'
import PhoneFrame from '@/components/client-preview/PhoneFrame.vue'
import SectionIcon, { SECTION_ICONS } from '@/components/SectionIcon.vue'
import { mediaUrl } from '@/services/api'
import { HomeSections, Categories, Products, OrderSets,
         type HomeSection, type Category, type Product, type OrderSet } from '@/services/resources'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import Select from 'primevue/select'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import ToggleSwitch from 'primevue/toggleswitch'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'

const toast = useToast()
const confirm = useConfirm()

/* ───────────── Данные ───────────── */
const list = ref<HomeSection[]>([])
const cats = ref<Category[]>([])
const prods = ref<Product[]>([])
const sets = ref<OrderSet[]>([])
const loading = ref(true)
const err = ref<string | null>(null)

async function reload() {
    loading.value = true
    err.value = null
    try {
        const [sections, categories, products, orderSets] = await Promise.all([
            HomeSections.list({ sort: 'sort:asc', populate: ['category', 'products'] }),
            Categories.list({ sort: 'sort:asc' }),
            Products.list({ sort: 'id:asc', 'pagination[pageSize]': 200, populate: ['image', 'category'] }),
            OrderSets.list({ sort: 'createdAt:desc', populate: { items: { populate: { product: { populate: ['image'] } } } } }).catch(() => [] as OrderSet[]),
        ])
        list.value = sections
        cats.value = categories
        prods.value = products
        sets.value = orderSets
    } catch (e: any) {
        err.value = e?.response?.status
            ? `${e.response.status} ${e.response.statusText}: ${e?.response?.data?.error?.message || ''}`
            : 'Нет связи с API — запустите backend (cd backend && npm run develop)'
    } finally {
        loading.value = false
    }
}
onMounted(reload)

const productById = computed(() => new Map(prods.value.map((p) => [Number(p.id), p])))
/** Клиент видит только опубликованные наборы. */
const publishedSets = computed(() => sets.value.filter((s) => s.publishedAt !== null))

/* ───────────── Типы секций и что в них попадает ───────────── */
type SectionType = 'manual' | 'category' | 'hits' | 'sets'

const TYPES: Array<{ id: SectionType; title: string; text: string; icon: string }> = [
    { id: 'manual',   title: 'Подборка',       text: 'Вы сами выбираете блюда и их порядок', icon: 'pi pi-list' },
    { id: 'category', title: 'Вся категория',  text: 'Все блюда категории, новые добавятся сами', icon: 'pi pi-folder' },
    { id: 'hits',     title: 'Хиты',           text: 'Блюда с тегом «хит»', icon: 'pi pi-star' },
    { id: 'sets',     title: 'Наборы',         text: 'Опубликованные наборы из конструктора', icon: 'pi pi-box' },
]
const typeMeta = (t: SectionType) => TYPES.find((x) => x.id === t)!

function typeOf(s: Pick<HomeSection, 'isHits' | 'isSets' | 'fromCategory'>): SectionType {
    if (s.isSets) return 'sets'
    if (s.isHits) return 'hits'
    if (s.fromCategory) return 'category'
    return 'manual'
}

interface SectionLike {
    type: SectionType
    categoryId: number | null
    productIds: number[]
    limit: number | null
    visible: boolean
}
function toLike(s: HomeSection): SectionLike {
    return {
        type: typeOf(s),
        categoryId: s.category?.id ?? null,
        productIds: (s.products || []).map((p) => Number(p.id)),
        limit: s.limit ?? null,
        visible: s.visible,
    }
}

/** Все товары секции по её правилу (включая те, что не в наличии). */
function allProducts(s: SectionLike): Product[] {
    switch (s.type) {
        case 'sets': return []
        case 'hits': return prods.value.filter((p) => p.tags?.includes('хит'))
        case 'category': return s.categoryId ? prods.value.filter((p) => p.category?.id === s.categoryId) : []
        default: return s.productIds.map((id) => productById.value.get(id)).filter(Boolean) as Product[]
    }
}
/** Ровно то, что покажет сайт: в наличии + лимит. */
function shownProducts(s: SectionLike): Product[] {
    const av = allProducts(s).filter((p) => p.available !== false)
    return s.limit && s.type !== 'manual' ? av.slice(0, s.limit) : av
}

type Tone = 'ok' | 'info' | 'warn' | 'off'
interface Status { tone: Tone; text: string; onSite: boolean; hasBlock: boolean }

/** Видна ли секция на сайте и почему — та же логика, что в client/pages/index.vue. */
function statusOf(s: SectionLike): Status {
    if (!s.visible) return { tone: 'off', text: 'Скрыта вручную', onSite: false, hasBlock: false }
    if (s.type === 'sets') {
        return publishedSets.value.length
            ? { tone: 'ok', text: `На сайте · ${publishedSets.value.length} наборов`, onSite: true, hasBlock: true }
            : { tone: 'warn', text: 'Не видна: нет опубликованных наборов', onSite: false, hasBlock: false }
    }
    if (s.type === 'category' && !s.categoryId) {
        return { tone: 'warn', text: 'Не видна: не выбрана категория', onSite: false, hasBlock: false }
    }
    const all = allProducts(s)
    const shown = shownProducts(s)
    const hidden = all.filter((p) => p.available === false).length
    if (!shown.length) {
        if (s.categoryId && s.type === 'manual') {
            return { tone: 'info', text: 'Только пункт меню — блок пуст, клик ведёт в категорию', onSite: true, hasBlock: false }
        }
        const why = s.type === 'hits' ? 'нет блюд с тегом «хит» в наличии'
            : s.type === 'category' ? 'в категории нет блюд в наличии'
            : all.length ? 'все блюда не в наличии' : 'не выбраны блюда'
        return { tone: 'warn', text: `Не видна: ${why}`, onSite: false, hasBlock: false }
    }
    const tail = hidden ? ` · ${hidden} не в наличии` : ''
    return { tone: hidden ? 'info' : 'ok', text: `На сайте · ${shown.length} ${plural(shown.length)}${tail}`, onSite: true, hasBlock: true }
}

function plural(n: number) {
    const m10 = n % 10, m100 = n % 100
    if (m10 === 1 && m100 !== 11) return 'блюдо'
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return 'блюда'
    return 'блюд'
}

const TONE_CLS: Record<Tone, string> = {
    ok:   'bg-olive-500/12 text-olive-600',
    info: 'bg-saffron-300/25 text-ink-700',
    warn: 'bg-tomato-500/10 text-tomato-600',
    off:  'bg-ink-100 text-ink-400',
}

/** Куда ведёт клик по пункту меню на сайте. */
function targetText(s: SectionLike): string {
    if (s.type === 'sets') return 'Клик → страница наборов'
    if (s.type === 'hits') return 'Клик → прокрутка к блоку, «Все →» на /hits'
    const c = cats.value.find((x) => x.id === s.categoryId)
    if (c) return `Клик → категория «${c.name}»`
    return 'Клик → прокрутка к блоку'
}

const rows = computed(() => list.value.map((s) => {
    const like = toLike(s)
    return { s, like, type: like.type, status: statusOf(like), thumbs: like.type === 'sets'
        ? publishedSets.value.slice(0, 4).map((o) => ({ key: 'set' + o.id, img: mediaUrl(o.items?.[0]?.product?.image?.url), label: o.name }))
        : allProducts(like).slice(0, 5).map((p) => ({ key: 'p' + p.id, img: mediaUrl(p.image?.url), label: p.name, off: p.available === false })),
        total: like.type === 'sets' ? publishedSets.value.length : allProducts(like).length }
}))

const stats = computed(() => {
    const onSite = rows.value.filter((r) => r.status.onSite).length
    const warn = rows.value.filter((r) => r.status.tone === 'warn').length
    return { onSite, warn, total: rows.value.length }
})

/* ───────────── Быстрые действия в списке ───────────── */
async function toggleVisible(s: HomeSection, v: boolean) {
    const prev = s.visible
    s.visible = v
    try {
        await HomeSections.update(s.documentId, { visible: v })
        toast.add({ severity: 'success', summary: v ? 'Секция показана' : 'Секция скрыта', life: 1400 })
    } catch (e: any) {
        s.visible = prev
        toast.add({ severity: 'error', summary: 'Не сохранилось', detail: e?.response?.data?.error?.message || e?.message, life: 3000 })
    }
}

function askRemove(s: HomeSection) {
    confirm.require({
        header: 'Удалить секцию?',
        message: `«${s.title}» пропадёт с главной. Блюда и категории не затронуты.`,
        icon: 'pi pi-trash',
        acceptLabel: 'Удалить',
        rejectLabel: 'Отмена',
        acceptProps: { severity: 'danger' },
        rejectProps: { severity: 'secondary', outlined: true },
        accept: async () => {
            try {
                await HomeSections.remove(s.documentId)
                list.value = list.value.filter((x) => x.documentId !== s.documentId)
                await persistOrder(true)
                toast.add({ severity: 'success', summary: 'Удалено', life: 1400 })
            } catch (e: any) {
                toast.add({ severity: 'error', summary: 'Ошибка', detail: e?.message, life: 3000 })
            }
        },
    })
}

async function duplicate(s: HomeSection) {
    try {
        await HomeSections.create({
            title: `${s.title} (копия)`,
            icon: s.icon ?? null,
            sort: list.value.length + 1,
            visible: false,
            isHits: s.isHits, isSets: s.isSets, fromCategory: !!s.fromCategory,
            limit: s.limit ?? null,
            category: (s.category?.id ?? null) as any,
            products: (s.products || []).map((p) => p.id) as any,
        } as any)
        toast.add({ severity: 'success', summary: 'Копия создана — она скрыта', life: 2000 })
        await reload()
    } catch (e: any) {
        toast.add({ severity: 'error', summary: 'Ошибка', detail: e?.response?.data?.error?.message || e?.message, life: 3000 })
    }
}

/* ───────────── Порядок: перетаскивание + стрелки ───────────── */
const dragFrom = ref<number | null>(null)
const dragOver = ref<number | null>(null)
const savingOrder = ref(false)

function onDragStart(i: number, e: DragEvent) {
    dragFrom.value = i
    e.dataTransfer?.setData('text/plain', String(i))
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}
function onDrop(i: number) {
    const from = dragFrom.value
    dragFrom.value = null
    dragOver.value = null
    if (from == null || from === i) return
    move(from, i)
}
function move(from: number, to: number) {
    if (to < 0 || to >= list.value.length) return
    const arr = [...list.value]
    const [x] = arr.splice(from, 1)
    arr.splice(to, 0, x)
    list.value = arr
    persistOrder()
}
async function persistOrder(silent = false) {
    const changed = list.value
        .map((s, i) => ({ s, sort: i + 1 }))
        .filter(({ s, sort }) => s.sort !== sort)
    if (!changed.length) return
    savingOrder.value = true
    try {
        await Promise.all(changed.map(({ s, sort }) => HomeSections.update(s.documentId, { sort })))
        changed.forEach(({ s, sort }) => { s.sort = sort })
        if (!silent) toast.add({ severity: 'success', summary: 'Порядок сохранён', life: 1200 })
    } catch (e: any) {
        toast.add({ severity: 'error', summary: 'Порядок не сохранился', detail: e?.message, life: 3000 })
        await reload()
    } finally {
        savingOrder.value = false
    }
}

/* ───────────── Редактор ───────────── */
type EditModel = SectionLike & { documentId: string; title: string; icon: string | null; sort: number }
const dialog = ref(false)
const saving = ref(false)
const tried = ref(false)
const blank = (): EditModel => ({
    documentId: '', title: '', icon: 'bowl', sort: list.value.length + 1,
    visible: true, type: 'manual', categoryId: null, productIds: [], limit: null,
})
const edit = ref<EditModel>(blank())

function openNew() {
    edit.value = blank()
    tried.value = false
    dialog.value = true
}
function openEdit(s: HomeSection) {
    edit.value = { ...toLike(s), documentId: s.documentId, title: s.title, icon: s.icon ?? null, sort: s.sort ?? 0 }
    tried.value = false
    dialog.value = true
}
function setType(t: SectionType) {
    edit.value.type = t
    if (t === 'hits' || t === 'sets') edit.value.categoryId = null
    if (t !== 'manual') edit.value.productIds = []
    if (!edit.value.title.trim() && (t === 'hits' || t === 'sets')) edit.value.title = t === 'hits' ? 'Хиты' : 'Наборы'
    if (t === 'hits' && !edit.value.icon) edit.value.icon = 'star'
    if (t === 'sets' && !edit.value.icon) edit.value.icon = 'gift'
}
function onCategoryPicked(id: number | null) {
    edit.value.categoryId = id
    const c = cats.value.find((x) => x.id === id)
    if (c && !edit.value.title.trim()) edit.value.title = c.name
}

const editStatus = computed(() => statusOf(edit.value))
const editShown = computed(() => shownProducts(edit.value))
const editManual = computed(() => edit.value.productIds.map((id) => productById.value.get(id)).filter(Boolean) as Product[])

const errors = computed(() => {
    const e: Record<string, string> = {}
    if (!edit.value.title.trim()) e.title = 'Введите название'
    if (edit.value.type === 'category' && !edit.value.categoryId) e.category = 'Выберите категорию'
    if (edit.value.type === 'manual' && !edit.value.productIds.length && !edit.value.categoryId) {
        e.products = 'Добавьте блюда или привяжите категорию'
    }
    return e
})

function moveProduct(i: number, d: number) {
    const arr = [...edit.value.productIds]
    const j = i + d
    if (j < 0 || j >= arr.length) return
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
    edit.value.productIds = arr
}
function removeProduct(id: number) {
    edit.value.productIds = edit.value.productIds.filter((x) => x !== id)
}
function addProducts(ids: number[]) {
    edit.value.productIds = [...edit.value.productIds, ...ids.filter((id) => !edit.value.productIds.includes(id))]
}

async function save() {
    tried.value = true
    if (Object.keys(errors.value).length) return
    const m = edit.value
    const data: any = {
        title: m.title.trim(),
        icon: m.icon || null,
        sort: m.sort,
        visible: m.visible,
        isHits: m.type === 'hits',
        isSets: m.type === 'sets',
        fromCategory: m.type === 'category',
        category: m.type === 'manual' || m.type === 'category' ? m.categoryId : null,
        products: m.type === 'manual' ? m.productIds : [],
        limit: m.type === 'category' || m.type === 'hits' ? (m.limit || null) : null,
    }
    saving.value = true
    try {
        if (m.documentId) await HomeSections.update(m.documentId, data)
        else await HomeSections.create(data)
        dialog.value = false
        toast.add({ severity: 'success', summary: 'Сохранено', life: 1600 })
        await reload()
    } catch (e: any) {
        toast.add({ severity: 'error', summary: 'Ошибка', detail: e?.response?.data?.error?.message || e?.message, life: 3000 })
    } finally {
        saving.value = false
    }
}

const categoryOptions = computed(() => cats.value.map((c) => ({ id: c.id, name: c.name })))

/* ───────────── Превью главной ───────────── */
const previewSections = computed(() =>
    rows.value.filter((r) => r.status.onSite).map((r) => ({
        id: r.s.id, title: r.s.title, icon: r.s.icon, type: r.type, hasBlock: r.status.hasBlock,
        products: shownProducts(r.like), allLink: r.type === 'hits' || !!r.like.categoryId || r.type === 'sets',
    })),
)
function price(p: Product) {
    return fmt(Number(p.pricing?.finalPrice ?? p.price ?? 0))
}
function fmt(v: number) {
    return new Intl.NumberFormat('ru-RU').format(v) + ' сум'
}
const img = (p?: Product | null) => mediaUrl(p?.image?.url)
</script>

<template>
    <AppTopbar title="Секции на главной" subtitle="Блок «Что заказать» и подборки блюд под ним">
        <template #actions>
            <span v-if="savingOrder" class="text-xs text-ink-400 mr-2"><i class="pi pi-spin pi-spinner text-[11px] mr-1"></i>Сохраняем порядок…</span>
            <Button icon="pi pi-plus" label="Секция" severity="primary" rounded @click="openNew" />
        </template>
    </AppTopbar>

    <div class="p-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px] max-w-[1500px]">
        <!-- ───── Список ───── -->
        <div class="min-w-0 space-y-4">
            <div v-if="err" class="bg-tomato-500/10 text-tomato-600 rounded-xl p-4 text-sm">{{ err }}</div>

            <div v-if="!loading && list.length" class="flex flex-wrap items-center gap-2 text-sm">
                <span class="bg-white rounded-full px-3 py-1.5 font-semibold">Всего: {{ stats.total }}</span>
                <span class="bg-olive-500/12 text-olive-600 rounded-full px-3 py-1.5 font-semibold">На сайте: {{ stats.onSite }}</span>
                <span v-if="stats.warn" class="bg-tomato-500/10 text-tomato-600 rounded-full px-3 py-1.5 font-semibold">
                    <i class="pi pi-exclamation-triangle text-[11px] mr-1"></i>Требуют внимания: {{ stats.warn }}
                </span>
                <span class="text-ink-400 ml-auto"><i class="pi pi-arrows-v text-[11px] mr-1"></i>Порядок — перетаскиванием</span>
            </div>

            <div v-if="loading" class="bg-white rounded-2xl p-10 text-center text-ink-400">
                <i class="pi pi-spin pi-spinner mr-2"></i>Загрузка…
            </div>

            <div v-else-if="!list.length" class="bg-white rounded-2xl p-10 text-center">
                <div class="size-14 rounded-2xl bg-cream-100 text-tomato-600 mx-auto flex items-center justify-center">
                    <SectionIcon name="bowl" :size="28" />
                </div>
                <div class="font-display font-bold text-lg mt-4">Секций пока нет</div>
                <p class="text-sm text-ink-500 mt-1 max-w-sm mx-auto">
                    Секции — это пункты «Что заказать» на главной и подборки блюд под ними.
                </p>
                <Button class="mt-5" icon="pi pi-plus" label="Создать первую секцию" severity="primary" @click="openNew" />
            </div>

            <ol v-else class="space-y-2.5 list-none p-0 m-0">
                <li v-for="(r, i) in rows" :key="r.s.documentId"
                    draggable="true"
                    @dragstart="onDragStart(i, $event)"
                    @dragover.prevent="dragOver = i"
                    @dragleave="dragOver === i && (dragOver = null)"
                    @drop.prevent="onDrop(i)"
                    @dragend="dragFrom = null; dragOver = null"
                    class="group bg-white rounded-2xl p-3.5 pr-4 flex items-center gap-3 transition border-2"
                    :class="[
                        dragOver === i && dragFrom !== i ? 'border-tomato-500' : 'border-transparent',
                        dragFrom === i ? 'opacity-40' : '',
                        r.status.onSite ? '' : 'bg-white/70',
                    ]">
                    <!-- порядок -->
                    <div class="flex flex-col items-center shrink-0 text-ink-300">
                        <button type="button" class="size-6 rounded hover:bg-ink-100 hover:text-ink-600 disabled:opacity-30"
                                :disabled="i === 0" :aria-label="`Поднять «${r.s.title}»`" @click="move(i, i - 1)">
                            <i class="pi pi-chevron-up text-[11px]"></i>
                        </button>
                        <span class="cursor-grab active:cursor-grabbing text-[11px] font-bold text-ink-400 leading-none py-0.5" title="Перетащите">{{ i + 1 }}</span>
                        <button type="button" class="size-6 rounded hover:bg-ink-100 hover:text-ink-600 disabled:opacity-30"
                                :disabled="i === rows.length - 1" :aria-label="`Опустить «${r.s.title}»`" @click="move(i, i + 1)">
                            <i class="pi pi-chevron-down text-[11px]"></i>
                        </button>
                    </div>

                    <!-- иконка -->
                    <div class="size-12 rounded-xl flex items-center justify-center shrink-0"
                         :class="r.status.onSite ? 'bg-tomato-500/10 text-tomato-600' : 'bg-ink-100 text-ink-400'">
                        <SectionIcon :name="r.s.icon" :size="24" />
                    </div>

                    <!-- текст -->
                    <button type="button" class="flex-1 min-w-0 text-left" @click="openEdit(r.s)">
                        <div class="flex items-center gap-2 flex-wrap">
                            <span class="font-display font-bold text-[15px] truncate" :class="r.status.onSite ? '' : 'text-ink-400'">{{ r.s.title }}</span>
                            <span class="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-ink-100 text-ink-500">
                                {{ typeMeta(r.type).title }}
                            </span>
                        </div>
                        <div class="text-xs text-ink-400 mt-1 truncate">{{ targetText(r.like) }}</div>
                        <span class="inline-flex mt-2 rounded-full px-2.5 py-1 text-[11px] font-semibold" :class="TONE_CLS[r.status.tone]">
                            {{ r.status.text }}
                        </span>
                    </button>

                    <!-- превью содержимого -->
                    <div class="hidden md:flex items-center shrink-0">
                        <span v-for="(t, ti) in r.thumbs" :key="t.key" :title="t.label"
                              class="size-10 rounded-full overflow-hidden bg-cream-100 ring-2 ring-white flex items-center justify-center"
                              :class="[ti ? '-ml-3' : '', (t as any).off ? 'opacity-40 grayscale' : '']">
                            <img v-if="t.img" :src="t.img" :alt="t.label" class="w-full h-full object-cover" />
                            <span v-else class="text-[10px] font-bold text-ink-400">{{ t.label.slice(0, 2).toUpperCase() }}</span>
                        </span>
                        <span v-if="r.total > r.thumbs.length"
                              class="size-10 -ml-3 rounded-full ring-2 ring-white bg-ink-100 text-ink-500 text-[11px] font-bold flex items-center justify-center">
                            +{{ r.total - r.thumbs.length }}
                        </span>
                    </div>

                    <!-- действия -->
                    <div class="flex items-center gap-1 shrink-0" @click.stop>
                        <span :title="r.s.visible ? 'Скрыть с сайта' : 'Показать на сайте'" class="inline-flex mr-1">
                            <ToggleSwitch :model-value="r.s.visible" :aria-label="r.s.visible ? 'Скрыть с сайта' : 'Показать на сайте'"
                                          @update:model-value="(v: boolean) => toggleVisible(r.s, v)" />
                        </span>
                        <Button icon="pi pi-pencil" text rounded severity="secondary" aria-label="Редактировать" @click="openEdit(r.s)" />
                        <Button icon="pi pi-clone" text rounded severity="secondary" aria-label="Дублировать"
                                title="Дублировать" @click="duplicate(r.s)" />
                        <Button icon="pi pi-trash" text rounded severity="danger" aria-label="Удалить" @click="askRemove(r.s)" />
                    </div>
                </li>
            </ol>
        </div>

        <!-- ───── Превью главной ───── -->
        <aside class="hidden xl:block">
            <div class="sticky top-6">
                <PhoneFrame title="Так это видно на главной">
                    <div class="h-[680px] overflow-y-auto -m-4 p-4">
                        <div v-if="!previewSections.length" class="py-20 text-center text-sm" style="color: var(--color-fnt)">
                            Ни одна секция сейчас не видна на сайте
                        </div>
                        <template v-else>
                            <div class="font-display font-black text-[22px] tracking-tight mb-3">Что заказать</div>
                            <div class="flex gap-2.5 overflow-x-auto pb-1 -mx-4 px-4">
                                <div v-for="p in previewSections" :key="p.id"
                                     class="shrink-0 w-[160px] h-[58px] rounded-[16px] flex items-center gap-2 px-2.5"
                                     style="background: var(--color-sf); border: 1px solid var(--color-ln2)">
                                    <span class="size-9 rounded-xl flex items-center justify-center shrink-0"
                                          style="background: rgba(214,58,28,.1); color: var(--color-acct)">
                                        <SectionIcon :name="p.icon" :size="20" />
                                    </span>
                                    <span class="font-bold text-[14px] leading-tight line-clamp-2">{{ p.title }}</span>
                                </div>
                            </div>

                            <template v-for="p in previewSections" :key="'b' + p.id">
                                <div v-if="p.hasBlock" class="mt-6">
                                    <div class="flex items-baseline justify-between mb-2.5">
                                        <span class="font-display font-black text-[19px] tracking-tight">{{ p.title }}</span>
                                        <span v-if="p.allLink" class="text-[12px] font-extrabold" style="color: var(--color-acct)">Все →</span>
                                    </div>
                                    <div class="flex gap-2.5 overflow-x-auto -mx-4 px-4 pb-1">
                                        <template v-if="p.type === 'sets'">
                                            <div v-for="o in publishedSets" :key="o.id"
                                                 class="shrink-0 w-[200px] rounded-[20px] p-3.5" style="background: #2A1209; color: #FFF1DC">
                                                <div class="flex">
                                                    <span v-for="(it, k) in (o.items || []).slice(0, 3)" :key="k"
                                                          class="size-11 rounded-full overflow-hidden" :class="k ? '-ml-3' : ''"
                                                          style="box-shadow: 0 0 0 2px #2A1209; background: #F7E0B5">
                                                        <img v-if="img(it.product)" :src="img(it.product)" alt="" class="w-full h-full object-cover" />
                                                    </span>
                                                </div>
                                                <div class="font-bold text-[14px] mt-2 leading-tight">{{ o.name }}</div>
                                            </div>
                                        </template>
                                        <template v-else>
                                            <div v-for="pr in p.products" :key="pr.id"
                                                 class="shrink-0 w-[132px] rounded-[18px] overflow-hidden" style="background: var(--color-sf)">
                                                <div class="h-[92px] flex items-center justify-center" style="background: var(--color-tint-tom)">
                                                    <img v-if="img(pr)" :src="img(pr)" alt="" class="w-full h-full object-cover" />
                                                    <SectionIcon v-else name="bowl" :size="32" class="opacity-40" />
                                                </div>
                                                <div class="p-2">
                                                    <div class="font-extrabold text-[12px] leading-tight line-clamp-2 min-h-[30px]">{{ pr.name }}</div>
                                                    <div class="font-extrabold text-[12px] mt-1">{{ price(pr) }}</div>
                                                </div>
                                            </div>
                                        </template>
                                    </div>
                                </div>
                            </template>
                        </template>
                    </div>
                </PhoneFrame>
                <p class="text-xs text-ink-400 mt-3 px-1 leading-relaxed">
                    Показаны только секции, которые клиент реально увидит: скрытые и пустые сюда не попадают.
                    Блюда не в наличии на сайте не выводятся.
                </p>
            </div>
        </aside>
    </div>

    <!-- ───── Редактор секции ───── -->
    <Dialog v-model:visible="dialog" modal dismissableMask
            :header="edit.documentId ? 'Секция на главной' : 'Новая секция'"
            :style="{ width: '1040px', maxWidth: '96vw' }">
        <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div class="space-y-5 min-w-0">
                <!-- Тип -->
                <div>
                    <div class="text-xs font-bold uppercase tracking-wider text-ink-400 mb-2">Что показывать</div>
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
                        <button v-for="t in TYPES" :key="t.id" type="button" @click="setType(t.id)"
                                class="text-left rounded-xl border-2 p-3 transition"
                                :class="edit.type === t.id ? 'border-tomato-500 bg-tomato-500/5' : 'border-ink-100 hover:border-ink-300'"
                                :aria-pressed="edit.type === t.id">
                            <i :class="[t.icon, edit.type === t.id ? 'text-tomato-600' : 'text-ink-400']" class="text-base"></i>
                            <div class="font-bold text-sm mt-1.5">{{ t.title }}</div>
                            <div class="text-[11px] text-ink-400 leading-snug mt-0.5">{{ t.text }}</div>
                        </button>
                    </div>
                </div>

                <!-- Категория -->
                <div v-if="edit.type === 'category' || edit.type === 'manual'">
                    <label for="hs-cat" class="text-xs font-bold uppercase tracking-wider text-ink-400">
                        {{ edit.type === 'category' ? 'Категория' : 'Категория для «Все →» (необязательно)' }}
                    </label>
                    <Select input-id="hs-cat" :model-value="edit.categoryId" @update:model-value="onCategoryPicked"
                            :options="categoryOptions" option-label="name" option-value="id" filter
                            :placeholder="edit.type === 'category' ? 'Выберите категорию' : 'Не привязана'"
                            show-clear class="mt-1 w-full" :invalid="tried && !!errors.category" />
                    <p v-if="tried && errors.category" class="text-xs text-tomato-600 mt-1">{{ errors.category }}</p>
                    <p v-else-if="edit.type === 'manual'" class="text-xs text-ink-400 mt-1">
                        Тогда клик по пункту меню и ссылка «Все →» откроют категорию целиком.
                    </p>
                </div>

                <!-- Название + иконка -->
                <div>
                    <label for="hs-title" class="text-xs font-bold uppercase tracking-wider text-ink-400">Название</label>
                    <InputText id="hs-title" v-model="edit.title" class="mt-1 w-full" maxlength="40"
                               placeholder="Например: Супы на каждый день" :invalid="tried && !!errors.title" />
                    <div class="flex justify-between text-xs mt-1">
                        <span v-if="tried && errors.title" class="text-tomato-600">{{ errors.title }}</span>
                        <span v-else-if="edit.title.length > 24" class="font-semibold text-[#8a6500]">
                            Длинное название — в плитке меню перенесётся на 2 строки
                        </span>
                        <span v-else></span>
                        <span class="text-ink-300">{{ edit.title.length }}/40</span>
                    </div>
                </div>

                <div>
                    <div class="text-xs font-bold uppercase tracking-wider text-ink-400 mb-2">Иконка</div>
                    <div class="grid grid-cols-6 sm:grid-cols-9 gap-1.5">
                        <button v-for="ic in SECTION_ICONS" :key="ic.name" type="button" @click="edit.icon = ic.name"
                                :title="ic.label" :aria-label="ic.label" :aria-pressed="edit.icon === ic.name"
                                class="aspect-square rounded-xl flex items-center justify-center transition border-2"
                                :class="edit.icon === ic.name ? 'border-tomato-500 bg-tomato-500/10 text-tomato-600' : 'border-transparent bg-ink-50 text-ink-500 hover:bg-ink-100'">
                            <SectionIcon :name="ic.name" :size="22" />
                        </button>
                    </div>
                </div>

                <!-- Подборка: блюда с порядком -->
                <div v-if="edit.type === 'manual'">
                    <div class="flex items-center justify-between mb-2">
                        <span class="text-xs font-bold uppercase tracking-wider text-ink-400">Блюда в подборке · {{ editManual.length }}</span>
                        <ProductPickerField :model-value="[]" :products="prods" :hide-ids="edit.productIds"
                                            :placeholder="editManual.length ? 'Добавить ещё' : 'Выбрать блюда'"
                                            dialog-title="Добавить блюда в подборку"
                                            @update:model-value="addProducts" />
                    </div>
                    <p v-if="tried && errors.products" class="text-xs text-tomato-600 mb-2">{{ errors.products }}</p>
                    <ol v-if="editManual.length" class="list-none m-0 p-0 border border-ink-100 rounded-xl divide-y divide-ink-100 max-h-[300px] overflow-y-auto">
                        <li v-for="(p, i) in editManual" :key="p.id" class="flex items-center gap-3 px-3 py-2">
                            <span class="w-5 text-xs font-bold text-ink-300 text-right">{{ i + 1 }}</span>
                            <span class="size-9 rounded-lg overflow-hidden bg-cream-100 shrink-0" :class="p.available === false ? 'opacity-40 grayscale' : ''">
                                <img v-if="img(p)" :src="img(p)" :alt="p.name" class="w-full h-full object-cover" />
                            </span>
                            <span class="flex-1 min-w-0">
                                <span class="block font-semibold text-sm truncate">{{ p.name }}</span>
                                <span class="block text-xs" :class="p.available === false ? 'text-tomato-600' : 'text-ink-400'">
                                    {{ p.available === false ? 'Не в наличии — на сайте скрыто' : price(p) }}
                                </span>
                            </span>
                            <Button icon="pi pi-arrow-up" text rounded size="small" severity="secondary" :disabled="i === 0"
                                    aria-label="Выше" @click="moveProduct(i, -1)" />
                            <Button icon="pi pi-arrow-down" text rounded size="small" severity="secondary" :disabled="i === editManual.length - 1"
                                    aria-label="Ниже" @click="moveProduct(i, 1)" />
                            <Button icon="pi pi-times" text rounded size="small" severity="danger" aria-label="Убрать" @click="removeProduct(p.id)" />
                        </li>
                    </ol>
                </div>

                <!-- Авто-режимы: лимит и состав -->
                <div v-if="edit.type === 'category' || edit.type === 'hits'" class="grid grid-cols-[180px_1fr] gap-4 items-start">
                    <div>
                        <label for="hs-limit" class="text-xs font-bold uppercase tracking-wider text-ink-400">Сколько показывать</label>
                        <InputNumber input-id="hs-limit" v-model="edit.limit" :min="1" :max="50" show-buttons
                                     placeholder="Все" class="mt-1 w-full" />
                        <p class="text-[11px] text-ink-400 mt-1">Пусто — все. Остальные по «Все →».</p>
                    </div>
                    <div class="bg-ink-50 rounded-xl p-3 text-sm text-ink-600">
                        <template v-if="edit.type === 'hits'">
                            Состав берётся из блюд с тегом <code class="bg-white px-1 rounded">хит</code>
                            — сейчас таких {{ allProducts(edit).length }}. Тег ставится в карточке товара.
                        </template>
                        <template v-else-if="edit.categoryId">
                            В категории {{ allProducts(edit).length }} блюд. Новые блюда этой категории появятся в секции сами.
                        </template>
                        <template v-else>Выберите категорию выше.</template>
                    </div>
                </div>

                <div v-if="edit.type === 'sets'" class="bg-ink-50 rounded-xl p-3 text-sm text-ink-600">
                    Показываются опубликованные наборы из конструктора — сейчас их {{ publishedSets.length }}.
                    Клик по пункту меню ведёт на страницу всех наборов.
                </div>

                <label class="flex items-center gap-3 cursor-pointer bg-ink-50 rounded-xl px-3.5 py-3">
                    <ToggleSwitch v-model="edit.visible" />
                    <span class="text-sm">
                        <span class="font-semibold">Показывать на сайте</span>
                        <span class="block text-xs text-ink-400">Выключите, чтобы подготовить секцию заранее</span>
                    </span>
                </label>
            </div>

            <!-- Превью секции -->
            <div class="min-w-0">
                <PhoneFrame title="Превью">
                    <div class="-m-4 p-4 min-h-[360px]">
                        <div class="w-[170px] h-[58px] rounded-[16px] flex items-center gap-2 px-2.5"
                             style="background: var(--color-sf); border: 1px solid var(--color-ln2)">
                            <span class="size-9 rounded-xl flex items-center justify-center shrink-0"
                                  style="background: rgba(214,58,28,.1); color: var(--color-acct)">
                                <SectionIcon :name="edit.icon" :size="20" />
                            </span>
                            <span class="font-bold text-[14px] leading-tight line-clamp-2">{{ edit.title || 'Название' }}</span>
                        </div>

                        <div class="mt-5 flex items-baseline justify-between">
                            <span class="font-display font-black text-[19px] tracking-tight">{{ edit.title || 'Название' }}</span>
                            <span v-if="edit.type !== 'manual' || edit.categoryId" class="text-[12px] font-extrabold" style="color: var(--color-acct)">Все →</span>
                        </div>
                        <div class="mt-2.5 flex gap-2.5 overflow-x-auto -mx-4 px-4 pb-1">
                            <template v-if="edit.type === 'sets'">
                                <div v-for="o in publishedSets.slice(0, 4)" :key="o.id"
                                     class="shrink-0 w-[170px] rounded-[18px] p-3 text-[13px] font-bold" style="background: #2A1209; color: #FFF1DC">
                                    {{ o.name }}
                                </div>
                            </template>
                            <template v-else>
                                <div v-for="pr in editShown.slice(0, 8)" :key="pr.id"
                                     class="shrink-0 w-[120px] rounded-[16px] overflow-hidden" style="background: var(--color-sf)">
                                    <div class="h-[80px] flex items-center justify-center" style="background: var(--color-tint-tom)">
                                        <img v-if="img(pr)" :src="img(pr)" alt="" class="w-full h-full object-cover" />
                                    </div>
                                    <div class="p-2 font-extrabold text-[11px] leading-tight line-clamp-2">{{ pr.name }}</div>
                                </div>
                            </template>
                        </div>
                        <div class="mt-5 rounded-xl px-3 py-2 text-[12px] font-semibold" :class="TONE_CLS[editStatus.tone]">
                            {{ editStatus.text }}
                        </div>
                    </div>
                </PhoneFrame>
            </div>
        </div>
        <template #footer>
            <Button label="Отмена" severity="secondary" outlined @click="dialog = false" />
            <Button :label="edit.documentId ? 'Сохранить' : 'Создать секцию'" severity="primary" :loading="saving" @click="save" />
        </template>
    </Dialog>
</template>
