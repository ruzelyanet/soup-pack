<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '@/stores/auth'
import { useUi } from '@/stores/ui'
import { useCart } from '@/stores/cart'
import { useCatalog } from '@/stores/catalog'
import { useToast } from 'primevue/usetoast'
import Icon from '@/components/Icon.vue'
import AddressPicker from '@/components/AddressPicker.vue'
import type { Order } from '@/types'

const auth = useAuth()
const ui = useUi()
const cart = useCart()
const catalog = useCatalog()
const router = useRouter()
const toast = useToast()

onMounted(() => {
    if (auth.isAuthed) auth.refreshOrders()
})

const avatar = computed(() => (auth.client?.fullName || 'A').trim()[0]?.toUpperCase())
const totalOrders = computed(() => auth.myOrders.length)

/** Самый частый продукт по заказам — для плашки «любимый суп». */
const favoriteName = computed<string>(() => {
    const map = new Map<string, number>()
    for (const o of auth.myOrders) {
        for (const it of o.items) {
            map.set(it.name, (map.get(it.name) ?? 0) + it.qty)
        }
    }
    let best: [string, number] | null = null
    for (const kv of map.entries()) {
        if (!best || kv[1] > best[1]) best = kv
    }
    return best?.[0] ?? '—'
})

const ACTIVE: Order['status'][] = ['new', 'accepted', 'in_progress']

/** Все активные заказы — у клиента их может быть несколько одновременно. */
const activeOrders = computed<Order[]>(() => {
    return auth.myOrders.filter((o) => ACTIVE.includes(o.status))
})
const historyOrders = computed<Order[]>(() => {
    return auth.myOrders.filter((o) => !ACTIVE.includes(o.status))
})

/** Шаг прогресса (1..4) по статусу: new=1, accepted=2, in_progress=3, done=4. */
function progressStep(s: Order['status']): number {
    switch (s) {
        case 'new':         return 1
        case 'accepted':    return 2
        case 'in_progress': return 3
        case 'done':        return 4
        default:            return 0
    }
}

/** Клиентские подписи: Создан / Принят / В пути / Доставлен / Отменён. */
const STATUS_LABEL: Record<string, string> = {
    new:         'Создан',
    accepted:    'Принят',
    in_progress: 'В пути',
    done:        'Доставлен',
    canceled:    'Отменён',
}

/** Короткая строка «Том-ям × 2, Паста × 1» для карточки заказа. */
function itemsSummary(o: Order): string {
    return o.items.map((i) => `${i.name} × ${i.qty}`).join(', ')
}

function fmt(v: number) {
    return new Intl.NumberFormat('ru-RU').format(v) + ' сум'
}

function shortDate(iso?: string) {
    if (!iso) return ''
    const d = new Date(iso)
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function shortTime(iso?: string) {
    if (!iso) return ''
    return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

/* ────── Повторить заказ ────── */
function repeat(o: Order) {
    let added = 0
    for (const line of o.items) {
        const p = catalog.products.find((pp) => pp.id === line.productId)
        if (p) {
            cart.addProduct(p, line.qty)
            added++
        }
    }
    if (added === 0) {
        toast.add({ severity: 'warn', summary: 'Товары больше не доступны', life: 2500 })
        return
    }
    toast.add({ severity: 'success', summary: 'Добавили в корзину', life: 1600 })
    router.push('/cart')
}

/* ────── Редактирование профиля ────── */
const editing = ref(false)
const edit = reactive({
    fullName: '',
    address: '',
    lat: undefined as number | undefined,
    lng: undefined as number | undefined,
})

function openEdit() {
    edit.fullName = auth.client?.fullName || ''
    edit.address = auth.client?.address || ''
    edit.lat = auth.client?.lat
    edit.lng = auth.client?.lng
    editing.value = true
}

async function saveEdit() {
    try {
        await auth.updateProfile({
            fullName: edit.fullName,
            address: edit.address || null,
            lat: edit.lat ?? null,
            lng: edit.lng ?? null,
        })
        editing.value = false
        toast.add({ severity: 'success', summary: 'Профиль обновлён', life: 1800 })
    } catch (e: any) {
        toast.add({ severity: 'error', summary: 'Не удалось сохранить', detail: e?.message, life: 3000 })
    }
}

/** Открыть AddressPicker в отдельном «sheet» для адреса (без имени). */
const addressEditing = ref(false)
const addressDraft = reactive({
    address: '',
    lat: undefined as number | undefined,
    lng: undefined as number | undefined,
})
function openAddressEdit() {
    addressDraft.address = auth.client?.address || ''
    addressDraft.lat = auth.client?.lat
    addressDraft.lng = auth.client?.lng
    addressEditing.value = true
}
async function saveAddress() {
    try {
        await auth.updateProfile({
            address: addressDraft.address || null,
            lat: addressDraft.lat ?? null,
            lng: addressDraft.lng ?? null,
        })
        addressEditing.value = false
        toast.add({ severity: 'success', summary: 'Адрес сохранён', life: 1600 })
    } catch (e: any) {
        toast.add({ severity: 'error', summary: 'Не удалось сохранить', detail: e?.message, life: 3000 })
    }
}

function askDelete() {
    if (!confirm('Удалить профиль? Это выйдет из аккаунта и очистит локальные данные. Заказы в системе останутся.')) return
    auth.logout()
    router.replace('/')
    toast.add({ severity: 'success', summary: 'Профиль очищен', life: 1800 })
}
</script>

<template>
    <section class="flex-1 flex flex-col">

        <!-- ───── Не авторизован ───── -->
        <template v-if="!auth.isAuthed">
            <header class="px-4 pt-4 pb-2 flex items-center gap-3">
                <h1 class="m-0 font-display font-black text-[26px] flex-1">Кабинет</h1>
                <button type="button" aria-label="Сменить тему" @click="ui.toggleTheme()"
                        class="size-11 rounded-full border border-ln2 bg-sf flex items-center justify-center">
                    <Icon :name="ui.theme === 'light' ? 'moon' : 'sun'" :size="20" />
                </button>
            </header>
            <div class="flex-1 flex flex-col items-center justify-center gap-5 px-6 text-center">
                <div class="size-24 rounded-full bg-sf flex items-center justify-center text-mut">
                    <Icon name="user" :size="42" :stroke="1.8" />
                </div>
                <h2 class="m-0 font-display font-black text-[22px]">Войдите, чтобы видеть свои заказы</h2>
                <p class="m-0 text-mut leading-snug">
                    По номеру телефона мы соберём историю, адреса и быстрые повторы.
                </p>
                <RouterLink to="/login"
                            class="h-[56px] px-7 rounded-[18px] bg-acc text-white font-extrabold text-[16px] flex items-center">
                    Войти по номеру
                </RouterLink>

                <!-- Информационные разделы и без логина -->
                <div class="w-full flex flex-col gap-2 pt-6">
                    <RouterLink to="/discounts"
                                class="h-[52px] rounded-[16px] bg-sf px-4 flex items-center gap-3 font-bold text-ink">
                        <Icon name="sparkles" :size="20" class="text-acct" />
                        <span class="flex-1 text-left">Скидки</span>
                        <Icon name="chevron-right" :size="18" :stroke="2.4" class="text-fnt" />
                    </RouterLink>
                    <RouterLink to="/delivery"
                                class="h-[52px] rounded-[16px] bg-sf px-4 flex items-center gap-3 font-bold text-ink">
                        <Icon name="map-pin" :size="20" class="text-acct" />
                        <span class="flex-1 text-left">Доставка и оплата</span>
                        <Icon name="chevron-right" :size="18" :stroke="2.4" class="text-fnt" />
                    </RouterLink>
                    <RouterLink to="/about"
                                class="h-[52px] rounded-[16px] bg-sf px-4 flex items-center gap-3 font-bold text-ink">
                        <Icon name="heart" :size="20" class="text-acct" />
                        <span class="flex-1 text-left">О нас</span>
                        <Icon name="chevron-right" :size="18" :stroke="2.4" class="text-fnt" />
                    </RouterLink>
                </div>
            </div>
        </template>

        <!-- ───── Авторизован ───── -->
        <template v-else>
            <!-- Простая шапка -->
            <header class="px-4 pt-4 pb-2 flex items-center gap-3">
                <RouterLink to="/" aria-label="В каталог"
                            class="size-11 rounded-full bg-sf flex items-center justify-center text-ink">
                    <Icon name="chevron-left" :size="20" :stroke="2.4" />
                </RouterLink>
                <h1 class="m-0 font-display font-black text-[24px] flex-1">Профиль</h1>
                <button type="button" aria-label="Сменить тему" @click="ui.toggleTheme()"
                        class="size-11 rounded-full bg-sf flex items-center justify-center text-ink">
                    <Icon :name="ui.theme === 'light' ? 'moon' : 'sun'" :size="20" />
                </button>
            </header>

            <!-- Карточка профиля -->
            <section class="px-4 pt-3">
                <div class="bg-sf rounded-[24px] p-4 flex items-center gap-3.5">
                    <span aria-hidden="true"
                          class="size-14 rounded-full bg-btr text-deep font-display font-black text-[24px] flex items-center justify-center">
                        {{ avatar }}
                    </span>
                    <div class="flex flex-col gap-0.5 min-w-0 flex-1">
                        <span class="font-extrabold text-[17px] text-ink truncate">
                            {{ auth.client?.fullName || 'Без имени' }}
                        </span>
                        <span class="font-bold text-[13px] text-mut">{{ auth.client?.phone }}</span>
                    </div>
                    <button type="button" aria-label="Редактировать профиль" @click="openEdit"
                            class="min-h-11 px-3 rounded-[14px] bg-sf2 text-ink font-bold text-[13px] flex items-center">
                        Изменить
                    </button>
                </div>
                <div class="mt-2 grid grid-cols-2 gap-2">
                    <div class="bg-sf rounded-[16px] px-3 py-2.5 flex flex-col gap-0.5">
                        <span class="font-display font-extrabold text-[18px] text-ink">{{ totalOrders }}</span>
                        <span class="text-[11px] font-bold text-mut">заказов</span>
                    </div>
                    <div class="bg-sf rounded-[16px] px-3 py-2.5 flex flex-col gap-0.5">
                        <span class="font-display font-extrabold text-[18px] text-ink truncate">{{ favoriteName }}</span>
                        <span class="text-[11px] font-bold text-mut">любимый суп</span>
                    </div>
                </div>
            </section>

            <!-- Мои адреса -->
            <section class="px-4 pt-[22px] flex flex-col gap-2">
                <h2 class="m-0 font-display font-extrabold text-[18px] -tracking-[.02em] px-1">Мои адреса</h2>

                <div v-if="auth.client?.address"
                     class="bg-sf rounded-[18px] px-4 py-3 flex items-center gap-3">
                    <Icon name="map-pin" :size="20" class="text-acct shrink-0" />
                    <div class="flex-1 min-w-0">
                        <span class="block font-bold text-[14px] text-ink truncate">{{ auth.client.address }}</span>
                        <span v-if="auth.client.lat != null && auth.client.lng != null"
                              class="inline-flex items-center gap-1 text-[11px] font-bold text-oks">
                            <span class="pi pi-check-circle text-[10px]"></span>
                            Точка сохранена
                        </span>
                    </div>
                    <button type="button" aria-label="Изменить адрес" @click="openAddressEdit"
                            class="size-9 rounded-full bg-sf2 flex items-center justify-center text-ink">
                        <Icon name="pencil" :size="14" />
                    </button>
                </div>

                <button type="button" @click="openAddressEdit"
                        class="h-[52px] rounded-[16px] bg-sf px-4 flex items-center gap-3 text-ink font-bold text-[14px] border-2 border-dashed border-ln2 hover:border-acc hover:text-acc transition">
                    <Icon name="plus" :size="18" :stroke="2.6" />
                    <span>{{ auth.client?.address ? 'Изменить адрес' : '+ Добавить адрес' }}</span>
                </button>
            </section>

            <!-- Текущие заказы (может быть несколько) -->
            <section v-if="activeOrders.length" class="px-4 pt-[22px] flex flex-col gap-3">
                <h2 class="m-0 font-display font-extrabold text-[20px] -tracking-[.02em]">
                    {{ activeOrders.length > 1 ? 'Текущие заказы' : 'Текущий заказ' }}
                </h2>
                <RouterLink v-for="co in activeOrders" :key="co.code" :to="`/order/${co.code}`"
                            class="bg-deep text-deepink rounded-[26px] p-[18px] flex flex-col gap-4 no-underline">
                    <div class="flex justify-between items-baseline gap-2">
                        <span class="font-extrabold text-[16px]">№ {{ co.code }}</span>
                        <span v-if="co.paymentStatus === 'paid' || co.paymentStatus === 'overpaid'"
                              class="rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider bg-btr text-ink">
                            Оплачен
                        </span>
                        <span class="text-[13px] text-deepmut ml-auto">
                            {{ shortDate(co.createdAt) }} · {{ shortTime(co.createdAt) }}
                        </span>
                    </div>
                    <ol aria-label="Статус заказа" class="m-0 p-0 list-none grid grid-cols-4 gap-1">
                        <li v-for="(label, idx) in ['Создан','Принят','В пути','Доставлен']" :key="label"
                            class="flex flex-col gap-2">
                            <span class="h-1.5 rounded-md"
                                  :class="progressStep(co.status) >= idx + 1
                                      ? 'bg-btr' : 'bg-deepink/20'"></span>
                            <span class="text-[11px] font-extrabold"
                                  :class="progressStep(co.status) >= idx + 1
                                      ? 'text-btr' : 'text-deepmut'">
                                {{ label }}
                            </span>
                        </li>
                    </ol>
                    <div class="flex items-center gap-2.5">
                        <span class="flex-1 text-[13px] text-deepmut truncate">
                            {{ itemsSummary(co) }}
                        </span>
                        <span class="font-extrabold text-[16px] text-btr">
                            {{ fmt(co.total) }}
                        </span>
                    </div>
                </RouterLink>
            </section>

            <!-- История заказов -->
            <section class="px-4 pt-[26px] flex flex-col gap-3">
                <h2 class="m-0 font-display font-extrabold text-[20px] -tracking-[.02em]">История заказов</h2>

                <div v-if="!historyOrders.length"
                     class="bg-sf rounded-[20px] p-6 text-center text-fnt">
                    Пока нет завершённых заказов.
                </div>

                <article v-for="o in historyOrders" :key="o.code"
                         class="bg-sf rounded-[24px] p-4 flex flex-col gap-3">
                    <div class="flex justify-between items-center">
                        <RouterLink :to="`/order/${o.code}`" class="flex flex-col gap-0.5 text-ink no-underline">
                            <span class="font-extrabold text-[15px]">№ {{ o.code }}</span>
                            <span class="text-[12px] text-fnt">{{ shortDate(o.createdAt) }}</span>
                        </RouterLink>
                        <div class="flex items-center gap-1.5">
                            <span v-if="o.paymentStatus === 'paid' || o.paymentStatus === 'overpaid'"
                                  class="font-extrabold text-[11px] px-2 py-1 rounded-full bg-ok-bg text-oks uppercase tracking-wider">
                                Оплачен
                            </span>
                            <span class="font-extrabold text-[12px] px-2.5 py-1.5 rounded-full"
                                  :class="o.status === 'done'
                                      ? 'bg-ok-bg text-ok'
                                      : o.status === 'canceled'
                                          ? 'bg-acc/15 text-acc'
                                          : 'bg-sf2 text-ink'">
                                {{ STATUS_LABEL[o.status || 'new'] }}
                            </span>
                        </div>
                    </div>

                    <span class="text-[14px] text-mut">{{ itemsSummary(o) }}</span>

                    <div v-if="o.status === 'canceled' && o.cancelReason"
                         class="bg-sf2 rounded-[14px] px-3 py-2.5 text-[13px] leading-snug text-mut">
                        <b class="text-ink">Причина отмены:</b> {{ o.cancelReason }}
                    </div>

                    <div class="flex items-center gap-2">
                        <span v-if="o.status === 'canceled'"
                              class="flex-1 font-extrabold text-[16px] text-fnt line-through">
                            {{ fmt(o.total) }}
                        </span>
                        <span v-else class="flex-1 font-extrabold text-[16px]">
                            {{ fmt(o.total) }}
                        </span>
                        <RouterLink v-if="o.status !== 'canceled'" :to="`/order/${o.code}`"
                                    class="min-h-11 px-3.5 rounded-[14px] border-[1.5px] border-ln2 text-ink font-bold text-[14px] flex items-center no-underline">
                            Чек
                        </RouterLink>
                        <button type="button" @click="repeat(o)"
                                class="min-h-11 px-3.5 rounded-[14px] font-extrabold text-[14px] flex items-center"
                                :class="o.status === 'canceled'
                                    ? 'border-[1.5px] border-ln2 text-ink'
                                    : 'bg-acc text-white'">
                            {{ o.status === 'canceled' ? 'Заказать снова' : 'Повторить' }}
                        </button>
                    </div>
                </article>
            </section>

            <!-- Настройки -->
            <section class="px-4 pt-[26px] flex flex-col gap-3">
                <h2 class="m-0 font-display font-extrabold text-[20px] -tracking-[.02em]">Настройки</h2>

                <div class="bg-sf rounded-[24px] overflow-hidden">
                    <!-- Адрес -->
                    <button type="button" @click="openEdit"
                            class="min-h-[60px] w-full px-4 py-3 flex items-center gap-3 text-left border-b border-ln">
                        <Icon name="map-pin" :size="22" class="text-acct" />
                        <span class="flex-1 flex flex-col min-w-0 gap-1">
                            <span class="font-extrabold text-[15px]">Адрес доставки</span>
                            <span class="text-[12px] text-fnt truncate">
                                {{ auth.client?.address || 'Не указан' }}
                            </span>
                            <span v-if="auth.client?.lat != null && auth.client?.lng != null"
                                  class="inline-flex items-center gap-1.5 self-start rounded-md bg-ok-bg text-ok text-[11px] font-bold px-2 py-0.5 leading-none">
                                <span class="pi pi-check-circle text-[11px]"></span>
                                Точка сохранена: {{ auth.client.lat.toFixed(5) }}, {{ auth.client.lng.toFixed(5) }}
                            </span>
                        </span>
                        <Icon name="chevron-right" :size="18" :stroke="2.4" class="text-fnt shrink-0" />
                    </button>

                    <!-- Тема -->
                    <div class="min-h-[60px] px-4 flex items-center gap-3">
                        <Icon name="moon" :size="22" class="text-acct" />
                        <span class="flex-1 font-extrabold text-[15px]">Тема</span>
                        <div role="radiogroup" aria-label="Тема" class="flex bg-sf2 rounded-[12px] p-[3px] gap-0.5">
                            <button type="button" role="radio" :aria-checked="ui.theme === 'light'"
                                    @click="ui.theme !== 'light' && ui.toggleTheme()"
                                    class="min-h-[38px] px-3 rounded-[10px] font-extrabold text-[12px] transition"
                                    :class="ui.theme === 'light' ? 'bg-ink text-bg' : 'bg-transparent text-ink'">
                                Светлая
                            </button>
                            <button type="button" role="radio" :aria-checked="ui.theme === 'dark'"
                                    @click="ui.theme !== 'dark' && ui.toggleTheme()"
                                    class="min-h-[38px] px-3 rounded-[10px] font-extrabold text-[12px] transition"
                                    :class="ui.theme === 'dark' ? 'bg-ink text-bg' : 'bg-transparent text-ink'">
                                Тёмная
                            </button>
                        </div>
                    </div>
                </div>
            </section>

            <!-- Информация -->
            <section class="px-4 pt-5 flex flex-col gap-2">
                <div class="text-[11px] font-extrabold uppercase tracking-wider text-fnt px-1 mb-1">
                    Информация
                </div>
                <RouterLink to="/discounts"
                            class="h-[52px] rounded-[16px] bg-sf px-4 flex items-center gap-3 font-bold text-ink">
                    <Icon name="sparkles" :size="20" class="text-acct" />
                    <span class="flex-1">Скидки</span>
                    <Icon name="chevron-right" :size="18" :stroke="2.4" class="text-fnt" />
                </RouterLink>
                <RouterLink to="/delivery"
                            class="h-[52px] rounded-[16px] bg-sf px-4 flex items-center gap-3 font-bold text-ink">
                    <Icon name="map-pin" :size="20" class="text-acct" />
                    <span class="flex-1">Доставка и оплата</span>
                    <Icon name="chevron-right" :size="18" :stroke="2.4" class="text-fnt" />
                </RouterLink>
                <RouterLink to="/about"
                            class="h-[52px] rounded-[16px] bg-sf px-4 flex items-center gap-3 font-bold text-ink">
                    <Icon name="heart" :size="20" class="text-acct" />
                    <span class="flex-1">О нас</span>
                    <Icon name="chevron-right" :size="18" :stroke="2.4" class="text-fnt" />
                </RouterLink>
            </section>

            <!-- Выйти + Удалить профиль -->
            <section class="px-4 pt-5 pb-6 flex flex-col gap-2">
                <button type="button" @click="auth.logout(); router.replace('/')"
                        class="h-[52px] rounded-[16px] bg-sf px-4 flex items-center justify-center gap-2 font-bold text-ink">
                    <Icon name="log-out" :size="18" />
                    Выйти
                </button>
                <button type="button" @click="askDelete"
                        class="h-[52px] rounded-[16px] bg-acc/10 px-4 flex items-center justify-center gap-2 font-bold text-acc">
                    <Icon name="trash" :size="18" />
                    Удалить профиль
                </button>
            </section>
        </template>

        <!-- Edit profile sheet -->
        <div v-if="editing" class="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center"
             @click.self="editing = false">
            <div class="w-full max-w-[500px] bg-bg rounded-t-[28px] sm:rounded-[28px] p-5 flex flex-col gap-4 max-h-[92vh] overflow-y-auto">
                <div class="flex items-center gap-3">
                    <h2 class="m-0 font-display font-black text-[22px] flex-1">Профиль</h2>
                    <button type="button" aria-label="Закрыть" @click="editing = false"
                            class="size-10 rounded-full bg-sf flex items-center justify-center">
                        <Icon name="close" :size="18" :stroke="2.4" />
                    </button>
                </div>

                <div class="flex flex-col gap-1.5">
                    <label class="text-[11px] font-bold uppercase tracking-wider text-fnt">Имя</label>
                    <input v-model="edit.fullName" type="text" placeholder="Ваше имя"
                           class="h-[52px] rounded-[16px] bg-sf px-4 font-semibold text-ink outline-none" />
                </div>

                <div class="flex flex-col gap-1.5">
                    <label class="text-[11px] font-bold uppercase tracking-wider text-fnt">Адрес доставки</label>
                    <AddressPicker v-model="edit.address" v-model:lat="edit.lat" v-model:lng="edit.lng" />
                </div>

                <button type="button" @click="saveEdit" :disabled="auth.loading"
                        class="h-[56px] rounded-[18px] bg-acc text-white font-extrabold text-[16px] disabled:opacity-60">
                    Сохранить
                </button>
            </div>
        </div>

        <!-- Address-only sheet -->
        <div v-if="addressEditing" class="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center"
             @click.self="addressEditing = false">
            <div class="w-full max-w-[500px] bg-bg rounded-t-[28px] sm:rounded-[28px] p-5 flex flex-col gap-4 max-h-[92vh] overflow-y-auto">
                <div class="flex items-center gap-3">
                    <h2 class="m-0 font-display font-black text-[22px] flex-1">Адрес доставки</h2>
                    <button type="button" aria-label="Закрыть" @click="addressEditing = false"
                            class="size-10 rounded-full bg-sf flex items-center justify-center">
                        <Icon name="close" :size="18" :stroke="2.4" />
                    </button>
                </div>
                <AddressPicker v-model="addressDraft.address"
                               v-model:lat="addressDraft.lat"
                               v-model:lng="addressDraft.lng" />
                <button type="button" @click="saveAddress" :disabled="auth.loading"
                        class="h-[56px] rounded-[18px] bg-acc text-white font-extrabold text-[16px] disabled:opacity-60">
                    Сохранить
                </button>
            </div>
        </div>
    </section>
</template>
