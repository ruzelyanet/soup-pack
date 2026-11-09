<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import Button from 'primevue/button'
import { useToast } from 'primevue/usetoast'
import AppTopbar from '@/components/AppTopbar.vue'
import { Settings } from '@/services/settings'
import type { RequestSetting } from '@/services/resources'

const toast = useToast()
const loading = ref(true)
const saving = ref(false)
const testing = ref(false)
const tokenAlreadySet = ref(false)
const shopBot = ref<RequestSetting['shopBot'] | null>(null)

const form = reactive({
    yellowAfterMin: 10,
    redAfterMin: 30,
    telegramEnabled: false,
    telegramChatIds: '',
    telegramBotToken: '',
    overdueCheckEnabled: false,
    shopBotEnabled: false,
    shopBotGreeting: '',
})

async function load() {
    try {
        const s = await Settings.getRequestSettings()
        form.yellowAfterMin = s.yellowAfterMin ?? 10
        form.redAfterMin = s.redAfterMin ?? 30
        form.telegramEnabled = Boolean(s.telegramEnabled)
        form.telegramChatIds = s.telegramChatIds || ''
        form.overdueCheckEnabled = Boolean(s.overdueCheckEnabled)
        form.shopBotEnabled = s.shopBotEnabled !== false
        form.shopBotGreeting = s.shopBotGreeting || ''
        shopBot.value = s.shopBot ?? null
        tokenAlreadySet.value = Boolean(s.telegramBotTokenSet)
        form.telegramBotToken = ''
    } catch (e: any) {
        toast.add({ severity: 'error', summary: 'Ошибка', detail: e?.message, life: 3000 })
    } finally {
        loading.value = false
    }
}

async function save() {
    if (form.redAfterMin <= form.yellowAfterMin) {
        toast.add({ severity: 'warn', summary: 'Красный порог должен быть больше жёлтого', life: 2500 })
        return
    }
    saving.value = true
    try {
        const patch: Record<string, any> = {
            yellowAfterMin: form.yellowAfterMin,
            redAfterMin: form.redAfterMin,
            telegramEnabled: form.telegramEnabled,
            telegramChatIds: form.telegramChatIds || null,
            overdueCheckEnabled: form.overdueCheckEnabled,
            shopBotEnabled: form.shopBotEnabled,
            shopBotGreeting: form.shopBotGreeting.trim() || null,
        }
        if (form.telegramBotToken.trim()) {
            patch.telegramBotToken = form.telegramBotToken.trim()
        }
        await Settings.updateRequestSettings(patch)
        toast.add({ severity: 'success', summary: 'Сохранено', life: 1500 })
        await load()
    } catch (e: any) {
        toast.add({ severity: 'error', summary: 'Ошибка', detail: e?.response?.data?.error?.message || e?.message, life: 3000 })
    } finally {
        saving.value = false
    }
}

async function testTelegram() {
    testing.value = true
    try {
        const r = await Settings.testTelegram()
        if (r.ok) {
            toast.add({ severity: 'success', summary: 'Отправлено — проверь Telegram', life: 2500 })
        } else {
            toast.add({
                severity: 'error', summary: 'Telegram вернул ошибку',
                detail: r.errors.join('\n').slice(0, 600) || 'без текста', life: 8000,
            })
        }
    } catch (e: any) {
        toast.add({
            severity: 'error', summary: 'Ошибка',
            detail: e?.response?.data?.error?.message || e?.message, life: 4000,
        })
    } finally {
        testing.value = false
    }
}

const shopBotLine = computed(() => {
    const b = shopBot.value
    if (!b) return null
    if (b.state === 'running') return { tone: 'ok', text: `Работает · @${b.username}`, link: b.username ? `https://t.me/${b.username}` : null }
    if (b.state === 'starting') return { tone: 'wait', text: 'Запускается…', link: null }
    if (b.state === 'error') return { tone: 'err', text: b.error || 'Ошибка', link: null }
    if (b.reason === 'no_token') return { tone: 'off', text: 'Выключен — не указан Bot token', link: null }
    if (b.reason === 'env_disabled') return { tone: 'off', text: 'Запрещён на этом сервере (TELEGRAM_SHOP_BOT_ENABLED=false)', link: null }
    return { tone: 'off', text: 'Выключен', link: null }
})

onMounted(load)
</script>

<template>
    <AppTopbar title="SLA и Telegram" subtitle="Пороги таймера, уведомления о заявках и магазин в Telegram">
        <template #actions>
            <Button :label="saving ? 'Сохранение…' : 'Сохранить'" :disabled="saving" icon="pi pi-check" @click="save" />
        </template>
    </AppTopbar>

    <div v-if="loading" class="p-8 text-ink-400">Загрузка…</div>

    <div v-else class="p-8 grid lg:grid-cols-2 gap-6">
        <div class="bg-white rounded-2xl p-6 space-y-4">
            <div class="font-display font-bold">SLA — таймер ожидания</div>
            <p class="text-sm text-ink-500">
                Карточки в колонке «Новые заявки» подсвечиваются жёлтым после жёлтого порога и красным — после красного.
            </p>
            <div class="grid grid-cols-2 gap-4">
                <div>
                    <label class="text-xs font-bold uppercase tracking-wider text-ink-400">Жёлтый порог, мин</label>
                    <input v-model.number="form.yellowAfterMin" type="number" min="1"
                           class="mt-1 w-full rounded-xl border border-ink-200 px-4 py-2.5 focus:outline-none focus:border-ink-900" />
                </div>
                <div>
                    <label class="text-xs font-bold uppercase tracking-wider text-ink-400">Красный порог, мин</label>
                    <input v-model.number="form.redAfterMin" type="number" min="2"
                           class="mt-1 w-full rounded-xl border border-ink-200 px-4 py-2.5 focus:outline-none focus:border-ink-900" />
                </div>
            </div>
        </div>

        <div class="bg-white rounded-2xl p-6 space-y-4">
            <div class="font-display font-bold">Telegram</div>
            <p class="text-sm text-ink-500">
                Токен бота получается у <code>@BotFather</code>. ID чатов — через <code>@userinfobot</code>; несколько — через запятую или с новой строки.
            </p>

            <label class="flex items-center gap-2 text-sm">
                <input v-model="form.telegramEnabled" type="checkbox" />
                Отправлять уведомления о новых заявках
            </label>

            <label class="flex items-center gap-2 text-sm">
                <input v-model="form.overdueCheckEnabled" type="checkbox" />
                Отправлять уведомления о просроченных (ждёт &gt; красного порога)
            </label>

            <div>
                <label class="text-xs font-bold uppercase tracking-wider text-ink-400">
                    Bot token
                    <span v-if="tokenAlreadySet" class="ml-2 text-olive-500">установлен ·</span>
                    <span v-if="tokenAlreadySet" class="text-ink-400 normal-case font-normal">оставьте пустым, чтобы не менять</span>
                </label>
                <input v-model="form.telegramBotToken" type="password" :placeholder="tokenAlreadySet ? '••••••••••' : 'bot token от @BotFather'"
                       class="mt-1 w-full rounded-xl border border-ink-200 px-4 py-2.5 font-mono focus:outline-none focus:border-ink-900" />
            </div>

            <div>
                <label class="text-xs font-bold uppercase tracking-wider text-ink-400">Chat IDs</label>
                <textarea v-model="form.telegramChatIds" rows="3" placeholder="123456789, -1001234567890"
                          class="mt-1 w-full rounded-xl border border-ink-200 px-4 py-2.5 font-mono text-sm focus:outline-none focus:border-ink-900"></textarea>
            </div>

            <div class="flex items-center gap-3 pt-1">
                <Button :label="testing ? 'Отправка…' : 'Отправить тест'" :disabled="testing || !tokenAlreadySet"
                        icon="pi pi-send" severity="secondary" outlined @click="testTelegram" />
                <span class="text-xs text-ink-400">
                    Сначала сохраните изменения — тест использует значения из базы.
                </span>
            </div>
        </div>

        <div class="bg-white rounded-2xl p-6 space-y-4 lg:col-span-2">
            <div class="font-display font-bold">Магазин в Telegram</div>
            <p class="text-sm text-ink-500">
                Клиенты открывают этого же бота, смотрят каталог, собирают корзину и оформляют доставку.
                Используется <b>Bot token</b> из карточки «Telegram» выше — отдельный бот не нужен.
                Заказы появляются в «Заказах» с пометкой «через Telegram».
            </p>

            <label class="flex items-center gap-2 text-sm">
                <input v-model="form.shopBotEnabled" type="checkbox" />
                Включить магазин в боте для клиентов
            </label>

            <div>
                <label class="text-xs font-bold uppercase tracking-wider text-ink-400">Приветствие на первом экране</label>
                <textarea v-model="form.shopBotGreeting" rows="3" maxlength="2000"
                          placeholder="Здравствуйте! 👋 Это SOUP PUCK — натуральные супы в формате шайбы 350 г. Здесь можно посмотреть каталог и оформить доставку."
                          class="mt-1 w-full rounded-xl border border-ink-200 px-4 py-2.5 text-sm focus:outline-none focus:border-ink-900"></textarea>
                <div class="mt-1 text-xs text-ink-400">
                    Под приветствием бот сам добавит телефон и часы работы из «Контактов магазина» и кнопки категорий.
                </div>
            </div>

            <div v-if="shopBotLine" class="flex items-center gap-2 text-sm">
                <span class="inline-block w-2 h-2 rounded-full"
                      :class="{
                          'bg-olive-500': shopBotLine.tone === 'ok',
                          'bg-saffron-300': shopBotLine.tone === 'wait',
                          'bg-tomato-500': shopBotLine.tone === 'err',
                          'bg-ink-200': shopBotLine.tone === 'off',
                      }"></span>
                <a v-if="shopBotLine.link" :href="shopBotLine.link" target="_blank" class="underline">{{ shopBotLine.text }}</a>
                <span v-else :class="shopBotLine.tone === 'err' ? 'text-tomato-500' : 'text-ink-500'">{{ shopBotLine.text }}</span>
            </div>
        </div>
    </div>
</template>
