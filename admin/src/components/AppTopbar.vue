<script setup lang="ts">
import { useRouter } from 'vue-router'

const props = defineProps<{
    title: string
    subtitle?: string
    /** Показать стрелку «назад» слева от тайтла.
     *  true — router.back();
     *  строка — router.push(back);
     *  функция — своё поведение (например, переключить режим).
     */
    back?: boolean | string | (() => void)
}>()

const router = useRouter()

function goBack() {
    if (typeof props.back === 'function') {
        props.back()
    } else if (typeof props.back === 'string') {
        router.push(props.back)
    } else {
        if (window.history.length > 1) router.back()
        else router.push('/')
    }
}
</script>

<template>
    <div class="bg-white border-b border-ink-100 px-8 py-5 flex items-center gap-4 sticky top-0 z-30">
        <button
            v-if="back"
            type="button"
            aria-label="Назад"
            class="shrink-0 size-10 rounded-xl border border-ink-200 bg-white text-ink-700 flex items-center justify-center hover:bg-ink-50 transition"
            @click="goBack"
        >
            <i class="pi pi-arrow-left text-sm"></i>
        </button>
        <div class="min-w-0">
            <h1 class="font-display font-extrabold text-2xl leading-tight truncate">{{ title }}</h1>
            <div v-if="subtitle" class="text-sm text-ink-400 mt-0.5 truncate">{{ subtitle }}</div>
        </div>
        <div class="ml-auto flex items-center gap-2">
            <slot name="actions" />
        </div>
    </div>
</template>
