<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import { useToast } from 'primevue/usetoast'
import AppTopbar from '@/components/AppTopbar.vue'
import { RequestForms } from '@/services/requestForms'
import type { FormFieldSchema, FormFieldType, RequestForm } from '@/services/resources'

const route = useRoute()
const router = useRouter()
const toast = useToast()

const id = Number(route.params.id)
const loading = ref(true)
const saving = ref(false)

const form = reactive<RequestForm>({
    id: 0,
    documentId: '',
    name: '',
    slug: '',
    type: 'individual',
    isActive: true,
    title: '',
    description: '',
    fields: [] as FormFieldSchema[],
    successMessage: '',
    sourceDetail: '',
    requireApiKey: false,
    apiKeySet: false,
})

const rotated = ref<string | null>(null)
const rotateDlg = ref(false)

const fieldTypes: Array<{ value: FormFieldType; label: string }> = [
    { value: 'text',     label: 'Короткий текст' },
    { value: 'textarea', label: 'Длинный текст' },
    { value: 'number',   label: 'Число' },
    { value: 'select',   label: 'Выбор из списка' },
    { value: 'date',     label: 'Дата' },
    { value: 'checkbox', label: 'Чек-бокс' },
    { value: 'address',  label: 'Адрес' },
]

const publicUrl = computed(() => {
    const clientBase = (import.meta.env.VITE_CLIENT_URL as string | undefined) || 'http://localhost:5173'
    return `${clientBase}/f/${form.slug}`
})

const curlExample = computed(() => {
    const apiBase = (import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:1337/api'
    const example = JSON.stringify({
        name: 'Алишер',
        phone: '+998 90 123 45 67',
        fields: form.fields.reduce<Record<string, unknown>>((acc, f) => {
            acc[f.key] = f.type === 'checkbox' ? true : (f.options?.[0] || `пример ${f.label}`)
            return acc
        }, {}),
        meta: { utm_source: 'instagram' },
    }, null, 2)
    return `curl -X POST ${apiBase}/request-forms/${form.slug}/submit \\
  -H "Content-Type: application/json" \\
${form.requireApiKey ? '  -H "X-Form-Key: <ключ_который_вы_только_что_получили>" \\\n' : ''}  -H "Idempotency-Key: $(uuidgen)" \\
  -d '${example}'`
})

async function load() {
    try {
        const f = await RequestForms.get(id)
        Object.assign(form, f)
        if (!Array.isArray(form.fields)) form.fields = []
    } catch (e: any) {
        toast.add({ severity: 'error', summary: 'Ошибка', detail: e?.message, life: 3000 })
        router.push('/request-forms')
    } finally {
        loading.value = false
    }
}

async function save() {
    saving.value = true
    try {
        // Нормализация позиций.
        form.fields = form.fields.map((f, i) => ({ ...f, position: i + 1 }))
        const next = await RequestForms.update(id, {
            name: form.name,
            slug: form.slug,
            type: form.type,
            isActive: form.isActive,
            title: form.title || null,
            description: form.description || null,
            fields: form.fields,
            successMessage: form.successMessage || null,
            sourceDetail: form.sourceDetail || null,
            requireApiKey: form.requireApiKey,
        })
        Object.assign(form, next)
        toast.add({ severity: 'success', summary: 'Сохранено', life: 1500 })
    } catch (e: any) {
        const code = e?.response?.data?.error?.message
        toast.add({
            severity: 'error',
            summary: 'Ошибка',
            detail: code === 'SLUG_TAKEN' ? 'Такой slug уже занят' : code || e?.message,
            life: 3000,
        })
    } finally {
        saving.value = false
    }
}

async function remove() {
    if (!confirm('Удалить форму? Старые заявки, созданные через неё, останутся.')) return
    try {
        await RequestForms.remove(id)
        router.push('/request-forms')
    } catch (e: any) {
        toast.add({ severity: 'error', summary: 'Ошибка', detail: e?.message, life: 3000 })
    }
}

async function rotateKey() {
    try {
        const plain = await RequestForms.rotateKey(id)
        rotated.value = plain
        rotateDlg.value = true
        form.apiKeySet = true
    } catch (e: any) {
        toast.add({ severity: 'error', summary: 'Ошибка', detail: e?.message, life: 3000 })
    }
}

function addField() {
    const n = form.fields.length + 1
    form.fields.push({
        key: `field_${n}`,
        label: `Поле ${n}`,
        type: 'text',
        required: false,
        position: n,
    })
}

function removeField(idx: number) {
    form.fields.splice(idx, 1)
}

function moveField(idx: number, delta: number) {
    const to = idx + delta
    if (to < 0 || to >= form.fields.length) return
    const [row] = form.fields.splice(idx, 1)
    form.fields.splice(to, 0, row)
}

function copyText(text: string) {
    navigator.clipboard?.writeText(text).then(() => {
        toast.add({ severity: 'success', summary: 'Скопировано', life: 1200 })
    })
}

onMounted(load)
</script>

<template>
    <AppTopbar :title="form.name || 'Форма'" :subtitle="`/f/${form.slug}`" back="/request-forms">
        <template #actions>
            <Button label="Удалить" severity="danger" outlined icon="pi pi-trash" @click="remove" />
            <Button :label="saving ? 'Сохранение…' : 'Сохранить'" :disabled="saving" icon="pi pi-check" @click="save" />
        </template>
    </AppTopbar>

    <div v-if="loading" class="p-8 text-ink-400">Загрузка…</div>

    <div v-else class="p-8 grid lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-6">
        <div class="space-y-6">
            <div class="bg-white rounded-2xl p-6 space-y-3">
                <div class="font-display font-bold">Основное</div>
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="text-xs font-bold uppercase tracking-wider text-ink-400">Название</label>
                        <input v-model="form.name" class="mt-1 w-full rounded-xl border border-ink-200 px-4 py-2.5 focus:outline-none focus:border-ink-900" />
                    </div>
                    <div>
                        <label class="text-xs font-bold uppercase tracking-wider text-ink-400">Slug</label>
                        <input v-model="form.slug" class="mt-1 w-full rounded-xl border border-ink-200 px-4 py-2.5 font-mono focus:outline-none focus:border-ink-900" />
                    </div>
                </div>
                <div>
                    <label class="text-xs font-bold uppercase tracking-wider text-ink-400">Тип создаваемых заявок</label>
                    <div class="mt-1 grid grid-cols-2 gap-2">
                        <button type="button"
                                class="rounded-xl py-2.5 text-sm font-semibold border transition"
                                :class="form.type === 'individual' ? 'bg-ink-900 text-cream-50 border-ink-900' : 'border-ink-200 hover:border-ink-400'"
                                @click="form.type = 'individual'">Физлицо</button>
                        <button type="button"
                                class="rounded-xl py-2.5 text-sm font-semibold border transition"
                                :class="form.type === 'shop' ? 'bg-ink-900 text-cream-50 border-ink-900' : 'border-ink-200 hover:border-ink-400'"
                                @click="form.type = 'shop'">Магазин</button>
                    </div>
                </div>
                <label class="flex items-center gap-2 text-sm">
                    <input v-model="form.isActive" type="checkbox" />
                    Активна (неактивная форма возвращает 404)
                </label>
                <label class="flex items-center gap-2 text-sm">
                    <input v-model="form.requireApiKey" type="checkbox" />
                    Принимать только серверные запросы с ключом
                </label>
                <div>
                    <label class="text-xs font-bold uppercase tracking-wider text-ink-400">Источник (по умолчанию)</label>
                    <input v-model="form.sourceDetail" placeholder="instagram / site / tilda / …"
                           class="mt-1 w-full rounded-xl border border-ink-200 px-4 py-2.5 focus:outline-none focus:border-ink-900" />
                </div>
            </div>

            <div class="bg-white rounded-2xl p-6 space-y-3">
                <div class="font-display font-bold">Публичная страница</div>
                <div>
                    <label class="text-xs font-bold uppercase tracking-wider text-ink-400">Заголовок</label>
                    <input v-model="form.title" class="mt-1 w-full rounded-xl border border-ink-200 px-4 py-2.5 focus:outline-none focus:border-ink-900" />
                </div>
                <div>
                    <label class="text-xs font-bold uppercase tracking-wider text-ink-400">Описание</label>
                    <textarea v-model="form.description" rows="2" class="mt-1 w-full rounded-xl border border-ink-200 px-4 py-2.5 focus:outline-none focus:border-ink-900"></textarea>
                </div>
                <div>
                    <label class="text-xs font-bold uppercase tracking-wider text-ink-400">Сообщение после отправки</label>
                    <textarea v-model="form.successMessage" rows="2" placeholder="Спасибо! Мы перезвоним."
                              class="mt-1 w-full rounded-xl border border-ink-200 px-4 py-2.5 focus:outline-none focus:border-ink-900"></textarea>
                </div>
            </div>

            <div class="bg-white rounded-2xl p-6">
                <div class="flex items-center mb-3">
                    <div class="font-display font-bold">Поля формы</div>
                    <div class="ml-auto text-xs text-ink-400">name и phone уже обязательны и не настраиваются</div>
                </div>
                <div v-if="!form.fields.length" class="text-sm text-ink-400 py-2">Пока нет дополнительных полей</div>
                <div class="space-y-3">
                    <div v-for="(f, idx) in form.fields" :key="idx" class="rounded-xl border border-ink-100 p-3 space-y-2">
                        <div class="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] gap-2 items-end">
                            <div>
                                <label class="text-[10px] font-bold uppercase tracking-wider text-ink-400">Label</label>
                                <input v-model="f.label" class="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm focus:outline-none focus:border-ink-900" />
                            </div>
                            <div>
                                <label class="text-[10px] font-bold uppercase tracking-wider text-ink-400">Key (латиницей)</label>
                                <input v-model="f.key" class="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm font-mono focus:outline-none focus:border-ink-900" />
                            </div>
                            <div class="flex items-center gap-1 h-full">
                                <button type="button" class="rounded-md px-2 py-2 text-xs border border-ink-200 hover:bg-ink-50" @click="moveField(idx, -1)">↑</button>
                                <button type="button" class="rounded-md px-2 py-2 text-xs border border-ink-200 hover:bg-ink-50" @click="moveField(idx, 1)">↓</button>
                                <button type="button" class="rounded-md px-2 py-2 text-xs border border-tomato-500 text-tomato-500 hover:bg-tomato-500/10" @click="removeField(idx)">✕</button>
                            </div>
                        </div>
                        <div class="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 items-end">
                            <div>
                                <label class="text-[10px] font-bold uppercase tracking-wider text-ink-400">Тип</label>
                                <select v-model="f.type" class="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm bg-white focus:outline-none focus:border-ink-900">
                                    <option v-for="t in fieldTypes" :key="t.value" :value="t.value">{{ t.label }}</option>
                                </select>
                            </div>
                            <div>
                                <label class="text-[10px] font-bold uppercase tracking-wider text-ink-400">Placeholder</label>
                                <input v-model="f.placeholder" class="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm focus:outline-none focus:border-ink-900" />
                            </div>
                            <label class="text-sm flex items-center gap-2 pb-2">
                                <input v-model="f.required" type="checkbox" />
                                Обязательное
                            </label>
                        </div>
                        <div v-if="f.type === 'select'">
                            <label class="text-[10px] font-bold uppercase tracking-wider text-ink-400">Варианты (через запятую)</label>
                            <input :value="(f.options || []).join(', ')"
                                   placeholder="Юнусабад, Чиланзар, Мирабад"
                                   class="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm focus:outline-none focus:border-ink-900"
                                   @input="(e) => f.options = String((e.target as HTMLInputElement).value).split(',').map(s => s.trim()).filter(Boolean)" />
                        </div>
                    </div>
                </div>
                <Button label="+ Поле" icon="pi pi-plus" severity="secondary" outlined class="mt-3" @click="addField" />
            </div>
        </div>

        <div class="space-y-6">
            <div class="bg-white rounded-2xl p-6 space-y-3">
                <div class="font-display font-bold">Подключение</div>
                <div>
                    <div class="text-xs font-bold uppercase tracking-wider text-ink-400 mb-1">Публичная ссылка</div>
                    <div class="flex gap-2">
                        <input :value="publicUrl" readonly class="flex-1 rounded-lg border border-ink-200 px-3 py-2 text-xs font-mono bg-ink-50" />
                        <Button icon="pi pi-copy" severity="secondary" outlined @click="copyText(publicUrl)" />
                    </div>
                    <div v-if="form.requireApiKey" class="mt-1 text-xs text-saffron-300">
                        Форма закрыта для публичной страницы — только серверные вызовы с X-Form-Key.
                    </div>
                </div>

                <div>
                    <div class="text-xs font-bold uppercase tracking-wider text-ink-400 mb-1">Пример curl</div>
                    <pre class="bg-ink-900 text-cream-50 rounded-xl p-3 text-[11px] leading-relaxed overflow-x-auto whitespace-pre">{{ curlExample }}</pre>
                    <Button label="Скопировать" icon="pi pi-copy" severity="secondary" outlined class="mt-2 w-full" @click="copyText(curlExample)" />
                </div>

                <div>
                    <div class="text-xs font-bold uppercase tracking-wider text-ink-400 mb-1">API-ключ</div>
                    <div class="text-xs text-ink-500">
                        {{ form.apiKeySet ? 'Ключ выпущен и хранится в виде хэша. Увидеть его можно только один раз при выпуске.' : 'Ключ ещё не выпущен.' }}
                    </div>
                    <Button :label="form.apiKeySet ? 'Сгенерировать новый' : 'Выпустить ключ'"
                            icon="pi pi-key" severity="secondary" outlined class="mt-2 w-full" @click="rotateKey" />
                </div>
            </div>
        </div>
    </div>

    <Dialog v-model:visible="rotateDlg" modal header="Новый API-ключ" :style="{ width: '480px' }" dismissable-mask>
        <div class="space-y-3">
            <p class="text-sm text-ink-500">
                Скопируйте ключ прямо сейчас. После закрытия окна его нельзя будет посмотреть снова — в БД хранится только хэш.
            </p>
            <div class="bg-ink-900 text-cream-50 rounded-xl p-3 text-sm font-mono break-all">{{ rotated }}</div>
            <Button label="Скопировать" icon="pi pi-copy" @click="rotated && copyText(rotated)" />
        </div>
        <template #footer>
            <Button label="Закрыть" severity="secondary" outlined @click="rotateDlg = false" />
        </template>
    </Dialog>
</template>
