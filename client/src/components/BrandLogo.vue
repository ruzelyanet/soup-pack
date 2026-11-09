<script setup lang="ts">
withDefaults(
    defineProps<{
        size?: number | string
        stroke?: number
    }>(),
    { size: 24, stroke: 2.4 },
)
</script>

<template>
    <svg
        :width="size"
        :height="size"
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="SOUP PUCK"
        role="img"
    >
        <path
            d="M7 22h34"
            stroke="currentColor"
            :stroke-width="stroke + 0.4"
            stroke-linecap="round"
        />
        <path
            d="M10 24a14 14 0 0 0 14 14h0a14 14 0 0 0 14-14H10z"
            fill="currentColor"
        />
        <path d="M17 18c0-3 3-3 3-6s-3-3-3-6" stroke="currentColor" :stroke-width="stroke" stroke-linecap="round" />
        <path d="M24 18c0-3 3-3 3-6s-3-3-3-6" stroke="currentColor" :stroke-width="stroke" stroke-linecap="round" />
        <path d="M31 18c0-3 3-3 3-6s-3-3-3-6" stroke="currentColor" :stroke-width="stroke" stroke-linecap="round" />
    </svg>
</template>
