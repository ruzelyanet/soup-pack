<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import { useCart } from '@/stores/cart'
import { api, qs, productImg } from '@/services/api'
import SoupPuck from '@/components/SoupPuck.vue'
import Icon from '@/components/Icon.vue'
import type { Product } from '@/types'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ (e: 'update:open', v: boolean): void }>()

const cart = useCart()

const PAGE_SIZE = 5
const items = ref<Product[]>([])
const page = ref(1)
const total = ref(0)
const totalPages = ref(1)
const loading = ref(false)
const search = ref('')
const picked = ref<Set<number>>(new Set())

function isInCart(id: number) {
    return cart.items.some(i => i.type === 'product' && i.refId === id)
}
const pickedCount = computed(() => picked.value.size)
const hasMore = computed(() => page.value < totalPages.value)

/** Запрос страницы продуктов к Strapi. `reset=true` — свежая страница 1 (новый поиск / открытие). */
async function fetchPage(p: number, reset = false) {
    if (loading.value) return
    loading.value = true
    try {
        const params: Record<string, any> = {
            populate: ['category', 'image'],
            sort: 'id:asc',
            'pagination[page]': p,
            'pagination[pageSize]': PAGE_SIZE,
            'pagination[withCount]': true,
            'filters[available][$eq]': true,
        }
        const q = search.value.trim()
        if (q) {
            // Поиск по имени ИЛИ описанию — containsi (case-insensitive).
            params['filters[$or][0][name][$containsi]'] = q
            params['filters[$or][1][description][$containsi]'] = q
        }
        const res = await api.get('/products' + qs(params))
        const data = (res.data?.data ?? []) as Product[]
        const meta = res.data?.meta?.pagination
        if (reset) items.value = data
        else items.value = [...items.value, ...data]
        page.value = p
        total.value = meta?.total ?? items.value.length
        totalPages.value = meta?.pageCount ?? 1
        console.log(`[upsell] GET /products?page=${p}&pageSize=${PAGE_SIZE} → ${data.length} шт. (всего ${total.value})`)
    } catch (e: any) {
        console.error('[upsell] fetch failed', e?.message || e)
    } finally {
        loading.value = false
    }
}

// Открытие модалки → свежий первый запрос.
watch(() => props.open, (v) => {
    if (!v) return
    picked.value = new Set()
    search.value = ''
    page.value = 1
    totalPages.value = 1
    items.value = []
    fetchPage(1, true)
})

// Поиск: сбрасываем страницу, с небольшим дебаунсом.
let searchTimer: ReturnType<typeof setTimeout> | null = null
watch(search, () => {
    if (!props.open) return
    if (searchTimer) clearTimeout(searchTimer)
    searchTimer = setTimeout(() => fetchPage(1, true), 250)
})

const scrollEl = ref<HTMLElement | null>(null)
function onScroll() {
    const el = scrollEl.value
    if (!el || loading.value || !hasMore.value) return
    const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 120
    if (nearBottom) fetchPage(page.value + 1)
}

function toggle(id: number) {
    if (isInCart(id)) return
    const s = new Set(picked.value)
    if (s.has(id)) s.delete(id); else s.add(id)
    picked.value = s
}

async function apply() {
    const ids = Array.from(picked.value)
    for (const id of ids) {
        const p = items.value.find(x => x.id === id)
        if (p) cart.addProduct(p, 1)
    }
    emit('update:open', false)
}

function close() { emit('update:open', false) }
function fmt(v: number) { return new Intl.NumberFormat('ru-RU').format(v) + ' сум' }

/** Товары, уже в корзине — в хвост списка; остальные — вверх (визуально). */
const sortedItems = computed(() =>
    items.value.slice().sort((a, b) => Number(isInCart(a.id)) - Number(isInCart(b.id))),
)
</script>

<template>
    <Dialog :visible="open" @update:visible="(v) => emit('update:open', v)"
            modal dismissable-mask :show-header="false"
            :style="{ width: '460px', maxWidth: '96vw' }"
            :pt="{
                root: { class: 'rounded-[28px] overflow-hidden' },
                content: { class: 'p-0 bg-bg' },
                mask: { class: 'backdrop-blur-sm bg-ink/50' }
            }">
        <div class="flex flex-col">
            <!-- Header: заголовок + поиск -->
            <div class="px-5 pt-5 pb-3 bg-bg">
                <div class="flex items-center justify-between gap-2 mb-3">
                    <h2 class="m-0 font-display font-black text-[22px] leading-none">Добавить к&nbsp;заказу</h2>
                    <button type="button" aria-label="Закрыть" @click="close"
                            class="size-10 rounded-full bg-sf border border-ln2 flex items-center justify-center active:scale-95 transition">
                        <Icon name="close" :size="16" :stroke="2.4" />
                    </button>
                </div>
                <label class="relative block">
                    <Icon name="search" :size="18" class="absolute left-3.5 top-1/2 -translate-y-1/2 text-fnt pointer-events-none" />
                    <input v-model="search" type="search" placeholder="Поиск по названию…"
                           class="w-full h-12 pl-11 pr-3 rounded-2xl bg-sf border border-ln text-ink text-[15px] font-semibold outline-none focus:border-acc focus:bg-white transition" />
                </label>
                <div v-if="total" class="pt-2 flex items-center justify-between gap-2 text-[12px] font-semibold">
                    <span class="text-fnt">
                        Показано <span class="text-ink">{{ items.length }}</span> из {{ total }}
                    </span>
                    <span class="bg-acc/10 text-acct rounded-full px-2.5 py-0.5 font-extrabold">
                        стр. {{ page }} / {{ totalPages }}
                    </span>
                </div>
            </div>

            <!-- Scrollable list -->
            <div ref="scrollEl" @scroll.passive="onScroll"
                 class="relative px-3 pb-4 h-[380px] overflow-y-auto flex flex-col gap-2">
                <button v-for="p in sortedItems" :key="p.id" type="button"
                        :disabled="isInCart(p.id)"
                        @click="toggle(p.id)"
                        class="w-full rounded-[22px] p-3 flex gap-3 items-center text-left transition-all duration-200"
                        :class="isInCart(p.id)
                            ? 'bg-sf/50 ring-1 ring-ln opacity-60 cursor-not-allowed'
                            : picked.has(p.id)
                                ? 'bg-acc/10 ring-2 ring-acc shadow-sm active:scale-[0.99]'
                                : 'bg-sf ring-1 ring-ln hover:ring-ln2 active:scale-[0.99]'">
                    <div class="shrink-0 relative size-[60px] rounded-full overflow-hidden flex items-center justify-center"
                         :class="`bg-tint-${p.tint ?? 'tom'}`">
                        <img v-if="productImg(p)" :src="productImg(p)!" :alt="p.name"
                             class="w-full h-full object-cover" />
                        <SoupPuck v-else :variant="p.variant ?? 'default'" :size="54" :ring="false" :shadow="false" />
                    </div>
                    <div class="flex-1 flex flex-col gap-0.5 min-w-0">
                        <div class="flex items-center gap-1.5 flex-wrap">
                            <span v-if="p.tags?.includes('хит')"
                                  class="bg-ink text-btr font-extrabold text-[9px] tracking-wider px-1.5 py-0.5 rounded-full">ХИТ</span>
                            <span v-if="(p as any).pricing?.discountPercent"
                                  class="bg-acc text-white font-extrabold text-[10px] px-2 py-0.5 rounded-full">
                                −{{ (p as any).pricing.discountPercent }}%
                            </span>
                        </div>
                        <span class="font-extrabold text-[15px] leading-tight line-clamp-2">{{ p.name }}</span>
                        <div class="flex items-baseline gap-2 pt-0.5">
                            <span v-if="(p as any).pricing?.discountPercent"
                                  class="text-[11px] text-fnt line-through leading-none">
                                {{ fmt((p as any).pricing.basePrice) }}
                            </span>
                            <span class="font-display font-black text-[15px] leading-none"
                                  :class="(p as any).pricing?.discountPercent ? 'text-acct' : 'text-ink'">
                                {{ fmt((p as any).pricing?.finalPrice ?? p.price) }}
                            </span>
                        </div>
                    </div>
                    <span v-if="isInCart(p.id)"
                          class="shrink-0 bg-ok-bg text-oks font-extrabold text-[10px] px-2 py-1 rounded-full">
                        В корзине
                    </span>
                    <span v-else class="size-8 rounded-full flex items-center justify-center shrink-0 transition"
                          :class="picked.has(p.id)
                              ? 'bg-acc text-white shadow-[0_6px_14px_-4px_rgba(214,58,28,0.5)]'
                              : 'bg-white border-2 border-ln2 text-transparent'">
                        <Icon name="check" :size="18" :stroke="3.2" />
                    </span>
                </button>

                <div v-if="loading" class="flex items-center justify-center gap-2 py-3 text-fnt text-[12px]">
                    <span class="inline-block size-3 rounded-full bg-acc animate-pulse"></span>
                    Загружаю страницу {{ page + (items.length ? 1 : 0) }}…
                </div>
                <div v-else-if="!items.length"
                     class="flex flex-col items-center justify-center gap-2 py-10 text-fnt text-sm">
                    <span class="size-14 rounded-full bg-sf flex items-center justify-center">
                        <Icon :name="search ? 'search' : 'bag'" :size="22" class="text-fnt" />
                    </span>
                    {{ search ? 'Ничего не нашлось.' : 'Товаров нет.' }}
                </div>
                <div v-else-if="!hasMore" class="text-center py-2 text-[11px] text-fnt font-semibold">
                    Это всё — {{ total }} {{ total === 1 ? 'товар' : 'товаров' }}
                </div>
            </div>

            <!-- Footer с мягким градиентом сверху -->
            <div class="relative bg-bg px-4 pt-3 pb-4">
                <div class="absolute left-0 right-0 -top-6 h-6 pointer-events-none
                            bg-gradient-to-t from-bg to-transparent"></div>
                <div class="flex gap-2">
                    <button type="button" @click="close"
                            class="flex-1 h-12 rounded-2xl bg-sf border border-ln2 text-ink font-extrabold text-[15px] active:scale-[0.98] transition">
                        Отмена
                    </button>
                    <button type="button" @click="apply" :disabled="!pickedCount"
                            class="flex-[1.5] h-12 rounded-2xl bg-acc text-white font-extrabold text-[15px] shadow-[0_10px_24px_-10px_rgba(214,58,28,0.6)] active:scale-[0.98] transition disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none">
                        {{ pickedCount ? `Добавить · ${pickedCount}` : 'Выберите товар' }}
                    </button>
                </div>
            </div>
        </div>
    </Dialog>
</template>
