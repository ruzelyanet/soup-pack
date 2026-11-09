<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useCart } from '@/stores/cart'
import SoupPuck from '@/components/SoupPuck.vue'
import Icon from '@/components/Icon.vue'
import { productImg, mediaUrl } from '@/services/api'
import type { Product } from '@/types'

const props = defineProps<{ product: Product }>()
const router = useRouter()
const cart = useCart()

/** Слайдер: главная + gallery, отфильтровано от пустых. */
const images = computed(() => {
    const main = productImg(props.product)
    const rest = (props.product.gallery || []).map(g => mediaUrl(g.url)).filter(Boolean)
    return [main, ...rest].filter(Boolean)
})
const activeIdx = ref(0)
const imgUrl = computed(() => images.value[activeIdx.value] || images.value[0] || '')

let touchStartX = 0
let swiped = false
function onTouchStart(e: TouchEvent) { touchStartX = e.touches[0].clientX; swiped = false }
function onTouchEnd(e: TouchEvent) {
    if (images.value.length < 2) return
    const dx = e.changedTouches[0].clientX - touchStartX
    if (Math.abs(dx) < 40) return
    const n = images.value.length
    activeIdx.value = (activeIdx.value + (dx < 0 ? 1 : -1) + n) % n
    swiped = true
}

const qty = computed(() => cart.standaloneQty(props.product.id))
const inCart = computed(() => qty.value > 0)

/** Серверный расчёт — pricing (basePrice/finalPrice/discountPercent/label). Fallback — plain price. */
const pricing = computed(() => (props.product as any).pricing || null)
const hasDiscount = computed(() => Boolean(pricing.value?.discountPercent))
const discountedPrice = computed(() => pricing.value?.finalPrice ?? props.product.price)

const tintClass = computed(() => {
    const map: Record<string, string> = {
        tom: 'bg-tint-tom', chi: 'bg-tint-chi', pum: 'bg-tint-pum',
        len: 'bg-tint-len', spa: 'bg-tint-spa', col: 'bg-tint-col',
    }
    return map[props.product.tint ?? 'tom'] || 'bg-tint-tom'
})

function fmt(v: number) {
    return new Intl.NumberFormat('ru-RU').format(v) + ' сум'
}
function open() {
    if (swiped) { swiped = false; return }
    router.push(`/product/${props.product.slug}`)
}
function add() {
    cart.addProduct(props.product, 1)
}
function dec() {
    cart.setProductQty(props.product.id, qty.value - 1)
}
</script>

<template>
    <article class="bg-sf rounded-[24px] overflow-hidden flex flex-col shadow-[0_1px_0_var(--color-ln)]">
        <button
            type="button"
            @click="open"
            @touchstart.passive="onTouchStart"
            @touchend="onTouchEnd"
            class="relative h-[150px] flex items-center justify-center"
            :class="tintClass"
        >
            <!-- ХИТ бейдж -->
            <span v-if="product.tags?.includes('хит')"
                  class="absolute top-2.5 left-2.5 bg-ink text-btr font-extrabold text-[10px] tracking-wider px-2 py-1 rounded-full z-10">
                ХИТ
            </span>

            <!-- Скидка с датой — поверх картинки снизу (из серверного pricing). -->
            <div v-if="hasDiscount && pricing?.endsAt"
                 class="absolute left-2 right-2 bottom-2 flex items-center justify-center gap-1.5 bg-acc text-white rounded-xl px-2 py-1 z-10 shadow-[0_6px_16px_-6px_rgba(0,0,0,0.4)]">
                <span class="font-extrabold text-[11px] tracking-wider uppercase shrink-0">
                    −{{ pricing.discountPercent }}%
                </span>
                <span class="w-1 h-1 rounded-full bg-white/60"></span>
                <span class="text-[11px] font-bold truncate">
                    до {{ new Date(pricing.endsAt).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }) }}
                </span>
            </div>
            <img v-if="imgUrl" :src="imgUrl" :alt="product.name"
                 class="absolute inset-0 w-full h-full object-cover" />
            <SoupPuck v-else :variant="product.variant ?? 'default'" :size="112" />

            <!-- Точки-переключатели (появляются при 2+ картинках) -->
            <div v-if="images.length > 1"
                 class="absolute top-2.5 right-2.5 flex items-center gap-1 z-10">
                <span v-for="(_, i) in images" :key="i"
                      class="size-1.5 rounded-full transition-colors"
                      :class="i === activeIdx ? 'bg-white' : 'bg-white/50'"></span>
            </div>
        </button>

        <div class="p-3 flex flex-col gap-1 flex-1">
            <h3 class="font-extrabold text-[15px] leading-tight">{{ product.name }}</h3>
            <span class="text-[12px] font-semibold text-fnt">
                {{ product.subtitle || (product.weight ? product.weight + ' г' : '') }}
            </span>

            <div class="mt-auto pt-2 flex items-end justify-between gap-1.5">
                <div class="flex flex-col">
                    <span v-if="hasDiscount" class="text-[11px] text-fnt line-through leading-none">
                        {{ fmt(pricing?.basePrice ?? product.price) }}
                    </span>
                    <span class="font-extrabold text-[15px] leading-tight"
                          :class="hasDiscount ? 'text-acct' : 'text-ink'">
                        {{ fmt(discountedPrice) }}
                    </span>
                </div>

                <div
                    v-if="inCart"
                    role="group"
                    aria-label="Количество"
                    class="flex items-center bg-acc text-white rounded-[14px] h-11"
                >
                    <button type="button" aria-label="Меньше" @click.stop="dec"
                            class="w-[30px] h-11 text-white font-extrabold text-[18px]">−</button>
                    <span class="min-w-[14px] text-center font-extrabold">{{ qty }}</span>
                    <button type="button" aria-label="Больше" @click.stop="add"
                            class="w-[30px] h-11 text-white font-extrabold text-[18px]">+</button>
                </div>
                <button v-else type="button" aria-label="Добавить в корзину" @click.stop="add"
                        class="size-11 rounded-full bg-acc text-white flex items-center justify-center active:scale-95 transition">
                    <Icon name="plus" :size="20" :stroke="2.6" />
                </button>
            </div>
        </div>
    </article>
</template>
