<script setup lang="ts">
import { useRouter } from 'vue-router'
import Icon from '@/components/Icon.vue'
import { useCatalog } from '@/stores/catalog'
import DeliveryMethodsList from '@/components/DeliveryMethodsList.vue'

const router = useRouter()
const goBack = useGoBack()
const catalog = useCatalog()

await useAsyncData('catalog', async () => { await catalog.fetchAll(); return true })

useSeoMeta({
    title: 'Доставка и оплата — SOUP PACK, готовые супы в Ташкенте',
    description: 'Как доставляем блюда SOUP PACK, зоны доставки по Ташкенту, способы оплаты: наличные, перевод, карта.',
})

const payMethods = [
    { title: 'Наличными',       text: 'Доступно только при предзаказе с собственным курьером.' },
    { title: 'Переводом',       text: 'На карту менеджера. Подтверждаем заказ после поступления.' },
    { title: 'Click, Payme',    text: 'Подключим в ближайшее время. Пока недоступно.' },
]

const steps = [
    { num: '1', title: 'Собираем заказ',    text: 'Готовим шайбы к отправке, упаковываем в термопакет — обычно в пределах 10 минут.' },
    { num: '2', title: 'Отправляем',        text: 'Передаём заказ выбранным способом доставки — от нашей кухни до вашего адреса.' },
    { num: '3', title: 'Стоимость — в чеке', text: 'Цена доставки зависит от способа и сразу видна в корзине и при оформлении заказа.' },
    { num: '4', title: 'Разогрейте',        text: 'В микроволновке 4–5 минут или на плите в кастрюле 7–10 минут.' },
]

const rules = [
    { icon: 'snow',     title: 'Храните в морозилке',      text: 'До 30 дней при −18°C. После разморозки повторно замораживать нельзя.' },
    { icon: 'clock',    title: 'Разогрейте в день заказа', text: 'Если план съесть позже — положите в морозильник сразу после получения.' },
    { icon: 'sparkles', title: 'Разогреть можно по-разному', text: 'Крышку приоткройте и грейте в микроволновке; либо выложите в кастрюлю.' },
]
</script>

<template>
    <section class="flex-1 flex flex-col pb-2">
        <!-- Header -->
        <header class="px-4 pt-3.5 pb-2 flex items-center gap-3">
            <NuxtLink to="/" aria-label="Назад" type="button"  
                    class="size-11 rounded-full bg-sf flex items-center justify-center">
                <Icon name="chevron-left" :size="20" :stroke="2.4" />
            </NuxtLink>
            <h1 class="m-0 font-display font-black text-[26px] flex-1">Доставка&nbsp;и&nbsp;оплата</h1>
        </header>

        <!-- Hero: доставка по городу (способы и цены — из админки, ниже) -->
        <section class="relative mx-4 rounded-[26px] overflow-hidden bg-deep text-deepink p-6">
            <div class="absolute -right-10 -top-10 size-48 rounded-full bg-acc/30 blur-3xl"></div>
            <div class="relative flex flex-col gap-3">
                <div class="inline-flex items-center gap-2 self-start bg-btr text-ink font-extrabold text-[11px] tracking-wider uppercase px-2.5 py-1 rounded-full">
                    <Icon name="map-pin" :size="12" :stroke="2.6" />
                    Доставка по городу
                </div>
                <h2 class="m-0 font-display font-black text-[26px] leading-tight">
                    Привезём по <span class="text-btr">Ташкенту</span>
                </h2>
                <p class="m-0 text-[14px] text-deepmut leading-relaxed">
                    После подтверждения заказа отправляем его выбранным способом доставки —
                    способы и их стоимость перечислены ниже.
                </p>
                <div class="mt-1 bg-[rgba(255,241,220,0.08)] rounded-[16px] px-4 py-3 flex items-center justify-between gap-3">
                    <span class="text-[11px] font-bold uppercase tracking-wider text-deepmut">
                        доставка по городу
                    </span>
                    <span class="font-display font-black text-[22px] text-btr leading-none whitespace-nowrap">
                        30–50&nbsp;мин
                    </span>
                </div>
            </div>
        </section>

        <!-- Способы и стоимость — из админки (сущность «Доставка»): цена, описание, скидки -->
        <section class="px-4 pt-8 flex flex-col gap-3">
            <h3 class="m-0 font-display font-black text-[22px]">Способы и стоимость</h3>
            <DeliveryMethodsList variant="full" />
            <p class="m-0 px-1 text-[12px] text-fnt leading-relaxed">
                Способ доставки выбираете при оформлении заказа. Скидка, привязанная к способу доставки,
                применяется к заказу автоматически, если выполнены её условия.
            </p>
        </section>

        <!-- Как это работает -->
        <section class="px-4 pt-8 flex flex-col gap-3">
            <h3 class="m-0 font-display font-black text-[22px]">Как это работает</h3>
            <ol class="list-none m-0 p-0 flex flex-col gap-2.5">
                <li v-for="s in steps" :key="s.num"
                    class="bg-sf rounded-[20px] p-4 flex gap-3 items-start">
                    <div class="shrink-0 size-10 rounded-full bg-ink text-bg flex items-center justify-center font-display font-black text-[16px]">
                        {{ s.num }}
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="font-extrabold text-[15px]">{{ s.title }}</div>
                        <div class="text-[13px] text-mut leading-relaxed mt-1">{{ s.text }}</div>
                    </div>
                </li>
            </ol>
        </section>

        <!-- Способы оплаты -->
        <section class="px-4 pt-8 flex flex-col gap-3">
            <h3 class="m-0 font-display font-black text-[22px]">Способы оплаты</h3>
            <ul class="list-none m-0 p-0 grid grid-cols-1 gap-2.5">
                <li v-for="m in payMethods" :key="m.title"
                    class="bg-sf rounded-[20px] p-4 flex gap-3 items-start">
                    <div class="shrink-0 size-10 rounded-xl bg-acc/15 text-acct flex items-center justify-center">
                        <Icon name="receipt" :size="20" :stroke="2" />
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="font-extrabold text-[15px]">{{ m.title }}</div>
                        <div class="text-[13px] text-mut leading-relaxed mt-1">{{ m.text }}</div>
                    </div>
                </li>
            </ul>
            <p class="m-0 px-1 text-[12px] text-fnt leading-relaxed">
                Стоимость доставки зависит от выбранного способа — смотрите «Способы и стоимость» выше.
            </p>
        </section>

        <!-- Хранение и разогрев -->
        <section class="px-4 pt-8 flex flex-col gap-3">
            <h3 class="m-0 font-display font-black text-[22px]">После доставки</h3>
            <ul class="list-none m-0 p-0 grid grid-cols-1 gap-2.5">
                <li v-for="r in rules" :key="r.title"
                    class="bg-sf rounded-[20px] p-4 flex gap-3 items-start">
                    <div class="shrink-0 size-11 rounded-xl bg-tint-tom text-ink flex items-center justify-center">
                        <Icon :name="r.icon" :size="22" :stroke="2" />
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="font-extrabold text-[15px]">{{ r.title }}</div>
                        <div class="text-[13px] text-mut leading-relaxed mt-1">{{ r.text }}</div>
                    </div>
                </li>
            </ul>
        </section>

        <!-- Контакты -->
        <section class="px-4 pt-8">
            <div class="bg-deep text-deepink rounded-[22px] p-5 flex flex-col gap-3">
                <div class="text-[11px] font-extrabold uppercase tracking-wider text-btr">Остались вопросы</div>
                <a v-if="catalog.contact.phone" :href="`tel:${catalog.phoneTel}`"
                   class="flex items-center gap-3 text-deepink no-underline">
                    <Icon name="phone" :size="20" />
                    <span class="font-extrabold text-[18px]">{{ catalog.contact.phone }}</span>
                </a>
                <div v-if="catalog.contact.workHours" class="flex items-center gap-3">
                    <Icon name="clock" :size="20" />
                    <span class="text-[14px]">{{ catalog.contact.workHours }}</span>
                </div>
                <div class="flex items-center gap-3">
                    <Icon name="map-pin" :size="20" />
                    <span class="text-[14px]">
                        {{ catalog.contact.city || 'Ташкент' }} · доставка в пределах города
                    </span>
                </div>
            </div>
        </section>
    </section>
</template>
