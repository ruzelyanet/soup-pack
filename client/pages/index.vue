<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useCatalog } from '@/stores/catalog'
import { useAuth } from '@/stores/auth'
import { useUi } from '@/stores/ui'
import ProductCard from '@/components/ProductCard.vue'
import SoupPuck from '@/components/SoupPuck.vue'
import Icon from '@/components/Icon.vue'
import BrandLogo from '@/components/BrandLogo.vue'
import { mediaUrl, productImg } from '@/services/api'
import type { HomeSection, Product } from '@/types'

const catalog = useCatalog()
const auth = useAuth()
const ui = useUi()
const router = useRouter()

await useAsyncData('catalog', async () => { await catalog.fetchAll(); return true })

useSeoMeta({
    title: 'SOUP PACK — готовые супы с доставкой в Ташкенте · Том ям, борщ, лагман',
    description: 'Том ям, борщ, лагман, солянка, шурпа, харчо в формате порции 350 г. Натуральные ингредиенты, шоковая заморозка −40 °C, 5 минут на разогрев.',
    ogTitle: 'SOUP PACK — готовые супы с доставкой в Ташкенте',
    ogDescription: 'Готовые супы и пасты, шоковая заморозка, формат «шайбы» 350 г.',
    ogImage: '/og.jpg',
    ogType: 'website',
})

const sets = computed(() => catalog.sets)

/** Товары секции: для «Хитов» — тег «хит», для «Наборов» — пусто (рендерим наборы), иначе — ручной список. */
function sectionProducts(s: HomeSection): Product[] {
    if (s.isSets) return []
    if (s.isHits) return catalog.products.filter((p) => p.tags?.includes('хит'))
    return (s.products || []).filter((p) => p.available !== false)
}

/** Пункты меню — только видимые + непустые секции. */
const menu = computed(() =>
    catalog.homeSections.filter((s) =>
        s.visible && (s.isSets ? sets.value.length > 0 : (s.isHits || sectionProducts(s).length > 0 || s.category)),
    ),
)

/** Клик по пункту меню: Наборы → /sets, есть категория → /category/:slug, иначе — скролл к блоку. */
function openSection(s: HomeSection) {
    if (s.isSets) { router.push('/sets'); return }
    if (s.category?.slug) { router.push(`/category/${s.category.slug}`); return }
    const el = document.getElementById(`sec-${s.id}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const lastOrder = computed(() => auth.myOrders[0])
const avatarLetter = computed(() => auth.client?.fullName?.trim()?.[0]?.toUpperCase() || 'А')

// --- Баннеры: индикатор-точки + программный скролл.
const bannersEl = ref<HTMLDivElement | null>(null)
const activeBanner = ref(0)
function onBannersScroll() {
    const el = bannersEl.value
    if (!el) return
    const cardWidth = 340 + 12 // ширина карточки + gap-3
    activeBanner.value = Math.round(el.scrollLeft / cardWidth)
}
function scrollToBanner(idx: number) {
    const el = bannersEl.value
    if (!el) return
    const cardWidth = 340 + 12
    el.scrollTo({ left: idx * cardWidth, behavior: 'smooth' })
}

const features = [
    { icon: 'clock', text: 'Готово за 5 минут' },
    { icon: 'snow',  text: 'Шоковая заморозка и вакуум' },
    { icon: 'leaf',  text: 'Натуральные ингредиенты' },
    { icon: 'heart', text: 'Для всей семьи' },
]

function fmt(v: number) {
    return new Intl.NumberFormat('ru-RU').format(v) + ' сум'
}
</script>

<template>
    <!-- Top bar -->
    <header class="sticky top-0 z-20 bg-bg px-4 pt-3 pb-2">
        <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2 min-h-11 text-ink min-w-0">
                <BrandLogo :size="24" class="text-acc shrink-0" />
                <span class="font-display font-black tracking-tight text-[16px] leading-none shrink-0">
                    SOUP <span class="text-acc">PACK</span>
                </span>
                <span class="h-4 w-px bg-ln2 shrink-0"></span>
                <span class="flex items-center gap-1 min-w-0 text-ink">
                    <Icon name="map-pin" :size="16" class="shrink-0" />
                    <span class="font-extrabold text-[14px] truncate">{{ catalog.contact.city || 'Ташкент' }}</span>
                </span>
            </div>
            <div class="flex gap-2">
                <button type="button" aria-label="Сменить тему" @click="ui.toggleTheme()"
                        class="size-11 rounded-full border border-ln2 bg-sf flex items-center justify-center">
                    <Icon :name="ui.theme === 'light' ? 'moon' : 'sun'" :size="20" />
                </button>
                <NuxtLink to="/account" aria-label="Личный кабинет"
                            class="size-11 rounded-full bg-btr text-ink flex items-center justify-center font-display font-black text-[16px]">
                    {{ avatarLetter }}
                </NuxtLink>
            </div>
        </div>
        <NuxtLink to="/search"
                    class="mt-3 h-[50px] rounded-2xl bg-sf border border-ln text-fnt flex items-center gap-2.5 px-3.5 font-semibold text-[15px]">
            <Icon name="search" :size="20" />
            Том-ям, крем-суп, набор…
        </NuxtLink>
    </header>

    <!-- Call-to-order: главный способ сделать заказ по телефону (номер из админки) -->
    <section v-if="catalog.contact.phone" aria-label="Заказ по телефону" class="px-4 pt-2">
        <a :href="`tel:${catalog.phoneTel}`"
           class="relative overflow-hidden flex items-center gap-3 bg-acc text-white rounded-[22px] px-4 py-3.5 no-underline shadow-[0_8px_24px_-8px_rgba(214,58,28,0.6)] active:scale-[0.99] transition">
            <span class="size-12 rounded-full bg-white/15 flex items-center justify-center shrink-0">
                <Icon name="phone" :size="24" :stroke="2.4" />
            </span>
            <span class="flex-1 flex flex-col min-w-0">
                <span class="text-[12px] font-extrabold uppercase tracking-wider opacity-90">
                    Позвонить и заказать
                </span>
                <span class="font-display font-black text-[20px] leading-tight tracking-tight">
                    {{ catalog.contact.phone }}
                </span>
            </span>
            <Icon name="chevron-right" :size="22" :stroke="2.6" class="shrink-0 opacity-90" />
        </a>
    </section>

    <!-- Promo banners (из админки) -->
    <section v-if="catalog.banners.length" aria-label="Скидки" class="pt-3">
        <div ref="bannersEl" class="overflow-x-auto no-scrollbar scroll-smooth snap-x snap-mandatory"
             @scroll.passive="onBannersScroll">
            <div class="flex gap-3 px-4 w-max">
                <component v-for="(b, i) in catalog.banners" :key="b.id"
                           :is="b.linkUrl ? 'a' : 'div'"
                           :href="b.linkUrl || undefined"
                           :data-idx="i"
                           class="group relative block w-[340px] h-[200px] rounded-[28px] overflow-hidden bg-deep text-deepink no-underline snap-start active:scale-[0.98] transition will-change-transform shadow-[0_12px_32px_-14px_rgba(0,0,0,0.35)]">
                    <!-- Фон: картинка (с мягким zoom-эффектом при hover) или мягкий градиент. -->
                    <img v-if="b.image?.url" :src="mediaUrl(b.image.url)" :alt="b.title"
                         class="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-500" />
                    <div v-else class="absolute inset-0 bg-gradient-to-br from-acc via-acct to-deep"></div>

                    <!-- Градиент для читаемости текста (слева направо, с акцентом снизу). -->
                    <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent"></div>
                    <div v-if="b.image?.url" class="absolute inset-0 bg-gradient-to-r from-black/55 via-black/20 to-transparent"></div>

                    <!-- Бейдж скидки / метка кампании -->
                    <div class="absolute top-4 right-4 inline-flex items-center gap-1 rounded-full bg-acc text-white px-3 py-1 font-extrabold text-[11px] uppercase tracking-wider shadow-[0_6px_16px_-6px_rgba(214,58,28,0.6)]">
                        <span class="pi pi-tag text-[10px]"></span>
                        Акция
                    </div>

                    <!-- Контент: текст сверху-слева, CTA снизу. -->
                    <div class="absolute inset-0 p-5 flex flex-col justify-between z-10">
                        <div class="w-[240px] flex flex-col gap-1.5">
                            <span class="font-display font-black text-[22px] leading-[1.1] text-white drop-shadow-sm">
                                {{ b.title }}
                            </span>
                            <span v-if="b.subtitle" class="text-[13px] text-white/90 leading-snug line-clamp-2">
                                {{ b.subtitle }}
                            </span>
                        </div>

                        <div v-if="b.linkUrl" class="self-start inline-flex items-center gap-1.5 bg-white/95 backdrop-blur font-extrabold text-[12px] uppercase tracking-wider px-3 py-1.5 rounded-full"
                             style="color: #111">
                            Подробнее
                            <span class="pi pi-arrow-right text-[11px]"></span>
                        </div>
                    </div>
                </component>
            </div>
        </div>

        <!-- Индикатор-точки -->
        <div v-if="catalog.banners.length > 1" class="flex justify-center gap-1.5 pt-2.5">
            <button v-for="(b, i) in catalog.banners" :key="b.id" type="button"
                    @click="scrollToBanner(i)"
                    :aria-label="`Баннер ${i + 1}`"
                    class="rounded-full transition-all"
                    :class="activeBanner === i
                        ? 'w-6 h-1.5 bg-acc'
                        : 'w-1.5 h-1.5 bg-ln2 hover:bg-mut'"></button>
        </div>
    </section>

    <!-- Repeat last order / Login shortcut -->
    <section class="px-4 pt-4">
        <!-- Авторизован + есть прошлый заказ -->
        <NuxtLink v-if="auth.isAuthed && lastOrder" :to="`/order/${lastOrder.code}`"
                    class="flex items-center gap-3 bg-sf border border-ln rounded-[20px] px-3.5 py-3 text-ink">
            <span class="flex">
                <SoupPuck variant="pumpkin-cream" :size="38" :ring="false" :shadow="false" />
                <span class="-ml-3">
                    <SoupPuck variant="chicken-noodle" :size="38" :ring="false" :shadow="false" />
                </span>
            </span>
            <span class="flex-1 flex flex-col">
                <span class="font-extrabold text-[15px]">Повторить прошлый заказ</span>
                <span class="text-[13px] text-fnt">
                    {{ lastOrder.items.length }} товара · {{ fmt(lastOrder.total) }}
                </span>
            </span>
            <Icon name="chevron-right" :size="20" :stroke="2.4" />
        </NuxtLink>

        <!-- Не авторизован — предложение войти, чтобы повторить заказ -->
        <NuxtLink v-else-if="!auth.isAuthed" to="/login"
                    class="flex items-center gap-3 bg-deep text-deepink rounded-[20px] px-3.5 py-3">
            <span class="size-10 rounded-full bg-acc/20 text-acct flex items-center justify-center shrink-0">
                <Icon name="user" :size="20" />
            </span>
            <span class="flex-1 flex flex-col min-w-0">
                <span class="font-extrabold text-[15px]">Повторить прошлый заказ</span>
                <span class="text-[13px] opacity-80">
                    Войти по номеру — и&nbsp;увидите историю заказов
                </span>
            </span>
            <Icon name="chevron-right" :size="20" :stroke="2.4" />
        </NuxtLink>
    </section>

    <!-- Меню секций — горизонтальные пилюли с иконкой, ссылка на /category/:slug или /sets -->
    <section v-if="menu.length" class="pt-5 flex flex-col gap-3">
        <h2 class="m-0 px-4 font-display font-black text-[24px]">Что заказать</h2>
        <nav aria-label="Разделы меню" class="pb-1 overflow-x-auto no-scrollbar">
            <div class="flex gap-2 px-4 w-max">
                <button v-for="s in menu" :key="s.id" type="button"
                        @click="openSection(s)"
                        class="min-h-11 pl-3 pr-4 rounded-full bg-sf border border-ln2 text-ink font-bold text-[14px] flex items-center gap-2 active:scale-95 transition">
                    <Icon :name="s.icon || 'catalog'" :size="18" :stroke="2.2" class="text-acct" />
                    {{ s.title }}
                </button>
            </div>
        </nav>
    </section>

    <!-- Блоки — из home-sections: наборы или товары, горизонтальный скролл -->
    <template v-for="s in menu" :key="s.id">
        <!-- Наборы: отдельный layout (большие тёмные карточки) -->
        <section v-if="s.isSets && sets.length"
                 :id="`sec-${s.id}`" class="pt-6 flex flex-col gap-3.5">
            <div class="px-4 flex items-baseline justify-between gap-3">
                <h2 class="m-0 font-display font-black text-[24px]">{{ s.title }}</h2>
                <NuxtLink to="/sets" class="text-[13px] font-extrabold text-acct no-underline shrink-0">
                    Все →
                </NuxtLink>
            </div>
            <div class="overflow-x-auto no-scrollbar">
                <div class="flex gap-3 px-4 pb-1.5 w-max">
                    <NuxtLink v-for="os in sets" :key="os.id" :to="`/set/${os.slug}`"
                                class="w-[286px] rounded-[26px] bg-deep text-deepink p-[18px] flex flex-col gap-3">
                        <div class="flex items-center">
                            <template v-for="(it, idx) in os.items.slice(0, 3)" :key="idx">
                                <img v-if="productImg(it.product)" :src="productImg(it.product)" :alt="it.product?.name"
                                     class="size-16 object-cover rounded-full"
                                     :class="idx === 0 ? '' : '-ml-4.5'"
                                     style="box-shadow: 0 0 0 3px var(--color-deep)" />
                                <SoupPuck v-else
                                          :variant="it.product?.variant ?? 'default'"
                                          :size="64" :ring="false" :shadow="false"
                                          :class="idx === 0 ? '' : '-ml-4.5'"
                                          style="box-shadow: 0 0 0 3px var(--color-deep)" />
                            </template>
                            <span v-if="os.items.length > 3"
                                  class="size-16 -ml-4.5 rounded-full flex items-center justify-center bg-[#F7E0B5] text-ink font-extrabold text-[14px]"
                                  style="box-shadow: 0 0 0 3px var(--color-deep)">
                                +{{ os.items.length - 3 }}
                            </span>
                        </div>
                        <span class="font-display font-extrabold text-[18px] leading-tight">{{ os.name }}</span>
                        <span class="text-[13px] text-deepmut leading-snug">{{ os.description }}</span>
                        <div class="mt-auto flex items-end justify-between gap-2">
                            <div class="flex flex-col">
                                <span v-if="(os as any).pricing?.discountPercent"
                                      class="text-[12px] text-deepmut line-through">
                                    {{ fmt(Number((os as any).pricing.basePrice)) }}
                                </span>
                                <span class="font-display font-extrabold text-[22px] leading-none text-btr">
                                    {{ fmt(Number((os as any).pricing?.finalPrice ?? 0)) }}
                                </span>
                            </div>
                            <button type="button" aria-label="В корзину"
                                    class="size-11 rounded-full bg-btr text-ink flex items-center justify-center active:scale-95 transition">
                                <Icon name="plus" :size="20" :stroke="2.8" />
                            </button>
                        </div>
                    </NuxtLink>
                </div>
            </div>
        </section>

        <!-- Товары: горизонтальный скролл ProductCard -->
        <section v-else-if="sectionProducts(s).length"
                 :id="`sec-${s.id}`" class="pt-6 flex flex-col gap-3.5">
            <div class="px-4 flex items-baseline justify-between gap-3">
                <h2 class="m-0 font-display font-black text-[24px]">{{ s.title }}</h2>
                <NuxtLink v-if="s.category?.slug" :to="`/category/${s.category.slug}`"
                            class="text-[13px] font-extrabold text-acct no-underline shrink-0">
                    Все →
                </NuxtLink>
            </div>
            <div class="overflow-x-auto no-scrollbar">
                <div class="flex gap-3 px-4 pb-1 w-max items-stretch">
                    <ProductCard v-for="p in sectionProducts(s)" :key="p.id" :product="p" class="w-[180px]" />
                </div>
            </div>
        </section>
    </template>

    <!-- Chef -->
    <section class="pt-6 px-4">
        <NuxtLink to="/chef" class="block bg-sf rounded-[22px] overflow-hidden no-underline text-ink">
            <div class="flex gap-4 items-start p-5">
                <img src="/chef/photo-main.png" alt="Мирзахаким Газиев"
                     class="shrink-0 w-24 h-32 rounded-2xl object-cover object-top" />
                <div class="flex-1 min-w-0">
                    <div class="text-[11px] font-extrabold uppercase tracking-wider text-acct">
                        Шеф-повар · технолог
                    </div>
                    <div class="mt-1 font-display font-extrabold text-[20px] leading-tight">
                        Мирзахаким Газиев
                    </div>
                    <p class="m-0 mt-2 text-[14px] text-mut leading-relaxed">
                        Представитель кулинарной династии Газиевых. Школа ресторанной сети «Урюк»
                        в Москве, авторская проработка блюд для меню ташкентских ресторанов.
                    </p>
                </div>
            </div>
            <div class="px-5 pb-5 flex items-center justify-between text-acct font-semibold text-[14px]">
                <span>Больше о шеф-поваре</span>
                <Icon name="chevron-right" :size="18" :stroke="2.4" />
            </div>
        </NuxtLink>
    </section>

    <!-- Why puck -->
    <section class="pt-6 px-4 flex flex-col gap-3.5">
        <h2 class="m-0 font-display font-black text-[24px]">Почему soup-pack</h2>
        <ul class="grid grid-cols-2 gap-2.5 list-none m-0 p-0">
            <li v-for="f in features" :key="f.text"
                class="bg-sf rounded-[20px] p-4 flex flex-col gap-2.5">
                <Icon :name="f.icon" :size="26" :stroke="2" class="text-acct" />
                <span class="font-extrabold text-[14px] leading-snug">{{ f.text }}</span>
            </li>
        </ul>
    </section>

    <div class="flex-1 min-h-6"></div>
</template>
