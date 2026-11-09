<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '@/services/api'
import PhoneInput from '@/components/PhoneInput.vue'

type FormFieldType = 'text' | 'textarea' | 'number' | 'select' | 'date' | 'checkbox' | 'address'
interface FormFieldSchema {
    key: string
    label: string
    type: FormFieldType
    required?: boolean
    options?: string[]
    placeholder?: string
    position?: number
}
interface PublicForm {
    slug: string
    type: 'individual' | 'shop'
    title: string
    description: string
    fields: FormFieldSchema[]
    successMessage: string
}

const route = useRoute()
const slug = String(route.params.slug || '')

const form = ref<PublicForm | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const submitted = ref<{ code: string } | null>(null)
const submitting = ref(false)

const values = reactive<Record<string, any>>({})
const name = ref('')
const phone = ref('')
const honeypot = ref('')  // не отображаем — ловит ботов

/** Генерим ключ один раз на монтирование — повторная отправка кнопки не создаёт дубля. */
const idempotencyKey = crypto.randomUUID()

async function load() {
    try {
        const res = await api.get(`/request-forms/public/${slug}`)
        form.value = res.data?.data as PublicForm
        // Инициализируем пустые значения.
        for (const f of form.value?.fields || []) {
            values[f.key] = f.type === 'checkbox' ? false : ''
        }
    } catch (e: any) {
        if (e?.response?.status === 404) error.value = 'Форма не найдена или отключена'
        else error.value = e?.message || 'Не удалось загрузить форму'
    } finally {
        loading.value = false
    }
}

async function submit() {
    error.value = null
    if (!name.value.trim() || !phone.value.trim()) {
        error.value = 'Укажите имя и телефон'
        return
    }
    submitting.value = true
    try {
        const payload = {
            name: name.value.trim(),
            phone: phone.value.trim(),
            fields: { ...values },
            _hp: honeypot.value,
            meta: {
                utm_source: new URLSearchParams(location.search).get('utm_source') || undefined,
                utm_medium: new URLSearchParams(location.search).get('utm_medium') || undefined,
                utm_campaign: new URLSearchParams(location.search).get('utm_campaign') || undefined,
                referrer: document.referrer || undefined,
            },
        }
        const res = await api.post(`/request-forms/${slug}/submit`, payload, {
            headers: { 'Idempotency-Key': idempotencyKey },
        })
        submitted.value = { code: res.data?.data?.code || 'OK' }
    } catch (e: any) {
        const status = e?.response?.status
        if (status === 400) {
            const errors = e?.response?.data?.error?.details?.errors
            if (errors) {
                error.value = 'Проверьте обязательные поля: ' + Object.keys(errors).join(', ')
            } else {
                error.value = e?.response?.data?.error?.message || 'Проверьте поля'
            }
        } else if (status === 429) {
            error.value = 'Слишком много попыток. Попробуйте позже.'
        } else {
            error.value = e?.response?.data?.error?.message || e?.message || 'Не удалось отправить'
        }
    } finally {
        submitting.value = false
    }
}

onMounted(load)
</script>

<template>
    <div class="min-h-screen bg-bg px-4 py-6 flex items-start justify-center">
        <div class="w-full max-w-md">
            <div v-if="loading" class="text-ink/60 text-sm">Загрузка…</div>

            <div v-else-if="error && !form" class="rounded-2xl bg-sf border border-ln p-6 text-ink">
                <div class="font-display font-extrabold text-lg">Ошибка</div>
                <div class="mt-2 text-sm">{{ error }}</div>
            </div>

            <div v-else-if="submitted" class="rounded-2xl bg-sf border border-ln p-6 text-ink text-center">
                <div class="mx-auto size-14 rounded-full bg-ok-bg text-ok flex items-center justify-center text-2xl">✓</div>
                <div class="mt-4 font-display font-extrabold text-xl">
                    {{ form?.successMessage || 'Спасибо! Мы свяжемся с вами.' }}
                </div>
                <div class="mt-2 text-xs text-fnt">Номер заявки: {{ submitted.code }}</div>
            </div>

            <form v-else-if="form" class="rounded-2xl bg-sf border border-ln p-6 space-y-4" @submit.prevent="submit">
                <div>
                    <h1 class="font-display font-extrabold text-2xl text-ink">{{ form.title || form.slug }}</h1>
                    <p v-if="form.description" class="mt-1 text-sm text-fnt">{{ form.description }}</p>
                </div>

                <div>
                    <label class="text-xs font-bold uppercase tracking-wider text-fnt">Имя *</label>
                    <input v-model="name"
                           class="mt-1 w-full rounded-xl border border-ln bg-sf px-4 py-3 text-ink focus:outline-none focus:border-acc" />
                </div>
                <div>
                    <label class="text-xs font-bold uppercase tracking-wider text-fnt">Телефон *</label>
                    <PhoneInput v-model="phone"
                                input-class="mt-1 w-full rounded-xl border border-ln bg-sf px-4 py-3 text-ink focus:outline-none focus:border-acc" />
                </div>

                <div v-for="f in form.fields" :key="f.key">
                    <label class="text-xs font-bold uppercase tracking-wider text-fnt">
                        {{ f.label }}<span v-if="f.required"> *</span>
                    </label>

                    <input v-if="f.type === 'text' || f.type === 'address'"
                           v-model="values[f.key]"
                           :placeholder="f.placeholder"
                           class="mt-1 w-full rounded-xl border border-ln bg-sf px-4 py-3 text-ink focus:outline-none focus:border-acc" />

                    <textarea v-else-if="f.type === 'textarea'"
                              v-model="values[f.key]" rows="3"
                              :placeholder="f.placeholder"
                              class="mt-1 w-full rounded-xl border border-ln bg-sf px-4 py-3 text-ink focus:outline-none focus:border-acc"></textarea>

                    <input v-else-if="f.type === 'number'" type="number" inputmode="numeric"
                           v-model="values[f.key]"
                           :placeholder="f.placeholder"
                           class="mt-1 w-full rounded-xl border border-ln bg-sf px-4 py-3 text-ink focus:outline-none focus:border-acc" />

                    <input v-else-if="f.type === 'date'" type="date"
                           v-model="values[f.key]"
                           class="mt-1 w-full rounded-xl border border-ln bg-sf px-4 py-3 text-ink focus:outline-none focus:border-acc" />

                    <select v-else-if="f.type === 'select'" v-model="values[f.key]"
                            class="mt-1 w-full rounded-xl border border-ln bg-sf px-4 py-3 text-ink focus:outline-none focus:border-acc">
                        <option value="">—</option>
                        <option v-for="opt in (f.options || [])" :key="opt" :value="opt">{{ opt }}</option>
                    </select>

                    <label v-else-if="f.type === 'checkbox'" class="mt-1 flex items-center gap-2 text-sm text-ink">
                        <input type="checkbox" v-model="values[f.key]" />
                        {{ f.placeholder || f.label }}
                    </label>
                </div>

                <!-- honeypot — поле прячем визуально, но оно есть в DOM -->
                <input v-model="honeypot" type="text" tabindex="-1" autocomplete="off"
                       class="absolute size-0 opacity-0 pointer-events-none"
                       aria-hidden="true" />

                <div v-if="error" class="rounded-xl bg-acc/10 text-acc text-sm px-3 py-2">{{ error }}</div>

                <button type="submit" :disabled="submitting"
                        class="w-full rounded-xl bg-acc text-white font-semibold py-3 disabled:opacity-60">
                    {{ submitting ? 'Отправка…' : 'Отправить заявку' }}
                </button>
            </form>
        </div>
    </div>
</template>
