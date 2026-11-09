<!-- Рамка «экран телефона» для встроенного превью клиента. -->
<script setup lang="ts">
import './preview-tokens.css'
defineProps<{ title?: string }>()
</script>

<template>
    <div class="mx-auto" style="width: 390px; max-width: 100%;">
        <div v-if="title" class="text-xs font-bold uppercase tracking-wider text-ink-400 mb-2 px-1">
            {{ title }}
        </div>
        <div class="client-preview rounded-[36px] overflow-hidden ring-1 ring-ink-200 shadow-xl p-4"
             style="padding: 16px;">
            <slot />
        </div>
    </div>
</template>
