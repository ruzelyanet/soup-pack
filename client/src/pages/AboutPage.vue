<script setup lang="ts">
import { useRouter } from 'vue-router'
import SoupPuck from '@/components/SoupPuck.vue'
import Icon from '@/components/Icon.vue'
import { useCatalog } from '@/stores/catalog'

const router = useRouter()
const catalog = useCatalog()

const values = [
    { icon: 'leaf',     title: 'Натуральный состав', text: 'Только фермерские овощи, мясо и зелень. Без консервантов, усилителей вкуса и ароматизаторов.' },
    { icon: 'snow',     title: 'Шоковая заморозка', text: 'Технология «−40°C за минуты» сохраняет вкус, витамины и структуру ингредиентов.' },
    { icon: 'clock',    title: '5 минут и готово',  text: 'Разогрел в микроволновке или кастрюле — и получаешь ресторанное блюдо дома.' },
    { icon: 'heart',    title: 'Для всей семьи',    text: 'Проверенные рецепты и порции, которых хватит на обед или ужин двоим-троим.' },
]
</script>

<template>
    <section class="flex-1 flex flex-col pb-2">
        <!-- Header -->
        <header class="px-4 pt-3.5 pb-2 flex items-center gap-3">
            <button type="button" aria-label="Назад" @click="router.back()"
                    class="size-11 rounded-full bg-sf flex items-center justify-center">
                <Icon name="chevron-left" :size="20" :stroke="2.4" />
            </button>
            <h1 class="m-0 font-display font-black text-[26px] flex-1">О&nbsp;нас</h1>
        </header>

        <!-- Hero -->
        <section class="relative mx-4 rounded-[26px] overflow-hidden bg-ink text-deepink p-6 pt-8">
            <div class="absolute -right-10 -top-10 size-48 rounded-full bg-acc/40 blur-3xl"></div>
            <div class="relative flex flex-col gap-3">
                <div class="flex items-center gap-2.5">
                    <div class="size-9 rounded-full bg-acc flex items-center justify-center text-white font-display font-black text-sm">
                        SP
                    </div>
                    <div class="font-display font-black text-[22px] tracking-tight">
                        SOUP <span class="text-acct">PUCK</span>
                    </div>
                </div>
                <h2 class="m-0 font-display font-black text-[28px] leading-tight">
                    Вкусный обед<br>
                    в любом месте
                </h2>
                <p class="m-0 text-[15px] text-deepmut leading-relaxed">
                    Мы делаем честные супы и пасты в формате «шайбы» 350 г — удобно разогреть,
                    невозможно отличить от свежеприготовленного. Это не «корма быстрого
                    приготовления», это настоящая еда, которую технологи и повара собирают
                    по рецептам каждый день.
                </p>
            </div>
            <div class="relative pt-5 flex items-center justify-center">
                <SoupPuck variant="tom-yam" :size="160" :ring="true" :shadow="true" />
            </div>
        </section>

        <!-- Chef -->
        <section class="px-4 pt-8">
            <div class="bg-sf rounded-[22px] p-5 flex gap-4 items-start">
                <div class="shrink-0 size-20 rounded-full bg-tint-tom flex items-center justify-center text-ink font-display font-black text-[26px]">
                    АА
                </div>
                <div class="flex-1 min-w-0">
                    <div class="text-[11px] font-extrabold uppercase tracking-wider text-acct">
                        Технолог шеф-повар
                    </div>
                    <div class="mt-1 font-display font-extrabold text-[20px] leading-tight">
                        Азиз Алиев
                    </div>
                    <p class="m-0 mt-2 text-[14px] text-mut leading-relaxed">
                        15 лет на кухнях ташкентских ресторанов и 3 года в R&amp;D готовой еды.
                        Отвечает за рецептуру, калибровку порций и контроль закупок. Без его
                        согласия в наш каталог не попадает ни один суп.
                    </p>
                    <div class="mt-3 bg-sf2 rounded-xl px-3 py-2 text-[13px] italic text-ink">
                        «Шайба — это ограничение, но ограничение делает рецепт честнее:
                        нет места лишнему, остаётся только то, что действительно вкусно».
                    </div>
                </div>
            </div>
        </section>

        <!-- Values -->
        <section class="px-4 pt-8">
            <h3 class="m-0 font-display font-black text-[22px]">Что мы делаем правильно</h3>
            <ul class="mt-4 grid grid-cols-1 gap-3 list-none p-0">
                <li v-for="v in values" :key="v.title"
                    class="bg-sf rounded-[20px] p-4 flex gap-3 items-start">
                    <div class="shrink-0 size-11 rounded-xl bg-acc/15 text-acct flex items-center justify-center">
                        <Icon :name="v.icon" :size="22" :stroke="2" />
                    </div>
                    <div>
                        <div class="font-extrabold text-[15px]">{{ v.title }}</div>
                        <div class="text-[13px] text-mut leading-relaxed mt-1">{{ v.text }}</div>
                    </div>
                </li>
            </ul>
        </section>

        <!-- Stats -->
        <section class="px-4 pt-8">
            <div class="grid grid-cols-3 gap-2">
                <div class="bg-sf rounded-[18px] p-4 text-center">
                    <div class="font-display font-black text-[22px] text-acct">350&nbsp;г</div>
                    <div class="text-[11px] font-bold uppercase tracking-wider text-fnt mt-1">формат порции</div>
                </div>
                <div class="bg-sf rounded-[18px] p-4 text-center">
                    <div class="font-display font-black text-[22px] text-acct">10+</div>
                    <div class="text-[11px] font-bold uppercase tracking-wider text-fnt mt-1">рецептов в меню</div>
                </div>
                <div class="bg-sf rounded-[18px] p-4 text-center">
                    <div class="font-display font-black text-[22px] text-acct">30&nbsp;дней</div>
                    <div class="text-[11px] font-bold uppercase tracking-wider text-fnt mt-1">хранение в морозилке</div>
                </div>
            </div>
        </section>

        <!-- Contacts -->
        <section class="px-4 pt-8">
            <div class="bg-deep text-deepink rounded-[22px] p-5 flex flex-col gap-3">
                <div class="text-[11px] font-extrabold uppercase tracking-wider text-btr">Связаться</div>
                <a v-if="catalog.contact.phone" :href="`tel:${catalog.phoneTel}`"
                   class="flex items-center gap-3 text-deepink no-underline">
                    <Icon name="phone" :size="20" />
                    <span class="font-extrabold text-[18px]">{{ catalog.contact.phone }}</span>
                </a>
                <div class="flex items-center gap-3">
                    <Icon name="map-pin" :size="20" />
                    <span>{{ catalog.contact.city || 'Ташкент' }} · доставка по городу</span>
                </div>
                <div v-if="catalog.contact.workHours" class="flex items-center gap-3">
                    <Icon name="clock" :size="20" />
                    <span>{{ catalog.contact.workHours }}</span>
                </div>
            </div>
        </section>
    </section>
</template>
