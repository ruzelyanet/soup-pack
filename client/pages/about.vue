<script setup lang="ts">
import { useRouter } from 'vue-router'
import SoupPuck from '@/components/SoupPuck.vue'
import Icon from '@/components/Icon.vue'
import { useCatalog } from '@/stores/catalog'

const router = useRouter()
const goBack = useGoBack()
const catalog = useCatalog()

await useAsyncData('catalog', async () => { await catalog.fetchAll(); return true })

useSeoMeta({
    title: 'О нас — SOUP PACK, ресторанные блюда, шоковая заморозка',
    description: 'SOUP PACK: ресторанное блюдо, остановленное во времени. Шоковая заморозка при −40 °C сохраняет вкус и аромат как при подаче на кухне.',
    // Превью ссылки: логотип (общий из app.vue), заголовок и короткое описание.
    ogTitle: 'О нас — SOUP PACK',
    ogDescription: 'Ресторанные блюда от шеф-повара, остановленные во времени: шоковая заморозка при −40 °C сохраняет вкус, а разогрев занимает 5 минут.',
})

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
            <NuxtLink to="/" aria-label="Назад" type="button"  
                    class="size-11 rounded-full bg-sf flex items-center justify-center">
                <Icon name="chevron-left" :size="20" :stroke="2.4" />
            </NuxtLink>
            <h1 class="m-0 font-display font-black text-[26px] flex-1">О&nbsp;нас</h1>
        </header>

        <!-- Hero -->
        <section class="relative mx-4 rounded-[26px] overflow-hidden bg-deep text-deepink p-6 pt-8">
            <div class="absolute -right-10 -top-10 size-48 rounded-full bg-acc/40 blur-3xl"></div>
            <div class="relative flex flex-col gap-3">
                <div class="flex items-center gap-2.5">
                    <div class="size-9 rounded-full bg-acc flex items-center justify-center text-white font-display font-black text-sm">
                        SP
                    </div>
                    <div class="font-display font-black text-[22px] tracking-tight">
                        SOUP <span class="text-acct">PACK</span>
                    </div>
                </div>
                <h2 class="m-0 font-display font-black text-[28px] leading-tight">
                    Вкусный обед<br>
                    в любом месте
                </h2>
                <div class="flex flex-col gap-4 text-[14px] text-deepmut leading-relaxed">
                    <p class="m-0 font-bold text-deepink text-[16px]">
                        SOUP PACK: ресторанное блюдо, остановленное во времени
                    </p>
                    <p class="m-0">
                        Мы берём блюдо, которое только что приготовил повар, и шоковой заморозкой
                        при −40&nbsp;°C сохраняем его таким, каким оно было в момент подачи.
                        Вы разогреваете его и получаете тот же вкус, аромат, цвет и текстуру,
                        что и на кухне ресторана.
                    </p>

                    <p class="m-0 mt-2 font-bold text-deepink text-[15px]">
                        Что такое шоковая заморозка и почему это важно
                    </p>
                    <p class="m-0">
                        При обычной заморозке продукт остывает медленно. В нём образуются крупные
                        кристаллы льда, они разрушают структуру ингредиентов, и после разморозки
                        блюдо становится водянистым, тусклым и теряет вкус.
                    </p>
                    <p class="m-0">
                        Шоковая заморозка устроена иначе. Горячее, только что приготовленное блюдо
                        за считанные минуты охлаждают при температуре −40&nbsp;°C. Кристаллы льда
                        не успевают вырасти, поэтому овощи остаются упругими, мясо сочным, паста
                        сохраняет текстуру, а бульон остаётся прозрачным и насыщенным.
                    </p>
                    <p class="m-0">
                        Мы не консервируем еду, а сохраняем её свежей, только что приготовленной.
                    </p>

                    <p class="m-0 mt-2 font-bold text-deepink text-[15px]">
                        Как появляется каждое блюдо SOUP PACK
                    </p>
                    <ol class="m-0 pl-5 list-decimal flex flex-col gap-1.5">
                        <li><span class="font-bold text-deepink">Готовим как в ресторане.</span>
                            Повара работают по авторским рецептурам, из отборных ингредиентов, с тем же
                            вниманием к деталям, что и для гостя в зале.</li>
                        <li><span class="font-bold text-deepink">Замораживаем сразу.</span>
                            Через несколько минут после приготовления блюдо отправляется в шоковую
                            заморозку при −40&nbsp;°C, пока вкус и аромат на пике.</li>
                        <li><span class="font-bold text-deepink">Формуем порцию.</span>
                            Каждое блюдо становится аккуратной шайбой весом 350&nbsp;граммов.
                            Это полноценная порция на одного.</li>
                        <li><span class="font-bold text-deepink">Вы разогреваете.</span>
                            Несколько минут на плите или в микроволновке, и перед вами блюдо,
                            которое выглядит и пахнет так, будто его только что сняли с огня.</li>
                    </ol>

                    <p class="m-0 mt-2 font-bold text-deepink text-[15px]">
                        Почему SOUP PACK
                    </p>
                    <ul class="m-0 pl-5 list-disc flex flex-col gap-1.5">
                        <li><span class="font-bold text-deepink">Вкус как в ресторане.</span>
                            Шоковая заморозка при −40&nbsp;°C сохраняет вкус, аромат и текстуру блюда.</li>
                        <li><span class="font-bold text-deepink">Красота подачи.</span>
                            Цвет овощей, прозрачность бульона, форма пасты остаются как на тарелке у повара.</li>
                        <li><span class="font-bold text-deepink">Порция 350&nbsp;г.</span>
                            Полноценный обед без лишнего.</li>
                        <li><span class="font-bold text-deepink">Несколько минут вместо часов.</span>
                            Ресторанное блюдо дома или в офисе без готовки.</li>
                        <li><span class="font-bold text-deepink">Разнообразие.</span>
                            Супы и пасты на любой вкус.</li>
                    </ul>

                    <p class="m-0 mt-2 font-bold text-deepink text-[15px]">
                        Наша миссия
                    </p>
                    <p class="m-0">
                        Мы хотим доказать, что замороженная еда может быть ресторанной. Что «быстро»
                        не значит «невкусно», а «заморожено» не значит «хуже свежего». При правильной
                        технологии заморозка не забирает у блюда качество, а сохраняет его.
                    </p>

                    <p class="m-0 mt-2 font-bold text-deepink text-[15px]">
                        SOUP PACK. Открой, разогрей, наслаждайся ресторанным вкусом.
                    </p>
                </div>
            </div>
            <div class="relative pt-5 flex items-center justify-center">
                <SoupPuck variant="tom-yam" :size="160" :ring="true" :shadow="true" />
            </div>
        </section>

        <!-- Chef -->
        <section class="px-4 pt-8">
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

        <!-- Halal -->
        <section class="px-4 pt-8">
            <div class="bg-sf rounded-[22px] p-5 flex items-center gap-4 border border-emerald-600/20">
                <div class="shrink-0 size-14 rounded-2xl bg-emerald-600/15 text-emerald-700 flex items-center justify-center">
                    <Icon name="check" :size="28" :stroke="2.4" />
                </div>
                <div class="flex-1 min-w-0">
                    <div class="font-display font-black text-[18px] leading-tight">Халяль</div>
                    <p class="m-0 mt-1 text-[13px] text-mut leading-relaxed">
                        Вся продукция SOUP PACK соответствует стандартам халяль: мясо
                        и ингредиенты от проверенных поставщиков.
                    </p>
                </div>
            </div>
        </section>

        <!-- Stats -->
        <section class="px-4 pt-8">
            <div class="bg-acc text-white rounded-[24px] px-5 py-2 divide-y divide-white/15">
                <div class="py-4 flex items-center gap-4">
                    <div class="shrink-0 size-11 rounded-xl bg-white/15 flex items-center justify-center">
                        <Icon name="bag" :size="22" :stroke="2" />
                    </div>
                    <div class="font-display font-black text-[22px] leading-none">350&nbsp;г</div>
                    <div class="ml-auto text-[13px] font-semibold opacity-90 text-right">Формат порции</div>
                </div>
                <div class="py-4 flex items-center gap-4">
                    <div class="shrink-0 size-11 rounded-xl bg-white/15 flex items-center justify-center">
                        <Icon name="sparkles" :size="22" :stroke="2" />
                    </div>
                    <div class="font-display font-black text-[22px] leading-none">10+</div>
                    <div class="ml-auto text-[13px] font-semibold opacity-90 text-right">Рецептов в меню</div>
                </div>
                <div class="py-4 flex items-center gap-4">
                    <div class="shrink-0 size-11 rounded-xl bg-white/15 flex items-center justify-center">
                        <Icon name="snow" :size="22" :stroke="2" />
                    </div>
                    <div class="font-display font-black text-[22px] leading-none">90&nbsp;дней</div>
                    <div class="ml-auto text-[13px] font-semibold opacity-90 text-right">Хранение в морозилке</div>
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
