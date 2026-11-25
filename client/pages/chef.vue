<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import Icon from '@/components/Icon.vue'

const router = useRouter()
const goBack = useGoBack()

useSeoMeta({
    title: 'Шеф-повар — Мирзахаким Газиев · SOUP PACK',
    description: 'Шеф-повар SOUP PACK Мирзахаким Газиев. Династия Газиевых, школа ресторанной сети «Урюк», авторская проработка блюд.',
})

const portrait = '/chef/photo-main.png'
const gallery = [
    '/chef/photo-08.jpeg',
    '/chef/photo-05.jpeg',
    '/chef/photo-11.jpeg',
    '/chef/photo-15.jpeg',
    '/chef/photo-14.jpeg',
    '/chef/photo-13.jpeg',
    '/chef/photo-03.jpeg',
    '/chef/photo-06.jpeg',
    '/chef/photo-07.jpeg',
    '/chef/photo-04.jpeg',
    '/chef/photo-12.jpeg',
    '/chef/photo-10.jpeg',
    '/chef/photo-01.jpeg',
    '/chef/photo-02.jpeg',
]

const lightbox = ref<string | null>(null)
</script>

<template>
    <section class="flex-1 flex flex-col pb-6">
        <!-- Header -->
        <header class="px-4 pt-3.5 pb-2 flex items-center gap-3">
            <NuxtLink to="/" aria-label="Назад" type="button"  
                    class="size-11 rounded-full bg-sf flex items-center justify-center">
                <Icon name="chevron-left" :size="20" :stroke="2.4" />
            </NuxtLink>
            <h1 class="m-0 font-display font-black text-[22px] flex-1">Шеф-повар</h1>
        </header>

        <!-- Hero -->
        <section class="relative mx-4 rounded-[26px] overflow-hidden bg-deep text-deepink">
            <img :src="portrait" alt="Мирзахаким Газиев"
                 class="w-full h-[380px] object-cover" />
            <div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-deep via-deep/70 to-transparent p-5 pt-16">
                <div class="text-[11px] font-extrabold uppercase tracking-wider text-btr">
                    Шеф-повар · технолог
                </div>
                <h2 class="m-0 mt-1 font-display font-black text-[26px] leading-tight">
                    Мирзахаким Газиев
                </h2>
                <p class="m-0 mt-2 text-[14px] text-deepmut leading-relaxed">
                    Человек, для которого вкус стал наследием, а кухня — призванием.
                </p>
            </div>
        </section>

        <!-- Лид -->
        <section class="px-4 pt-6">
            <p class="m-0 text-[15px] leading-relaxed text-ink">
                Есть повара, которые выбирают профессию. А есть те, кто рождается в атмосфере кухни,
                где запах свежего хлеба, жар раскалённой сковороды и искусство приготовления блюд
                становятся частью семейной истории.
            </p>
            <p class="m-0 mt-3 text-[15px] leading-relaxed text-ink">
                Мирзахаким Газиев — представитель кулинарной династии Газиевых, шеф-повар нового
                поколения, технолог и ценитель гастрономического искусства.
            </p>
        </section>

        <!-- Династия -->
        <section class="px-4 pt-7">
            <h3 class="m-0 font-display font-black text-[20px]">Династия Газиевых</h3>
            <p class="m-0 mt-3 text-[14px] leading-relaxed text-mut">
                <b class="text-ink">Абликим Газиев</b> — отец, профессиональный шеф-повар,
                работавший шеф-поваром нескольких ресторанов московской сети «Урюк».
                Именно наблюдая за работой отца, Мирзахаким с ранних лет знакомился с
                профессиональной кухней, дисциплиной и технологией приготовления.
            </p>
            <p class="m-0 mt-3 text-[14px] leading-relaxed text-mut">
                <b class="text-ink">Азима Газиева</b> — мать, профессиональный кондитер и повар
                холодного цеха. От неё унаследовано особое внимание к деталям, эстетике,
                сочетанию вкусов и культуре подачи.
            </p>
            <p class="m-0 mt-3 text-[14px] leading-relaxed text-mut">
                Кулинарная традиция продолжилась и в следующем поколении — младший брат
                <b class="text-ink">Мирсалим</b> работал су-шефом в сети «Павлин-Мавлин»
                (Симферополь); дядя <b class="text-ink">Абдунаби</b> — шеф-повар сети «Темпел-Бар»,
                его супруга <b class="text-ink">Хуршида</b> — профессиональный су-шеф;
                двоюродные братья <b class="text-ink">Абдукадир</b> и <b class="text-ink">Абдурашид</b>
                — шеф-повар в Астане и старший повар ресторана «Диван» в Ташкенте соответственно.
            </p>
        </section>

        <!-- Москва -->
        <section class="px-4 pt-7">
            <h3 class="m-0 font-display font-black text-[20px]">Школа профессиональной кухни</h3>
            <p class="m-0 mt-3 text-[14px] leading-relaxed text-mut">
                Одним из важных этапов становления стала работа в Москве в ресторанной сети
                «Урюк». Там, где отец уже занимал должность шеф-повара нескольких ресторанов,
                Мирзахаким начинал путь с позиции рядового повара и прошёл настоящую ресторанную
                школу: интенсивный ритм, высокие требования к качеству, командную дисциплину
                и постоянное совершенствование мастерства.
            </p>
            <p class="m-0 mt-3 text-[14px] leading-relaxed text-mut">
                До Москвы его путь был связан с рестораном «Бинкет» в Ташкенте. Для него кухня
                никогда не ограничивалась механическим повторением рецептов — главным интересом
                оставалось понимание самого вкуса: почему ингредиенты раскрываются вместе,
                как рождается гармония.
            </p>
        </section>

        <!-- Технолог -->
        <section class="px-4 pt-7">
            <h3 class="m-0 font-display font-black text-[20px]">Технолог вкуса и авторский подход</h3>
            <p class="m-0 mt-3 text-[14px] leading-relaxed text-mut">
                Отдельное направление — участие в разработке и технологической проработке блюд
                для ресторанных меню Ташкента. Интерес простирается за пределы приготовления:
                изучение ингредиентов, поиск пропорций, дегустация, корректировка рецептур и
                работа над стабильностью вкусового результата.
            </p>
            <p class="m-0 mt-3 text-[14px] leading-relaxed text-mut">
                Особое место занимает дегустационное мастерство — способность анализировать
                вкус, аромат, текстуру, баланс специй и послевкусие. Для Мирзахакима хорошее
                блюдо — это результат точности, опыта, наблюдательности и понимания продукта.
            </p>
        </section>

        <!-- Философия + цитата -->
        <section class="px-4 pt-7">
            <h3 class="m-0 font-display font-black text-[20px]">Философия нового поколения</h3>
            <p class="m-0 mt-3 text-[14px] leading-relaxed text-mut">
                Сегодня Мирзахаким развивает собственное видение современной гастрономии,
                объединяя традиции восточной кухни, международный ресторанный опыт и
                современные технологии пищевого производства. Один из его проектов — SOUP PACK,
                концепция замороженных порционных супов и готовых блюд, созданная для того,
                чтобы ресторанное качество и авторский подход стали доступнее широкой аудитории.
            </p>

            <div class="mt-4 bg-deep text-deepink rounded-[22px] p-5">
                <div class="text-[11px] font-extrabold uppercase tracking-wider text-btr mb-2">
                    Его философия
                </div>
                <p class="m-0 font-display font-extrabold text-[18px] leading-snug">
                    «Высокая кухня не должна быть недоступной.
                    Настоящий вкус должен быть для каждого.»
                </p>
            </div>
        </section>

        <!-- Галерея -->
        <section class="pt-7">
            <h3 class="px-4 m-0 font-display font-black text-[20px]">Галерея</h3>
            <div class="mt-4 overflow-x-auto no-scrollbar">
                <div class="flex gap-2.5 px-4 w-max">
                    <button v-for="src in gallery" :key="src" type="button"
                            @click="lightbox = src"
                            class="shrink-0 w-[180px] h-[240px] rounded-[18px] overflow-hidden bg-sf p-0 border-0 cursor-pointer">
                        <img :src="src" :alt="''" loading="lazy"
                             class="w-full h-full object-cover" />
                    </button>
                </div>
            </div>
        </section>

        <!-- Финал -->
        <section class="px-4 pt-7">
            <h3 class="m-0 font-display font-black text-[20px]">Наследие продолжается</h3>
            <p class="m-0 mt-3 text-[14px] leading-relaxed text-mut">
                История Мирзахакима Газиева — это история семьи, в которой профессия стала
                традицией, опыт передаётся между поколениями, а любовь к кулинарии объединяет
                родственников в разных городах и странах. От московских ресторанных кухонь
                до гастрономических проектов Ташкента — его путь продолжается.
            </p>
            <p class="m-0 mt-3 text-[14px] leading-relaxed text-ink font-semibold">
                Газиевы — это не просто фамилия. Это семейная история, в которой вкус стал наследием.
            </p>
        </section>

        <!-- Lightbox -->
        <div v-if="lightbox"
             class="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center p-4"
             @click="lightbox = null">
            <img :src="lightbox" alt="" class="max-w-full max-h-full object-contain rounded-xl" />
            <button type="button" aria-label="Закрыть"
                    class="absolute top-4 right-4 size-11 rounded-full bg-white/10 text-white flex items-center justify-center"
                    @click.stop="lightbox = null">
                <Icon name="close" :size="22" :stroke="2.4" />
            </button>
        </div>
    </section>
</template>
