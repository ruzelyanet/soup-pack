<script setup lang="ts">
const route = useRoute()
const hideBottom = computed(() => Boolean(route.meta?.hideBottom))
</script>

<template>
    <div class="min-h-full w-full max-w-[100vw] bg-bg text-ink flex justify-center overflow-x-clip">
        <div class="app-frame min-w-0 min-h-screen flex flex-col bg-bg overflow-x-clip">
            <main class="flex-1 flex flex-col min-w-0 overflow-x-clip">
                <slot />
            </main>
            <ClientOnly>
                <BottomBar v-if="!hideBottom" />
            </ClientOnly>
        </div>
    </div>
</template>
