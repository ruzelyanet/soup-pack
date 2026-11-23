<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { OrderSets, type OrderSet, type Product } from '@/services/resources'
import { mediaUrl } from '@/services/api'
import ImageUploader from '@/components/ImageUploader.vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import Drawer from 'primevue/drawer'
import { useToast } from 'primevue/usetoast'

const props = defineProps<{
    visible: boolean
    /** null = новый; OrderSet = редактирование. */
    set?: OrderSet | null
    products: Product[]
}>()

const emit = defineEmits<{
    (e: 'update:visible', v: boolean): void
    (e: 'saved', s: OrderSet): void
}>()

const toast = useToast()

type Draft = {
    documentId: string
    name: string
    slug: string
    description: string
    showInCatalog: boolean
    bannerUrl: string
    linkUrl: string
    items: Array<{ productId: number; qty: number }>
}

const edit = ref<Draft>(emptyDraft())

function emptyDraft(): Draft {
    return {
        documentId: '', name: '', slug: '', description: '',
        showInCatalog: true, bannerUrl: '', linkUrl: '', items: [],
    }
}

function fillFromSet(s?: OrderSet | null) {
    if (!s) { edit.value = emptyDraft(); return }
    edit.value = {
        documentId: s.documentId,
        name: s.name,
        slug: s.slug || '',
        description: s.description || '',
        showInCatalog: !!s.showInCatalog,
        bannerUrl: s.banner?.url || '',
        linkUrl: s.linkUrl || '',
        items: (s.items || []).map((it) => ({ productId: it.product?.id || 0, qty: it.qty })),
    }
}

// Каждый раз когда Drawer открывается — пересчитываем draft из входного набора.
watch(() => props.visible, (open) => {
    if (open) fillFromSet(props.set)
})

function productOf(id: number): Product | undefined {
    return props.products.find((p) => p.id === id)
}
function productImgUrl(p?: Product | null): string {
    const img = p?.image
    if (!img) return ''
    if (typeof img === 'string') return mediaUrl(img)
    return mediaUrl((img as { url?: string }).url)
}
function fmt(v: number) { return new Intl.NumberFormat('ru-RU').format(v) + ' сум' }
function removeItem(idx: number) { edit.value.items.splice(idx, 1) }
function computedTotal() {
    return edit.value.items.reduce((s, it) => {
        const p = productOf(it.productId)
        return s + Number(p?.price || 0) * it.qty
    }, 0)
}

// ─── Picker ───
const pickerDialog = ref(false)
const picked = ref<Record<number, boolean>>({})
const pickerPage = ref(0)
const PICKER_PAGE_SIZE = 8
const availableProducts = computed(() =>
    props.products.filter((p) => !edit.value.items.some((it) => it.productId === p.id)),
)
const pickerTotalPages = computed(() =>
    Math.max(1, Math.ceil(availableProducts.value.length / PICKER_PAGE_SIZE)),
)
const pagedProducts = computed(() =>
    availableProducts.value.slice(pickerPage.value * PICKER_PAGE_SIZE, (pickerPage.value + 1) * PICKER_PAGE_SIZE),
)
const pickedCount = computed(() => Object.values(picked.value).filter(Boolean).length)

function openPicker() { picked.value = {}; pickerPage.value = 0; pickerDialog.value = true }
function togglePick(id: number) { picked.value[id] = !picked.value[id] }
function applyPicked() {
    for (const [id, yes] of Object.entries(picked.value)) {
        if (yes) edit.value.items.push({ productId: Number(id), qty: 1 })
    }
    pickerDialog.value = false
}

// ─── Save ───
async function save() {
    const data = {
        name: edit.value.name,
        slug: edit.value.slug || edit.value.name.toLowerCase().replace(/\s+/g, '-'),
        description: edit.value.description,
        showInCatalog: edit.value.showInCatalog,
        linkUrl: edit.value.linkUrl,
        items: edit.value.items.map((it) => {
            const p = productOf(it.productId)
            return { product: p?.documentId ?? null, qty: it.qty }
        }),
    }
    try {
        let saved: OrderSet
        if (edit.value.documentId) {
            saved = await OrderSets.update(edit.value.documentId, data as any)
        } else {
            saved = await OrderSets.create({ ...data, publishedAt: new Date().toISOString() } as any)
        }
        emit('saved', saved)
        emit('update:visible', false)
        toast.add({ severity: 'success', summary: 'Сохранено', life: 1800 })
    } catch (e: any) {
        toast.add({ severity: 'error', summary: 'Ошибка',
            detail: e?.response?.data?.error?.message || e?.message, life: 3500 })
    }
}
</script>

<template>
    <Drawer :visible="visible"
            @update:visible="emit('update:visible', $event)"
            position="right"
            :header="edit.documentId ? 'Редактировать набор' : 'Новый набор'"
            :pt="{ root: { class: '!w-full md:!w-1/2 md:!min-w-[640px]' }, content: { class: 'p-5' } }">
        <div class="space-y-5">
            <div class="grid grid-cols-2 gap-4">
                <div>
                    <label class="text-xs font-bold uppercase tracking-wider text-ink-400">Название</label>
                    <input v-model="edit.name" placeholder="Неделька · 3 человека"
                           class="mt-1 w-full rounded-xl border border-ink-200 px-4 py-3 focus:outline-none focus:border-ink-900" />
                </div>
                <div>
                    <label class="text-xs font-bold uppercase tracking-wider text-ink-400">Slug</label>
                    <input v-model="edit.slug"
                           class="mt-1 w-full rounded-xl border border-ink-200 px-4 py-3 focus:outline-none focus:border-ink-900" />
                </div>
            </div>

            <div>
                <label class="text-xs font-bold uppercase tracking-wider text-ink-400">Описание</label>
                <textarea v-model="edit.description" rows="2"
                          class="mt-1 w-full rounded-xl border border-ink-200 px-4 py-3 focus:outline-none focus:border-ink-900"></textarea>
            </div>

            <div class="bg-ink-50 rounded-xl p-4">
                <div class="flex items-center justify-between">
                    <div class="font-semibold">Состав набора</div>
                    <Button icon="pi pi-plus" label="Добавить товары"
                            size="small" severity="primary" @click="openPicker" />
                </div>
                <div v-if="!edit.items.length"
                     class="mt-3 py-6 text-center text-sm text-ink-400 border-2 border-dashed border-ink-200 rounded-xl">
                    Пока пусто — нажмите «Добавить товары».
                </div>
                <div v-else class="mt-3 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    <div v-for="(it, idx) in edit.items" :key="idx"
                         class="relative bg-white border border-ink-200 rounded-2xl p-3 flex flex-col gap-2">
                        <button type="button" aria-label="Удалить" @click="removeItem(idx)"
                                class="absolute top-2 right-2 size-7 rounded-full bg-ink-50 hover:bg-tomato-500 hover:text-white text-ink-500 flex items-center justify-center transition z-10">
                            <i class="pi pi-times text-xs"></i>
                        </button>
                        <div class="aspect-square rounded-xl overflow-hidden bg-ink-50 flex items-center justify-center">
                            <img v-if="productImgUrl(productOf(it.productId))"
                                 :src="productImgUrl(productOf(it.productId))"
                                 :alt="productOf(it.productId)?.name"
                                 class="w-full h-full object-cover" />
                            <span v-else class="text-ink-300 text-xl font-bold">
                                {{ (productOf(it.productId)?.name || '?').slice(0, 2).toUpperCase() }}
                            </span>
                        </div>
                        <div class="font-semibold text-[13px] leading-tight line-clamp-2 min-h-[32px]">
                            {{ productOf(it.productId)?.name || '— удалён —' }}
                        </div>
                        <div class="text-[12px] font-bold text-tomato-600">
                            {{ fmt(Number(productOf(it.productId)?.price || 0)) }}
                        </div>
                        <div role="group" aria-label="Количество"
                             class="flex items-center bg-tomato-500 text-white rounded-full h-9 self-stretch">
                            <button type="button" aria-label="Меньше"
                                    class="w-9 h-9 text-white font-extrabold text-[16px]"
                                    @click="it.qty = Math.max(1, it.qty - 1)">−</button>
                            <span class="flex-1 text-center font-extrabold text-sm">{{ it.qty }}</span>
                            <button type="button" aria-label="Больше"
                                    class="w-9 h-9 text-white font-extrabold text-[16px]"
                                    @click="it.qty++">+</button>
                        </div>
                    </div>
                </div>
                <div class="mt-4 flex items-center justify-between pt-3 border-t border-ink-100">
                    <span class="text-sm text-ink-400">
                        Сумма без скидки · {{ edit.items.length }} позиций
                    </span>
                    <span class="font-display font-extrabold">{{ fmt(computedTotal()) }}</span>
                </div>
            </div>

            <RouterLink to="/discounts"
                        class="block w-full rounded-xl border-2 border-dashed border-ink-200 hover:border-ink-400 text-ink-500 font-semibold text-sm py-3 text-center transition">
                Скидки на набор — в разделе «Скидки»
            </RouterLink>

            <label class="inline-flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" v-model="edit.showInCatalog" class="size-5" />
                Показывать в каталоге
            </label>

            <ImageUploader v-model="edit.bannerUrl" aspect="card" label="Баннер набора для каталога" />
            <div>
                <label class="text-xs font-bold uppercase tracking-wider text-ink-400">Ссылка при клике</label>
                <input v-model="edit.linkUrl"
                       class="mt-1 w-full rounded-xl border border-ink-200 px-4 py-3 focus:outline-none focus:border-ink-900" />
            </div>
        </div>

        <template #footer>
            <div class="flex justify-end gap-2 w-full">
                <Button label="Отмена" severity="secondary" outlined @click="emit('update:visible', false)" />
                <Button label="Сохранить" severity="primary" @click="save" />
            </div>
        </template>
    </Drawer>

    <!-- Пикер товаров -->
    <Dialog v-model:visible="pickerDialog" modal dismissableMask
            header="Добавить товары в набор"
            :style="{ width: '820px', maxWidth: '95vw' }">
        <div v-if="!availableProducts.length" class="py-10 text-center text-ink-400">
            Все существующие товары уже в наборе.
        </div>
        <template v-else>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div v-for="p in pagedProducts" :key="p.id"
                     @click="togglePick(p.id)"
                     class="relative bg-white border-2 rounded-2xl p-3 flex flex-col gap-2 cursor-pointer transition"
                     :class="picked[p.id] ? 'border-tomato-500 ring-4 ring-tomato-500/15' : 'border-ink-200 hover:border-ink-400'">
                    <div class="absolute top-2 right-2 size-6 rounded-full flex items-center justify-center transition"
                         :class="picked[p.id] ? 'bg-tomato-500 text-white' : 'bg-white border border-ink-200 text-transparent'">
                        <i class="pi pi-check text-[10px]"></i>
                    </div>
                    <div class="aspect-square rounded-xl overflow-hidden bg-ink-50 flex items-center justify-center">
                        <img v-if="productImgUrl(p)" :src="productImgUrl(p)" :alt="p.name"
                             class="w-full h-full object-cover" />
                        <span v-else class="text-ink-300 text-xl font-bold">
                            {{ p.name.slice(0, 2).toUpperCase() }}
                        </span>
                    </div>
                    <div class="font-semibold text-[13px] leading-tight line-clamp-2 min-h-[32px]">
                        {{ p.name }}
                    </div>
                    <div class="text-[12px] font-bold text-tomato-600">
                        {{ fmt(Number(p.price)) }}
                    </div>
                </div>
            </div>
            <div v-if="pickerTotalPages > 1" class="mt-5 flex items-center justify-center gap-2">
                <button type="button" @click="pickerPage = Math.max(0, pickerPage - 1)" :disabled="pickerPage === 0"
                        class="size-9 rounded-xl border border-ink-200 hover:bg-ink-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center">
                    <i class="pi pi-chevron-left text-xs"></i>
                </button>
                <button v-for="n in pickerTotalPages" :key="n" type="button"
                        @click="pickerPage = n - 1"
                        class="size-9 rounded-xl font-bold text-sm transition"
                        :class="pickerPage === n - 1 ? 'bg-ink-900 text-white' : 'bg-white border border-ink-200 hover:bg-ink-50 text-ink-700'">
                    {{ n }}
                </button>
                <button type="button" @click="pickerPage = Math.min(pickerTotalPages - 1, pickerPage + 1)" :disabled="pickerPage >= pickerTotalPages - 1"
                        class="size-9 rounded-xl border border-ink-200 hover:bg-ink-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center">
                    <i class="pi pi-chevron-right text-xs"></i>
                </button>
            </div>
        </template>
        <template #footer>
            <div class="flex w-full items-center justify-between gap-2">
                <span class="text-sm text-ink-500">
                    Выбрано: <b class="text-ink-900">{{ pickedCount }}</b>
                </span>
                <div class="flex gap-2">
                    <Button label="Отмена" severity="secondary" outlined @click="pickerDialog = false" />
                    <Button :label="`Добавить (${pickedCount})`" :disabled="!pickedCount"
                            severity="primary" @click="applyPicked" />
                </div>
            </div>
        </template>
    </Dialog>
</template>
