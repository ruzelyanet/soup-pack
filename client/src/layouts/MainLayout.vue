<script setup lang="ts">
import { RouterView, useRoute } from 'vue-router'
import BottomBar from '@/components/BottomBar.vue'
import { computed } from 'vue'

const route = useRoute()
const hideBottom = computed(() => Boolean(route.meta?.hideBottom))
</script>

<template>
    <div class="min-h-full w-full max-w-[100vw] bg-bg text-ink flex justify-center overflow-x-clip">
        <!-- Mobile-first каркас: width = min(100%, 500px) из .app-frame в style.css. -->
        <div class="app-frame min-w-0 min-h-screen flex flex-col bg-bg overflow-x-clip">
            <main class="flex-1 flex flex-col min-w-0 overflow-x-clip">
                <RouterView />
            </main>
            <BottomBar v-if="!hideBottom" />
        </div>
    </div>
</template>
