<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCatalog } from '@/stores/catalog'
import { useCart } from '@/stores/cart'
import SoupPuck from '@/components/SoupPuck.vue'
import { productImg, mediaUrl } from '@/services/api'
import Icon from '@/components/Icon.vue'
import ProductCard from '@/components/ProductCard.vue'

const route = useRoute()
const router = useRouter()
const catalog = useCatalog()
const cart = useCart()

const product = computed(() => catalog.findBySlug(route.params.slug as string))
const localQty = ref(1)

/** Слайдер: главная картинка + gallery. Пустые отфильтровываются. */
const images = computed(() => {
    const p = product.value; if (!p) return []
    const rest = (p.gallery || []).map(g => mediaUrl(g.url)).filter(Boolean)
    return [productImg(p), ...rest].filter(Boolean)
})
const activeIdx = ref(0)
const heroImg = computed(() => images.value[activeIdx.value] || images.value[0] || '')

let touchStartX = 0
function onTouchStart(e: TouchEvent) { touchStartX = e.touches[0].clientX }
function onTouchEnd(e: TouchEvent) {
    if (images.value.length < 2) return
    const dx = e.changedTouches[0].clientX - touchStartX
    if (Math.abs(dx) < 40) return
    const n = images.value.length
    activeIdx.value = (activeIdx.value + (dx < 0 ? 1 : -1) + n) % n
}

/** Состав — текст, из массива или строки. */
const compositionText = computed(() => {
    const c = product.value?.composition
    if (Array.isArray(c)) return c.join(', ')
    return c || ''
})

const qtyInCart = computed(() => product.value ? cart.standaloneQty(product.value.id) : 0)
const inCart = computed(() => qtyInCart.value > 0)
const qty = computed(() => inCart.value ? qtyInCart.value : localQty.value)

/** Серверный pricing — basePrice, finalPrice, discountPercent, label, endsAt. */
const pricing = computed(() => (product.value as any)?.pricing || null)
const hasDiscount = computed(() => Boolean(pricing.value?.discountPercent))
const discountedPrice = computed(() => pricing.value?.finalPrice ?? product.value?.price ?? 0)
const basePrice = computed(() => pricing.value?.basePrice ?? product.value?.price ?? 0)

const tintClass = computed(() => {
    if (!product.value) return 'bg-tint-tom'
    const map: Record<string, string> = {
        tom: 'bg-tint-tom', chi: 'bg-tint-chi', pum: 'bg-tint-pum',
        len: 'bg-tint-len', spa: 'bg-tint-spa', col: 'bg-tint-col',
    }
    return map[product.value.tint ?? 'tom'] || 'bg-tint-tom'
})

const also = computed(() =>
    product.value
        ? catalog.products.filter((p) => p.id !== product.value!.id).slice(0, 3)
        : [],
)

function fmt(v: number) {
    return new Intl.NumberFormat('ru-RU').format(v) + ' сум'
}
function inc() {
    if (inCart.value) cart.setProductQty(product.value!.id, qty.value + 1)
    else localQty.value++
}
function dec() {
    if (inCart.value) cart.setProductQty(product.value!.id, Math.max(0, qty.value - 1))
    else localQty.value = Math.max(1, localQty.value - 1)
}
function addToCart() {
    if (!product.value) return
    if (!inCart.value) cart.addProduct(product.value, localQty.value)
    router.push('/cart')
}
</script>

<template>
    <section v-if="product" class="flex-1 flex flex-col pb-0">
        <!-- Gallery -->
        <div class="relative h-[400px] rounded-b-[36px] flex items-center justify-center overflow-hidden"
             :class="tintClass"
             @touchstart.passive="onTouchStart"
             @touchend="onTouchEnd">
            <div class="absolute top-3.5 left-4 right-4 flex justify-between z-10">
                <button type="button" aria-label="Назад" @click="router.back()"
                        class="size-11 rounded-full bg-sf flex items-center justify-center text-ink">
                    <Icon name="chevron-left" :size="20" :stroke="2.4" />
                </button>
                <button type="button" aria-label="Поделиться"
                        class="size-11 rounded-full bg-sf flex items-center justify-center text-ink">
                    <Icon name="share" :size="20" :stroke="2.2" />
                </button>
            </div>
            <Transition name="hero-fade">
                <img v-if="heroImg" :key="heroImg" :src="heroImg" :alt="product.name"
                     class="absolute top-[42%] left-1/2 -translate-x-1/2 -translate-y-1/2 size-[240px] object-cover rounded-full"
                     style="box-shadow: 0 0 0 12px rgba(255,255,255,0.65), 0 30px 50px -18px rgba(60,15,0,.7);" />
            </Transition>
            <SoupPuck v-if="!heroImg" :variant="product.variant ?? 'default'" :size="240" :ring="true" :shadow="true"
                      class="absolute top-[42%] left-1/2 -translate-x-1/2 -translate-y-1/2" />
            <!-- Превью картинок — внутри тинт-блока, под кругом -->
            <div v-if="images.length > 1"
                 class="absolute bottom-4 left-0 right-0 z-10 flex justify-center gap-2.5 px-4">
                <button v-for="(src, i) in images" :key="i" type="button"
                        :aria-label="`Картинка ${i + 1}`" @click="activeIdx = i"
                        class="size-12 rounded-full overflow-hidden bg-white shadow-md transition-all duration-200"
                        :class="i === activeIdx
                            ? 'ring-2 ring-ink scale-110'
                            : 'opacity-70 hover:opacity-100'">
                    <img :src="src" alt="" class="w-full h-full object-cover" />
                </button>
            </div>
        </div>

        <!-- Title block -->
        <section class="pt-5 px-4 flex flex-col gap-3">
            <div class="flex gap-1.5 flex-wrap">
                <span v-if="product.tags?.includes('хит')"
                      class="bg-ink text-btr font-extrabold text-[11px] tracking-wider px-2.5 py-1.5 rounded-full">ХИТ</span>
                <span v-if="hasDiscount"
                      class="bg-acc text-white font-extrabold text-[11px] px-2.5 py-1.5 rounded-full">
                    −{{ pricing?.discountPercent }}%
                </span>
                <span v-if="product.tags?.includes('острый')"
                      class="bg-sf text-acct border-[1.5px] border-ln2 font-extrabold text-[11px] px-2.5 py-1 rounded-full">
                    Острое
                </span>
                <span v-if="product.tags?.includes('вегетарианское')"
                      class="bg-sf text-acct border-[1.5px] border-ln2 font-extrabold text-[11px] px-2.5 py-1 rounded-full">
                    Вегетарианское
                </span>
            </div>
            <h1 class="m-0 font-display font-black text-[34px] leading-none">{{ product.name }}</h1>
            <p class="m-0 text-[16px] font-semibold text-mut">
                {{ product.subtitle || product.description }} · {{ product.weight }} г
            </p>
            <div class="flex items-baseline gap-2.5">
                <span class="font-display font-black text-[28px] text-acct">{{ fmt(discountedPrice) }}</span>
                <span v-if="hasDiscount" class="text-[16px] text-fnt line-through">
                    {{ fmt(basePrice) }}
                </span>
            </div>
            <div v-if="hasDiscount && pricing?.endsAt"
                 class="mt-1 text-[13px] text-acct font-semibold flex items-center gap-1">
                <span class="pi pi-clock text-[12px]"></span>
                Скидка до {{ new Date(pricing.endsAt).toLocaleDateString('ru-RU') }}
            </div>
        </section>

        <!-- Nutrition -->
        <section v-if="product.nutrition" class="pt-4 px-4">
            <dl class="m-0 grid grid-cols-4 gap-2">
                <div v-for="n in [
                    { label: 'Ккал',  v: product.nutrition.kcal },
                    { label: 'Белки', v: product.nutrition.protein },
                    { label: 'Жиры',  v: product.nutrition.fat },
                    { label: 'Углев.', v: product.nutrition.carbs },
                ]" :key="n.label"
                   class="bg-sf rounded-2xl py-3 flex flex-col items-center gap-0.5 shadow-sm">
                    <dt class="text-[11px] font-bold text-fnt">{{ n.label }}</dt>
                    <dd class="m-0 font-extrabold text-[15px]">{{ n.v ?? '—' }}</dd>
                </div>
            </dl>
            <p class="m-0 pt-1.5 text-[12px] text-fnt text-center">на 100 г</p>
        </section>

        <!-- Composition + reheat + storage -->
        <section class="pt-3.5 px-4 flex flex-col gap-2.5">
            <div v-if="compositionText" class="bg-sf rounded-[22px] p-[18px] flex flex-col gap-2 shadow-sm">
                <h2 class="m-0 font-extrabold text-[16px]">Состав</h2>
                <p class="m-0 text-[15px] leading-relaxed text-mut">{{ compositionText }}</p>
            </div>

            <div v-if="product.reheatSteps?.length"
                 class="bg-deep text-deepink rounded-[22px] p-[18px] flex flex-col gap-3">
                <h2 class="m-0 font-extrabold text-[16px]">Как приготовить</h2>
                <ol class="m-0 p-0 list-none flex flex-col gap-2.5">
                    <li v-for="(step, i) in product.reheatSteps" :key="i"
                        class="flex gap-3 items-start">
                        <span class="shrink-0 size-7 rounded-full bg-btr text-ink font-extrabold text-[14px] flex items-center justify-center">
                            {{ i + 1 }}
                        </span>
                        <span class="text-[15px] leading-snug pt-0.5">{{ step }}</span>
                    </li>
                </ol>
            </div>

            <div v-if="product.storage"
                 class="bg-sf rounded-[22px] p-[18px] flex justify-between gap-3 text-[14px] shadow-sm">
                <span class="font-bold text-mut">Хранение</span>
                <span class="font-extrabold text-right">{{ product.storage }}</span>
            </div>
        </section>

        <!-- Also -->
        <section v-if="also.length" class="pt-6 flex flex-col gap-3">
            <h2 class="m-0 px-4 font-display font-extrabold text-[20px]">С&nbsp;этим берут</h2>
            <div class="overflow-x-auto no-scrollbar">
                <div class="flex gap-3 px-4 pb-1 w-max items-stretch">
                    <ProductCard v-for="p in also" :key="p.id" :product="p" class="w-[180px]" />
                </div>
            </div>
        </section>

        <div class="flex-1 min-h-6"></div>

        <!-- Sticky CTA -->
        <div class="sticky bottom-0 bg-sf rounded-t-[26px] px-4 pt-3 flex gap-2.5 items-center shadow-[0_-10px_30px_-16px_rgba(0,0,0,0.45)]"
             style="padding-bottom: calc(env(safe-area-inset-bottom) + 20px);">
            <div role="group" aria-label="Количество"
                 class="flex items-center bg-sf2 rounded-[18px] h-14">
                <button type="button" aria-label="Меньше" @click="dec"
                        class="w-12 h-14 text-ink font-extrabold text-[24px]">−</button>
                <span class="min-w-6 text-center font-extrabold text-[18px]">{{ qty }}</span>
                <button type="button" aria-label="Больше" @click="inc"
                        class="w-12 h-14 text-ink font-extrabold text-[24px]">+</button>
            </div>
            <button type="button" @click="addToCart"
                    class="flex-1 h-14 rounded-[18px] bg-acc text-white font-extrabold text-[16px]">
                {{ inCart ? 'Открыть корзину' : 'В корзину' }} · {{ fmt(discountedPrice * qty) }}
            </button>
        </div>
    </section>

    <section v-else class="flex-1 flex flex-col items-center justify-center text-fnt">
        Продукт не найден
    </section>
</template>

<style scoped>
.hero-fade-enter-active, .hero-fade-leave-active { transition: opacity .3s ease; }
.hero-fade-enter-from, .hero-fade-leave-to { opacity: 0; }
</style>
