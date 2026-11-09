<script setup lang="ts">
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import BrandLogo from '@/components/BrandLogo.vue'
import { api } from '@/services/api'
import { useAuth } from '@/stores/auth'

const router = useRouter()
const route = useRoute()
const auth = useAuth()

const phone = ref('')
const personalKey = ref('')
const loading = ref(false)
const error = ref<string | null>(null)

async function enter() {
    error.value = null
    if (!phone.value.trim() || !personalKey.value.trim()) {
        error.value = 'Введите телефон и персональный ключ'
        return
    }
    loading.value = true
    try {
        const res = await api.post('/staff/sign-in', {
            phone: phone.value,
            personalKey: personalKey.value,
        })
        const { token, employee } = res.data?.data || {}
        if (!token || !employee) throw new Error('Пустой ответ сервера')
        auth.setSession(token, employee)
        const to = (route.query.redirect as string) || '/'
        router.push(to)
    } catch (e: any) {
        const code = e?.response?.data?.error?.message
        if (code === 'INVALID_CREDENTIALS') {
            error.value = 'Неверный телефон или ключ'
        } else if (e?.response?.status === 400) {
            error.value = 'Проверьте формат телефона'
        } else {
            error.value = e?.message || 'Не удалось войти'
        }
    } finally {
        loading.value = false
    }
}
</script>

<template>
    <div class="min-h-screen flex items-center justify-center bg-ink-900 text-cream-50 px-4">
        <form class="bg-ink-800 rounded-3xl p-8 w-full max-w-md border border-ink-700" @submit.prevent="enter">
            <div class="flex items-center gap-2.5 mb-6">
                <BrandLogo :size="36" class="text-tomato-500" />
                <div class="font-display font-extrabold text-xl">SOUP <span class="text-tomato-500">PUCK</span></div>
                <span class="ml-auto text-[10px] font-bold uppercase tracking-wider text-cream-300/60">admin</span>
            </div>
            <h1 class="font-display font-extrabold text-2xl">Вход в админку</h1>
            <p class="text-sm text-cream-200/70 mt-1">По телефону и персональному ключу сотрудника.</p>

            <label class="block mt-5 text-xs font-bold uppercase tracking-wider text-cream-200/70">Телефон</label>
            <input v-model="phone" placeholder="+998 __ ___ __ __" autocomplete="username"
                   class="mt-1 w-full rounded-xl bg-ink-700 border border-ink-600 px-4 py-3 focus:outline-none focus:border-tomato-500" />

            <label class="block mt-4 text-xs font-bold uppercase tracking-wider text-cream-200/70">Персональный ключ</label>
            <input v-model="personalKey" type="password" autocomplete="current-password"
                   class="mt-1 w-full rounded-xl bg-ink-700 border border-ink-600 px-4 py-3 focus:outline-none focus:border-tomato-500" />

            <div v-if="error" class="mt-3 text-sm text-tomato-400">{{ error }}</div>

            <button type="submit" :disabled="loading"
                    class="mt-6 w-full rounded-xl bg-tomato-500 hover:bg-tomato-600 py-3 font-semibold disabled:opacity-60">
                {{ loading ? 'Входим…' : 'Войти' }}
            </button>
        </form>
    </div>
</template>
