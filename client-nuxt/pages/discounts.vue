<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useCatalog } from '@/stores/catalog'
import SoupPuck from '@/components/SoupPuck.vue'
import Icon from '@/components/Icon.vue'
import { productImg } from '@/services/api'

const router = useRouter()
const catalog = useCatalog()

function fmt(v: number) {
    return new Intl.NumberFormat('ru-RU').format(v) + ' сум'
}
function fmtDate(d?: string | null) {
    if (!d) return ''
    return new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** Скидки берутся из серверного `pricing.{discountPercent,basePrice,finalPrice,endsAt}` каждой записи. */
const discountCards = computed(() => {
    const items: Array<{
        key: string
        kind: 'product' | 'set'
        link: string
        name: string
        description?: string
        image?: string
        variant?: string
        /** Для наборов — превью товаров (чтобы показать стек кружков). */
        setItems?: Array<{ name: string; image: string }>
        percent: number
        oldPrice: number
        newPrice: number
        to?: string | null
        tags?: string[] | null
    }> = []

    for (const p of catalog.products) {
        const pr = (p as any).pricing
        if (!pr?.discountPercent) continue
        items.push({
            key: 'p-' + p.id,
            kind: 'product',
            link: '/product/' + p.slug,
            name: p.name,
            description: p.subtitle || p.description || '',
            image: productImg(p),
            variant: p.variant,
            percent: pr.discountPercent,
            oldPrice: pr.basePrice,
            newPrice: pr.finalPrice,
            to: pr.endsAt,
            tags: p.tags,
        })
    }
    for (const s of catalog.sets) {
        const pr = (s as any).pricing
        if (!pr?.discountPercent) continue
        items.push({
            key: 's-' + s.id,
            kind: 'set',
            link: '/set/' + s.slug,
            name: s.name,
            description: s.description || '',
            setItems: (s.items || []).map((it: any) => ({
                name: it.product?.name || '',
                image: productImg(it.product as any),
            })),
            percent: pr.discountPercent,
            oldPrice: pr.basePrice,
            newPrice: pr.finalPrice,
            to: pr.endsAt,
        })
    }
    return items.sort((a, b) => b.percent - a.percent)
})
</script>

<template>
    <section class="flex-1 flex flex-col pb-2">
        <!-- Header -->
        <header class="px-4 pt-3.5 pb-2 flex items-center gap-3">
            <button type="button" aria-label="Назад" @click="router.back()"
                    class="size-11 rounded-full bg-sf flex items-center justify-center">
                <Icon name="chevron-left" :size="20" :stroke="2.4" />
            </button>
            <h1 class="m-0 font-display font-black text-[26px] flex-1">Скидки</h1>
        </header>

        <!-- Intro -->
        <section class="px-4 pt-2">
            <div class="relative overflow-hidden bg-acc text-white rounded-[22px] p-5">
                <div class="absolute -right-8 -top-8 size-32 rounded-full bg-white/15"></div>
                <div class="absolute -right-14 -bottom-14 size-40 rounded-full bg-white/10"></div>
                <div class="relative">
                    <div class="font-display font-black text-[24px] leading-tight">
                        Все выгодные предложения
                    </div>
                    <p class="m-0 mt-2 text-[14px] opacity-90 leading-relaxed">
                        Супы и наборы со скидкой — ограниченные предложения, успевайте пока действуют.
                    </p>
                </div>
            </div>
        </section>

        <!-- Discount cards -->
        <section class="px-4 pt-5 flex flex-col gap-3">
            <div v-if="!discountCards.length"
                 class="bg-sf rounded-[22px] p-10 text-center text-fnt">
                Сейчас активных скидок нет. Загляните позже.
            </div>

            <RouterLink v-for="card in discountCards" :key="card.key" :to="card.link"
                        class="group relative bg-sf rounded-[24px] overflow-hidden shadow-[0_1px_0_var(--color-ln)] flex gap-3 text-ink">
                <!-- Image side -->
                <div class="shrink-0 w-[128px] h-[128px] bg-tint-tom flex items-center justify-center relative overflow-hidden">
                    <!-- Набор: стек кружочков товаров (визуально явно «это набор») -->
                    <template v-if="card.kind === 'set'">
                        <div class="relative flex items-center justify-center">
                            <template v-for="(it, idx) in card.setItems?.slice(0, 3)" :key="idx">
                                <div class="size-12 rounded-full overflow-hidden bg-white flex items-center justify-center text-ink text-[11px] font-bold"
                                     :class="idx > 0 ? '-ml-3' : ''"
                                     :style="`box-shadow: 0 0 0 2px #fff, 0 4px 10px rgba(60,20,0,.15); z-index: ${10 - idx};`">
                                    <img v-if="it.image" :src="it.image" :alt="it.name"
                                         class="w-full h-full object-cover" />
                                    <span v-else>{{ (it.name || '?').slice(0, 2).toUpperCase() }}</span>
                                </div>
                            </template>
                            <div v-if="(card.setItems?.length ?? 0) > 3"
                                 class="size-12 rounded-full -ml-3 flex items-center justify-center bg-ink text-white text-[11px] font-bold"
                                 style="box-shadow: 0 0 0 2px #fff; z-index: 0;">
                                +{{ (card.setItems?.length ?? 0) - 3 }}
                            </div>
                        </div>
                        <!-- Нижний чип «Набор» чтобы явно пометить -->
                        <span class="absolute bottom-2 left-1/2 -translate-x-1/2 bg-ink text-cream-50 text-[9px] font-extrabold tracking-wider px-2 py-0.5 rounded-full">
                            НАБОР
                        </span>
                    </template>
                    <template v-else>
                        <img v-if="card.image" :src="card.image" :alt="card.name"
                             class="absolute inset-0 w-full h-full object-cover" />
                        <SoupPuck v-else :variant="(card.variant as any) ?? 'default'" :size="100" />
                    </template>
                    <!-- Percent chip -->
                    <span class="absolute top-2 left-2 bg-acc text-white font-extrabold text-[12px] tracking-wider px-2.5 py-1 rounded-full">
                        −{{ card.percent }}%
                    </span>
                </div>

                <!-- Content side -->
                <div class="flex-1 min-w-0 py-3 pr-3 flex flex-col gap-1.5">
                    <div class="flex items-center gap-2">
                        <span v-if="card.kind === 'set'"
                              class="bg-deep text-btr font-extrabold text-[10px] tracking-wider uppercase px-2 py-0.5 rounded-full shrink-0">
                            Набор
                        </span>
                        <span v-else-if="card.tags?.includes('хит')"
                              class="bg-deep text-btr font-extrabold text-[10px] tracking-wider uppercase px-2 py-0.5 rounded-full shrink-0">
                            ХИТ
                        </span>
                    </div>
                    <h3 class="m-0 font-extrabold text-[16px] leading-tight">{{ card.name }}</h3>
                    <p v-if="card.description"
                       class="m-0 text-[12px] text-fnt leading-snug line-clamp-2">
                        {{ card.description }}
                    </p>

                    <div class="mt-auto flex items-end justify-between gap-2">
                        <div class="flex flex-col">
                            <span class="text-[11px] text-fnt line-through leading-none">
                                {{ fmt(card.oldPrice) }}
                            </span>
                            <span class="font-display font-black text-[18px] leading-tight text-acc">
                                {{ fmt(card.newPrice) }}
                            </span>
                        </div>
                        <div v-if="card.to"
                             class="text-right text-[11px] text-fnt font-semibold leading-tight">
                            до<br>{{ fmtDate(card.to) }}
                        </div>
                    </div>
                </div>
            </RouterLink>
        </section>

        <div class="flex-1 min-h-4"></div>
    </section>
</template>
