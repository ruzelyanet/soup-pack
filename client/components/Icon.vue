<script setup lang="ts">
const props = withDefaults(
    defineProps<{
        name: string
        size?: number | string
        stroke?: number
    }>(),
    { size: 20, stroke: 2.2 },
)

/* Небольшая встроенная библиотека линейных иконок (currentColor stroke). */
const PATHS: Record<string, string> = {
    'chevron-left':  '<path d="M15 6l-6 6 6 6"/>',
    'chevron-right': '<path d="M9 6l6 6-6 6"/>',
    'chevron-down':  '<path d="M6 9l6 6 6-6"/>',
    'chevron-up':    '<path d="M6 15l6-6 6 6"/>',
    'arrow-left':    '<path d="M19 12H5M12 19l-7-7 7-7"/>',

    'search':  '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
    'close':   '<path d="M6 6l12 12M18 6L6 18"/>',
    'plus':    '<path d="M12 5v14M5 12h14"/>',
    'minus':   '<path d="M5 12h14"/>',
    'trash':   '<path d="M4 7h16M9 7V4h6v3M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"/>',
    'bag':     '<path d="M5 7h14l-1.5 11.5a2 2 0 0 1-2 1.5h-7a2 2 0 0 1-2-1.5z"/><path d="M9 7V5a3 3 0 0 1 6 0v2"/>',
    'user':    '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
    'home':    '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
    'catalog': '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>',
    'map-pin': '<path d="M12 22s-7-6-7-12a7 7 0 0 1 14 0c0 6-7 12-7 12z"/><circle cx="12" cy="10" r="3"/>',

    'moon':    '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
    'sun':     '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',

    'share':   '<path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/>',
    'filter':  '<path d="M4 7h16M7 12h10M10 17h4"/>',
    'clock':   '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/>',
    'snow':    '<path d="M12 2v20M3.3 7l17.4 10M20.7 7L3.3 17"/>',
    'leaf':    '<path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14z"/><path d="M5 19l7-7"/>',
    'heart':   '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>',
    'check':   '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    'phone':   '<path d="M4 5c0 10 5 15 15 15l1-4-5-2-2 3c-2-1-5-4-6-6l3-2-2-5z"/>',
    'receipt': '<path d="M6 4h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 9h6M9 13h4"/>',
    'map':     '<path d="M3 7l6-2 6 2 6-2v12l-6 2-6-2-6 2z"/><path d="M9 5v14M15 7v14"/>',
    'pencil':  '<path d="M4 20h4L20 8l-4-4L4 16z"/>',
    'logout':  '<path d="M9 20H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4"/><path d="M16 16l4-4-4-4M20 12H10"/>',
    'sparkles':'<path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5zM5 17l.75 2.25L8 20l-2.25.75L5 23l-.75-2.25L2 20l2.25-.75z"/>',
}

function iconHtml(): string {
    return PATHS[props.name] || ''
}
</script>

<template>
    <svg
        aria-hidden="true"
        :width="size" :height="size"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        :stroke-width="stroke"
        stroke-linecap="round"
        stroke-linejoin="round"
        v-html="iconHtml()"
    ></svg>
</template>
