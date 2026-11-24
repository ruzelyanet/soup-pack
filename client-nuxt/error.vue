<script setup lang="ts">
import SoupPuck from '@/components/SoupPuck.vue'

const props = defineProps<{
    error: { statusCode: number; message?: string; url?: string }
}>()

const is404 = computed(() => props.error?.statusCode === 404)

useSeoMeta({
    title: () => is404.value ? 'Страница не найдена — SOUP PACK' : 'Ошибка — SOUP PACK',
    robots: 'noindex, nofollow',
})

async function goHome() {
    await clearError({ redirect: '/' })
}
</script>

<template>
    <div class="min-h-screen w-full bg-bg text-ink flex justify-center">
        <section class="app-frame min-w-0 flex-1 flex flex-col items-center justify-center px-6 py-10 gap-6 text-center">
            <div class="relative">
                <SoupPuck variant="tom-yam" :size="180" :ring="true" :shadow="true" />
                <span class="absolute -right-3 -top-2 bg-deep text-btr font-display font-black text-[20px] px-3 py-1.5 rounded-full shadow-[0_8px_18px_-6px_rgba(0,0,0,0.35)]">
                    {{ error?.statusCode || 404 }}
                </span>
            </div>

            <h1 class="m-0 font-display font-black text-[26px] leading-tight">
                {{ is404 ? 'Такой страницы нет' : 'Что-то пошло не так' }}
            </h1>

            <p class="m-0 text-mut leading-relaxed max-w-[320px]">
                {{ is404
                    ? 'Возможно, ссылка устарела или вы ошиблись в адресе. Загляните в каталог — там уже готовы супы и пасты.'
                    : (error?.message || 'Попробуйте обновить страницу или вернуться на главную.') }}
            </p>

            <button type="button" @click="goHome"
                    class="w-full max-w-[320px] h-[56px] rounded-[20px] bg-acc text-white font-extrabold text-[16px] shadow-[0_14px_30px_-12px_rgba(150,40,10,0.7)] active:scale-[0.98] transition">
                На главную
            </button>
        </section>
    </div>
</template>
