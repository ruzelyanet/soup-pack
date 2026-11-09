<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '@/stores/auth'
import { useToast } from 'primevue/usetoast'
import Icon from '@/components/Icon.vue'

const auth = useAuth()
const router = useRouter()
const toast = useToast()

/** XX XXX XX XX из последних 9 цифр. */
function maskLocalPhone(raw: string): string {
    const d = raw.replace(/\D/g, '').slice(0, 9)
    const parts: string[] = []
    if (d.length >= 1) parts.push(d.slice(0, 2))
    if (d.length >= 3) parts.push(d.slice(2, 5))
    if (d.length >= 6) parts.push(d.slice(5, 7))
    if (d.length >= 8) parts.push(d.slice(7, 9))
    return parts.join(' ')
}

const phone = ref(maskLocalPhone((auth.client?.phone || '').replace(/^\+?998/, '')))
const loading = ref(false)

async function enter() {
    const digits = phone.value.replace(/\D/g, '')
    if (digits.length < 9) {
        toast.add({ severity: 'warn', summary: 'Введите 9 цифр номера', life: 2500 })
        return
    }
    loading.value = true
    try {
        await auth.signInByPhone(phone.value)
        router.replace('/account')
    } catch {
        toast.add({ severity: 'error', summary: 'Не удалось войти', life: 2500 })
    } finally {
        loading.value = false
    }
}
</script>

<template>
    <section class="flex-1 flex flex-col px-4 pt-6 safe-top">
        <button type="button" @click="router.back()" aria-label="Назад"
                class="size-11 rounded-full bg-sf flex items-center justify-center">
            <Icon name="chevron-left" :size="20" :stroke="2.4" />
        </button>

        <h1 class="mt-8 m-0 font-display font-black text-[28px] leading-tight">
            Вход по&nbsp;номеру телефона
        </h1>
        <p class="mt-3 m-0 text-mut leading-snug">
            Если вы уже заказывали — мы сразу покажем вашу карточку и&nbsp;историю заказов.
        </p>

        <div class="mt-6 flex flex-col gap-1.5">
            <label for="phoneInput" class="font-bold text-[13px] text-mut">Номер телефона</label>
            <div class="flex items-center h-14 rounded-2xl bg-sf px-3.5 gap-2.5 border-2 border-ln2">
                <span class="font-extrabold text-[16px] text-mut">+998</span>
                <input id="phoneInput" :value="phone" type="tel" inputmode="tel"
                       placeholder="90 000 00 00" autofocus autocomplete="tel-national"
                       @keyup.enter="enter"
                       @input="(e) => { phone = maskLocalPhone((e.target as HTMLInputElement).value); (e.target as HTMLInputElement).value = phone }"
                       class="flex-1 min-w-0 border-0 outline-none font-bold text-[16px] text-ink bg-transparent" />
            </div>
        </div>

        <div class="flex-1"></div>

        <button type="button" @click="enter"
                :disabled="phone.replace(/\D/g, '').length < 9 || loading"
                class="mb-6 h-[60px] rounded-[20px] bg-acc text-white font-extrabold text-[17px] disabled:opacity-50 flex items-center justify-center gap-2">
            <span v-if="loading" class="pi pi-spin pi-spinner text-xs"></span>
            {{ loading ? 'Входим…' : 'Войти' }}
        </button>
    </section>
</template>
