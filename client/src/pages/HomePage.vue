<script setup lang="ts">
import { computed } from 'vue'
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

const sets = computed(() => catalog.sets.filter((s) => s.showInCatalog))

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
                    SOUP <span class="text-acc">PUCK</span>
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
                <RouterLink to="/account" aria-label="Личный кабинет"
                            class="size-11 rounded-full bg-btr text-ink flex items-center justify-center font-display font-black text-[16px]">
                    {{ avatarLetter }}
                </RouterLink>
            </div>
        </div>
        <RouterLink to="/search"
                    class="mt-3 h-[50px] rounded-2xl bg-sf border border-ln text-fnt flex items-center gap-2.5 px-3.5 font-semibold text-[15px]">
            <Icon name="search" :size="20" />
            Том-ям, крем-суп, набор…
        </RouterLink>
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
        <div class="overflow-x-auto no-scrollbar">
            <div class="flex gap-2.5 px-4 w-max">
                <component v-for="b in catalog.banners" :key="b.id"
                           :is="b.linkUrl ? 'a' : 'div'"
                           :href="b.linkUrl || undefined"
                           class="relative block w-[330px] h-[190px] rounded-[28px] overflow-hidden bg-ink text-deepink no-underline">
                    <!-- Фон: загруженная картинка или градиент -->
                    <img v-if="b.image?.url" :src="mediaUrl(b.image.url)" :alt="b.title"
                         class="absolute inset-0 w-full h-full object-cover" />
                    <div v-else class="absolute inset-0 bg-gradient-to-br from-acc to-ink"></div>
                    <!-- Тёмная подложка для читаемости текста поверх изображения -->
                    <div v-if="b.image?.url"
                         class="absolute inset-0 bg-gradient-to-r from-ink/80 via-ink/40 to-transparent"></div>
                    <!-- Текст -->
                    <div class="absolute left-5 top-5 w-[220px] flex flex-col gap-2 z-10">
                        <span class="font-display font-black text-[21px] leading-[1.05]">
                            {{ b.title }}
                        </span>
                        <span v-if="b.subtitle" class="text-[13px] opacity-90 leading-snug">
                            {{ b.subtitle }}
                        </span>
                    </div>
                </component>
            </div>
        </div>
    </section>

    <!-- Repeat last order / Login shortcut -->
    <section class="px-4 pt-4">
        <!-- Авторизован + есть прошлый заказ -->
        <RouterLink v-if="auth.isAuthed && lastOrder" :to="`/order/${lastOrder.code}`"
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
        </RouterLink>

        <!-- Не авторизован — предложение войти, чтобы повторить заказ -->
        <RouterLink v-else-if="!auth.isAuthed" to="/login"
                    class="flex items-center gap-3 bg-ink text-deepink rounded-[20px] px-3.5 py-3">
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
        </RouterLink>
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
                <RouterLink to="/sets" class="text-[13px] font-extrabold text-acct no-underline shrink-0">
                    Все →
                </RouterLink>
            </div>
            <div class="overflow-x-auto no-scrollbar">
                <div class="flex gap-3 px-4 pb-1.5 w-max">
                    <RouterLink v-for="os in sets" :key="os.id" :to="`/set/${os.slug}`"
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
                    </RouterLink>
                </div>
            </div>
        </section>

        <!-- Товары: горизонтальный скролл ProductCard -->
        <section v-else-if="sectionProducts(s).length"
                 :id="`sec-${s.id}`" class="pt-6 flex flex-col gap-3.5">
            <div class="px-4 flex items-baseline justify-between gap-3">
                <h2 class="m-0 font-display font-black text-[24px]">{{ s.title }}</h2>
                <RouterLink v-if="s.category?.slug" :to="`/category/${s.category.slug}`"
                            class="text-[13px] font-extrabold text-acct no-underline shrink-0">
                    Все →
                </RouterLink>
            </div>
            <div class="overflow-x-auto no-scrollbar">
                <div class="flex gap-3 px-4 pb-1 w-max items-stretch">
                    <ProductCard v-for="p in sectionProducts(s)" :key="p.id" :product="p" class="w-[180px]" />
                </div>
            </div>
        </section>
    </template>

    <!-- Why puck -->
    <section class="pt-6 px-4 flex flex-col gap-3.5">
        <h2 class="m-0 font-display font-black text-[24px]">Почему шайба</h2>
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
