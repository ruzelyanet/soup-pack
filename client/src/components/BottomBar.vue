<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCart } from '@/stores/cart'
import Icon from '@/components/Icon.vue'

const route = useRoute()
const router = useRouter()
const cart = useCart()

function fmt(v: number) {
    return new Intl.NumberFormat('ru-RU').format(v) + ' сум'
}

const word = computed(() => {
    const n = cart.count
    const m10 = n % 10
    const m100 = n % 100
    if (m10 === 1 && m100 !== 11) return 'товар'
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return 'товара'
    return 'товаров'
})

const tabs = [
    { to: '/',           name: 'Каталог', icon: 'catalog' },
    { to: '/discounts',  name: 'Скидки',  icon: 'sparkles' },
    { to: '/about',      name: 'О нас',   icon: 'heart' },
    { to: '/cart',       name: 'Корзина', icon: 'bag' },
    { to: '/account',    name: 'Кабинет', icon: 'user' },
]

function isActive(to: string) {
    if (to === '/') return route.path === '/'
    return route.path.startsWith(to)
}
</script>

<template>
    <div class="sticky bottom-0 z-30 flex flex-col gap-2.5 px-3 pt-3">
        <!-- Floating cart -->
        <button
            v-if="cart.count > 0 && !route.path.startsWith('/cart') && !route.path.startsWith('/checkout')"
            type="button"
            @click="router.push('/cart')"
            class="min-h-[60px] rounded-[22px] bg-acc text-white flex items-center justify-between pl-[18px] pr-2.5 shadow-[0_14px_30px_-12px_rgba(150,40,10,0.7)] active:scale-[0.98] transition"
        >
            <span class="flex flex-col text-left">
                <span class="text-[12px] font-bold text-[#FFE0CC]">{{ cart.count }} {{ word }} в корзине</span>
                <span class="font-display font-extrabold text-[17px]">{{ fmt(cart.total) }}</span>
            </span>
            <span class="bg-[#FFF1DC] text-[#2A1209] font-extrabold text-[15px] px-4 py-3 rounded-2xl">
                Корзина →
            </span>
        </button>

        <!-- Tabbar -->
        <nav
            aria-label="Нижнее меню"
            class="grid grid-cols-5 bg-sf rounded-t-[22px] px-1 pt-1.5 safe-bottom shadow-[0_-1px_0_var(--color-ln)]"
            style="padding-bottom: calc(env(safe-area-inset-bottom) + 16px);"
        >
            <RouterLink
                v-for="t in tabs" :key="t.to" :to="t.to"
                class="min-h-[52px] flex flex-col items-center justify-center gap-1 font-bold text-[10px] transition px-0.5"
                :class="isActive(t.to) ? 'text-acct' : 'text-mut'"
            >
                <Icon :name="t.icon" :size="20" />
                {{ t.name }}
            </RouterLink>
        </nav>
    </div>
</template>
