<!-- Поле выбора товаров через модалку-галерею (как в конструкторе наборов). -->
<script setup lang="ts">
import { computed, ref } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import { mediaUrl } from '@/services/api'
import type { Product } from '@/services/resources'

const props = defineProps<{
    modelValue: number[]
    products: Product[]
    /** id-ы, которые скрыть из выбора (например, уже выбранные в «включениях», когда поле — для исключений). */
    hideIds?: number[]
    placeholder?: string
    dialogTitle?: string
}>()
const emit = defineEmits<{ 'update:modelValue': [v: number[]] }>()

const PICKER_PAGE_SIZE = 8

const open = ref(false)
const picked = ref<Record<number, boolean>>({})
const page = ref(0)

const selectedProducts = computed(() =>
    props.modelValue.map((id) => props.products.find((p) => Number(p.id) === Number(id))).filter(Boolean) as Product[],
)
const hideSet = computed(() => new Set([...(props.hideIds || []), ...props.modelValue].map(Number)))
const available = computed(() => props.products.filter((p) => !hideSet.value.has(Number(p.id))))
const totalPages = computed(() => Math.max(1, Math.ceil(available.value.length / PICKER_PAGE_SIZE)))
const paged = computed(() =>
    available.value.slice(page.value * PICKER_PAGE_SIZE, (page.value + 1) * PICKER_PAGE_SIZE),
)
const pickedCount = computed(() => Object.values(picked.value).filter(Boolean).length)

function openPicker() {
    picked.value = {}
    page.value = 0
    open.value = true
}
function toggle(id: number) {
    picked.value[id] = !picked.value[id]
}
function apply() {
    const extra = Object.entries(picked.value).filter(([, v]) => v).map(([id]) => Number(id))
    if (extra.length) emit('update:modelValue', [...props.modelValue, ...extra])
    open.value = false
}
function remove(id: number) {
    const n = Number(id)
    emit('update:modelValue', props.modelValue.filter((x) => Number(x) !== n))
}

function img(p: Product): string {
    return mediaUrl(p.image?.url)
}
function fmt(v: number) {
    return new Intl.NumberFormat('ru-RU').format(v) + ' сум'
}
</script>

<template>
    <div>
        <div v-if="selectedProducts.length" class="flex flex-wrap gap-2 mb-2">
            <span v-for="p in selectedProducts" :key="p.id"
                  class="inline-flex items-center gap-1 bg-ink-100 rounded-full pl-1 pr-1 py-1 text-sm">
                <span class="size-7 rounded-full overflow-hidden bg-ink-50 flex items-center justify-center">
                    <img v-if="img(p)" :src="img(p)" :alt="p.name" class="w-full h-full object-cover" />
                    <span v-else class="text-[9px] font-bold text-ink-400">{{ p.name.slice(0, 2).toUpperCase() }}</span>
                </span>
                <span class="font-semibold px-1">{{ p.name }}</span>
                <button type="button"
                        class="size-7 rounded-full bg-white border border-ink-200 text-ink-500 hover:bg-tomato-500 hover:text-white hover:border-tomato-500 flex items-center justify-center transition shrink-0"
                        :aria-label="`Убрать «${p.name}»`"
                        @click.stop.prevent="remove(p.id)">
                    <span class="pi pi-times text-[11px]"></span>
                </button>
            </span>
        </div>
        <Button :label="selectedProducts.length ? 'Добавить ещё' : (placeholder || 'Выбрать товары')"
                icon="pi pi-plus" severity="secondary" outlined size="small" @click="openPicker" />

        <Dialog v-model:visible="open" modal dismissable-mask
                :header="dialogTitle || 'Добавить товары'"
                :style="{ width: '820px', maxWidth: '95vw' }">
            <div v-if="!available.length" class="py-10 text-center text-ink-400">
                Больше доступных товаров нет.
            </div>
            <template v-else>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div v-for="p in paged" :key="p.id"
                         @click="toggle(p.id)"
                         class="relative bg-white border-2 rounded-2xl p-3 flex flex-col gap-2 cursor-pointer transition"
                         :class="picked[p.id]
                             ? 'border-tomato-500 ring-4 ring-tomato-500/15'
                             : 'border-ink-200 hover:border-ink-400'">
                        <div class="absolute top-2 right-2 size-6 rounded-full flex items-center justify-center transition"
                             :class="picked[p.id]
                                 ? 'bg-tomato-500 text-white'
                                 : 'bg-white border border-ink-200 text-transparent'">
                            <i class="pi pi-check text-[10px]"></i>
                        </div>
                        <div class="aspect-square rounded-xl overflow-hidden bg-ink-50 flex items-center justify-center">
                            <img v-if="img(p)" :src="img(p)" :alt="p.name" class="w-full h-full object-cover" />
                            <span v-else class="text-ink-300 text-xl font-bold">{{ p.name.slice(0, 2).toUpperCase() }}</span>
                        </div>
                        <div class="font-semibold text-[13px] leading-tight line-clamp-2 min-h-[32px]">
                            {{ p.name }}
                        </div>
                        <div class="text-[12px] font-bold text-tomato-600">{{ fmt(Number(p.price)) }}</div>
                    </div>
                </div>
                <div v-if="totalPages > 1" class="mt-5 flex items-center justify-center gap-2">
                    <button type="button" @click="page = Math.max(0, page - 1)" :disabled="page === 0"
                            class="size-9 rounded-xl border border-ink-200 hover:bg-ink-50 disabled:opacity-40 flex items-center justify-center">
                        <i class="pi pi-chevron-left text-xs"></i>
                    </button>
                    <button v-for="n in totalPages" :key="n" type="button" @click="page = n - 1"
                            class="size-9 rounded-xl font-bold text-sm transition"
                            :class="page === n - 1 ? 'bg-ink-900 text-white' : 'bg-white border border-ink-200 hover:bg-ink-50 text-ink-700'">
                        {{ n }}
                    </button>
                    <button type="button" @click="page = Math.min(totalPages - 1, page + 1)" :disabled="page >= totalPages - 1"
                            class="size-9 rounded-xl border border-ink-200 hover:bg-ink-50 disabled:opacity-40 flex items-center justify-center">
                        <i class="pi pi-chevron-right text-xs"></i>
                    </button>
                </div>
            </template>
            <template #footer>
                <Button label="Отмена" severity="secondary" text @click="open = false" />
                <Button :label="pickedCount ? `Добавить (${pickedCount})` : 'Добавить'"
                        severity="primary" :disabled="!pickedCount" @click="apply" />
            </template>
        </Dialog>
    </div>
</template>
