<!-- Иконки секций главной — те же пути, что в client/components/Icon.vue (держать в синхроне). -->
<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{ name?: string | null; size?: number; stroke?: number }>(), {
    name: 'catalog', size: 20, stroke: 2.2,
})

const html = computed(() => SECTION_ICON_PATHS[props.name || 'catalog'] || SECTION_ICON_PATHS.catalog)
</script>

<script lang="ts">
export const SECTION_ICON_PATHS: Record<string, string> = {
    bowl:     '<path d="M3 11h18a9 9 0 0 1-18 0z"/><path d="M8 7c0-1.5 1-1.5 1-3M12 7c0-1.5 1-1.5 1-3M16 7c0-1.5 1-1.5 1-3"/>',
    flame:    '<path d="M12 22a6 6 0 0 0 6-6c0-4-3-6-4-10-2 2-3 4-3 6-1-1-2-2-2-3-2 2-3 4-3 7a6 6 0 0 0 6 6z"/>',
    star:     '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
    sparkles: '<path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5zM5 17l.75 2.25L8 20l-2.25.75L5 23l-.75-2.25L2 20l2.25-.75z"/>',
    percent:  '<path d="M19 5L5 19"/><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/>',
    gift:     '<rect x="3" y="8" width="18" height="5" rx="1"/><path d="M5 13v8h14v-8M12 8v13M12 8c-2-4-6-4-6-1.5S10 8 12 8zm0 0c2-4 6-4 6-1.5S14 8 12 8z"/>',
    cup:      '<path d="M5 8h12v6a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5z"/><path d="M17 10h1.5a2.5 2.5 0 0 1 0 5H17M9 3v2M13 3v2"/>',
    leaf:     '<path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14z"/><path d="M5 19l7-7"/>',
    snow:     '<path d="M12 2v20M3.3 7l17.4 10M20.7 7L3.3 17"/>',
    heart:    '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>',
    clock:    '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/>',
    bag:      '<path d="M5 7h14l-1.5 11.5a2 2 0 0 1-2 1.5h-7a2 2 0 0 1-2-1.5z"/><path d="M9 7V5a3 3 0 0 1 6 0v2"/>',
    catalog:  '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>',
    home:     '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
    receipt:  '<path d="M6 4h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 9h6M9 13h4"/>',
    filter:   '<path d="M4 7h16M7 12h10M10 17h4"/>',
    map:      '<path d="M3 7l6-2 6 2 6-2v12l-6 2-6-2-6 2z"/><path d="M9 5v14M15 7v14"/>',
    phone:    '<path d="M4 5c0 10 5 15 15 15l1-4-5-2-2 3c-2-1-5-4-6-6l3-2-2-5z"/>',
}

/** Порядок и подписи в выборе иконки. */
export const SECTION_ICONS: Array<{ name: string; label: string }> = [
    { name: 'bowl', label: 'Суп' }, { name: 'flame', label: 'Острое' }, { name: 'star', label: 'Хиты' },
    { name: 'sparkles', label: 'Новинки' }, { name: 'percent', label: 'Скидки' }, { name: 'gift', label: 'Наборы' },
    { name: 'cup', label: 'Напитки' }, { name: 'leaf', label: 'Лёгкое' }, { name: 'snow', label: 'Заморозка' },
    { name: 'heart', label: 'Любимое' }, { name: 'clock', label: 'Быстро' }, { name: 'bag', label: 'Покупки' },
    { name: 'catalog', label: 'Каталог' }, { name: 'home', label: 'Домашнее' }, { name: 'receipt', label: 'Меню' },
    { name: 'filter', label: 'Подборка' }, { name: 'map', label: 'Кухни мира' }, { name: 'phone', label: 'Звонок' },
]
</script>

<template>
    <svg :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         :stroke-width="stroke" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" v-html="html" />
</template>
