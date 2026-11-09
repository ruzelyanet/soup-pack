<script setup lang="ts">
import { onMounted, onBeforeUnmount } from 'vue'
import { RouterView } from 'vue-router'
import AppSidebar from '@/components/AppSidebar.vue'
import { useRequestsFeed } from '@/stores/requestsFeed'
import { useOrdersFeed } from '@/stores/ordersFeed'

const requestsFeed = useRequestsFeed()
const ordersFeed = useOrdersFeed()
onMounted(() => { requestsFeed.start(); ordersFeed.start() })
onBeforeUnmount(() => { requestsFeed.stop(); ordersFeed.stop() })
</script>

<template>
    <div class="min-h-screen flex bg-ink-50">
        <AppSidebar />
        <div class="flex-1 min-w-0 flex flex-col">
            <RouterView />
        </div>
    </div>
</template>
