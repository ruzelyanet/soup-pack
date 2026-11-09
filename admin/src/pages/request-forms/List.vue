<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import { useToast } from 'primevue/usetoast'
import AppTopbar from '@/components/AppTopbar.vue'
import { RequestForms } from '@/services/requestForms'
import type { RequestForm } from '@/services/resources'

const router = useRouter()
const toast = useToast()
const forms = ref<RequestForm[]>([])
const loading = ref(true)

async function load() {
    loading.value = true
    try {
        forms.value = await RequestForms.list()
    } catch (e: any) {
        toast.add({ severity: 'error', summary: 'Не удалось', detail: e?.message, life: 3000 })
    } finally {
        loading.value = false
    }
}

async function createEmpty() {
    try {
        const name = prompt('Название формы (пример: Сайт — магазины)')
        if (!name?.trim()) return
        const slug = prompt('Slug (латиницей, без пробелов):', name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''))
        if (!slug?.trim()) return
        const type = confirm('Магазины? (OK — да, Отмена — физлицо)') ? 'shop' : 'individual'
        const created = await RequestForms.create({
            name: name.trim(),
            slug: slug.trim(),
            type,
            isActive: true,
            fields: [],
        })
        router.push(`/request-forms/${created.id}`)
    } catch (e: any) {
        const code = e?.response?.data?.error?.message
        toast.add({
            severity: 'error',
            summary: 'Ошибка',
            detail: code === 'SLUG_TAKEN' ? 'Такой slug уже занят' : code || e?.message,
            life: 3000,
        })
    }
}

onMounted(load)
</script>

<template>
    <AppTopbar title="Формы заявок" subtitle="Публичные ссылки и серверные интеграции">
        <template #actions>
            <Button label="+ Форма" icon="pi pi-plus" @click="createEmpty" />
        </template>
    </AppTopbar>

    <div class="p-8 space-y-3">
        <div v-if="loading" class="text-ink-400">Загрузка…</div>
        <div v-else-if="!forms.length" class="text-ink-400 text-sm">
            Пока нет форм. Создайте первую — например, «Сайт — магазины».
        </div>
        <div v-else class="bg-white rounded-2xl overflow-hidden">
            <div v-for="f in forms" :key="f.id"
                 class="px-5 py-4 border-b border-ink-100 last:border-0 flex items-center gap-3 cursor-pointer hover:bg-ink-50 transition"
                 @click="router.push(`/request-forms/${f.id}`)">
                <div class="min-w-0 flex-1">
                    <div class="font-display font-bold truncate">{{ f.name }}</div>
                    <div class="text-xs text-ink-400 truncate">/f/{{ f.slug }} · {{ f.type === 'shop' ? 'Магазины' : 'Физлица' }}</div>
                </div>
                <span v-if="!f.isActive" class="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase bg-ink-100 text-ink-500">Выключена</span>
                <span v-if="f.requireApiKey" class="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase bg-saffron-300/80 text-ink-900">Только с ключом</span>
                <span v-if="f.apiKeySet" class="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase bg-olive-500/15 text-olive-500">Ключ выпущен</span>
                <i class="pi pi-chevron-right text-ink-400"></i>
            </div>
        </div>
    </div>
</template>
