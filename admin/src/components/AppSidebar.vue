<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import BrandLogo from '@/components/BrandLogo.vue'
import { useAuth, type StaffRole } from '@/stores/auth'
import { useRequestsFeed } from '@/stores/requestsFeed'
import { useOrdersFeed } from '@/stores/ordersFeed'
import { useNotifyPrefs, requestSystemPermission } from '@/services/notifyPrefs'

const auth = useAuth()
const router = useRouter()
const feed = useRequestsFeed()
const ordersFeed = useOrdersFeed()
const prefs = useNotifyPrefs()

const prefsOpen = ref(false)

function badge(n: number): string {
    if (!n) return ''
    return n > 9 ? '9+' : String(n)
}
const unseenBadge = computed(() => badge(feed.unseenCount))
const ordersBadge = computed(() => badge(ordersFeed.unseenCount))

async function toggleSystem() {
    if (prefs.value.system) { prefs.value.system = false; return }
    const perm = await requestSystemPermission()
    prefs.value.system = perm === 'granted'
}

const systemDenied = computed(() =>
    typeof window !== 'undefined'
    && 'Notification' in window
    && Notification.permission === 'denied',
)

type MenuItem = { to: string; icon: string; label: string; roles?: StaffRole[] }
type MenuGroup = { heading: string; items: MenuItem[] }

const ALL: MenuGroup[] = [
    {
        heading: 'Главное',
        items: [
            { to: '/',        icon: 'pi-chart-line', label: 'Статистика', roles: ['manager', 'duty'] },
            { to: '/banners', icon: 'pi-image',      label: 'Баннеры',    roles: ['manager'] },
        ],
    },
    {
        heading: 'Каталог',
        items: [
            { to: '/catalog/categories', icon: 'pi-tags',         label: 'Категории',            roles: ['manager'] },
            { to: '/catalog/products',   icon: 'pi-shopping-bag', label: 'Продукты',             roles: ['manager'] },
            { to: '/catalog/sets',       icon: 'pi-th-large',     label: 'Конструктор заказов',  roles: ['manager'] },
            { to: '/catalog/home-sections', icon: 'pi-th-large',  label: 'Секции главной',       roles: ['manager'] },
        ],
    },
    {
        heading: 'Продажи',
        items: [
            { to: '/requests',      icon: 'pi-inbox',      label: 'Заявки',        roles: ['manager', 'duty'] },
            { to: '/orders',        icon: 'pi-receipt',    label: 'Заказы' },
            { to: '/transactions',  icon: 'pi-wallet',     label: 'Транзакции' },
            { to: '/clients',       icon: 'pi-users',      label: 'Клиенты',       roles: ['manager', 'duty'] },
            { to: '/discounts',     icon: 'pi-percentage', label: 'Скидки',        roles: ['manager'] },
        ],
    },
    {
        heading: 'Персонал',
        items: [
            { to: '/employees', icon: 'pi-id-card', label: 'Сотрудники', roles: ['manager'] },
        ],
    },
    {
        heading: 'Настройки',
        items: [
            { to: '/request-forms',     icon: 'pi-file-edit', label: 'Формы заявок',    roles: ['manager'] },
            { to: '/settings/sla',      icon: 'pi-send',      label: 'SLA и Telegram',  roles: ['manager'] },
            { to: '/settings/contacts', icon: 'pi-phone',     label: 'Контакты магазина', roles: ['manager'] },
        ],
    },
]

const menu = computed<MenuGroup[]>(() => {
    const role = auth.role
    if (!role) return []
    return ALL
        .map((g) => ({
            ...g,
            items: g.items.filter((i) => !i.roles || i.roles.includes(role)),
        }))
        .filter((g) => g.items.length > 0)
})

const employeeName = computed(() => auth.employee?.fullName || 'Сотрудник')
const employeeInitials = computed(() => {
    const parts = (auth.employee?.fullName || '').trim().split(/\s+/).filter(Boolean)
    return (parts[0]?.[0] || '').toUpperCase() + (parts[1]?.[0] || '').toUpperCase() || '—'
})
const employeeRoleLabel = computed(() => {
    switch (auth.role) {
        case 'manager': return 'Главный'
        case 'duty':    return 'Оператор'
        case 'courier': return 'Курьер'
        default:        return ''
    }
})

function doLogout() {
    auth.logout()
    router.push({ name: 'login' })
}
</script>

<template>
    <aside class="w-64 bg-ink-900 text-cream-100 h-screen sticky top-0 flex flex-col">
        <div class="px-5 py-5 flex items-center gap-2.5 border-b border-ink-700">
            <BrandLogo :size="30" class="text-cream-50" />
            <div class="font-display font-extrabold tracking-tight text-lg leading-none">
                SOUP <span class="text-tomato-500">PUCK</span>
            </div>
            <span class="ml-auto text-[10px] font-bold uppercase tracking-wider text-cream-300/60">admin</span>
        </div>

        <nav class="flex-1 overflow-y-auto px-3 py-4 space-y-5">
            <div v-for="group in menu" :key="group.heading">
                <div class="px-3 text-[10px] font-bold uppercase tracking-wider text-cream-300/50 mb-2">
                    {{ group.heading }}
                </div>
                <ul class="space-y-1">
                    <li v-for="i in group.items" :key="i.to">
                        <RouterLink
                            :to="i.to"
                            class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-cream-100/80 hover:bg-ink-700 hover:text-cream-50 transition"
                            active-class="!bg-tomato-500 !text-cream-50"
                            exact-active-class="!bg-tomato-500 !text-cream-50"
                        >
                            <span :class="`pi ${i.icon} text-xs`"></span>
                            <span class="flex-1">{{ i.label }}</span>
                            <span v-if="i.to === '/requests' && unseenBadge"
                                  class="rounded-full bg-tomato-500 text-cream-50 text-[10px] font-bold px-1.5 min-w-[18px] text-center">
                                {{ unseenBadge }}
                            </span>
                            <span v-else-if="i.to === '/orders' && ordersBadge && (auth.role === 'manager' || auth.role === 'duty')"
                                  class="rounded-full bg-olive-500 text-cream-50 text-[10px] font-bold px-1.5 min-w-[18px] text-center">
                                {{ ordersBadge }}
                            </span>
                        </RouterLink>
                    </li>
                </ul>
            </div>
        </nav>

        <div v-if="auth.role === 'manager' || auth.role === 'duty'"
             class="border-t border-ink-700 px-4 py-2 text-xs text-cream-300/60 relative">
            <button class="flex items-center gap-2 w-full py-1.5 rounded-md hover:bg-ink-700 hover:text-cream-50 transition px-2 -mx-2"
                    type="button"
                    @click="prefsOpen = !prefsOpen">
                <span class="pi pi-bell text-xs"></span>
                <span>Уведомления</span>
                <span class="ml-auto text-[10px]"
                      :class="feed.status === 'open' ? 'text-olive-500' : feed.status === 'fallback' ? 'text-saffron-300' : 'text-ink-300'">
                    ●
                </span>
            </button>
            <div v-if="prefsOpen"
                 class="absolute left-3 right-3 bottom-full mb-2 bg-ink-800 text-cream-100 rounded-xl p-3 shadow-xl ring-1 ring-ink-700 space-y-2">
                <label class="flex items-center gap-2 cursor-pointer">
                    <input v-model="prefs.soundRequests" type="checkbox" class="accent-tomato-500" />
                    <span class="text-xs">Звук: новые заявки</span>
                </label>
                <label class="flex items-center gap-2 cursor-pointer">
                    <input v-model="prefs.soundOrders" type="checkbox" class="accent-olive-500" />
                    <span class="text-xs">Звук: новые заказы</span>
                </label>
                <label class="flex items-center gap-2 cursor-pointer">
                    <input :checked="prefs.system" type="checkbox" class="accent-tomato-500" @change="toggleSystem" />
                    <span class="text-xs">Уведомления браузера, когда вкладка свёрнута</span>
                </label>
                <div v-if="prefs.system && systemDenied"
                     class="text-[10px] text-saffron-300">
                    В браузере запрещены уведомления — измени разрешение в настройках сайта.
                </div>
            </div>
        </div>

        <div class="border-t border-ink-700 p-4 text-xs text-cream-300/60">
            <div class="flex items-center gap-2">
                <div class="size-7 rounded-full bg-ink-700 flex items-center justify-center">{{ employeeInitials }}</div>
                <div class="min-w-0 flex-1">
                    <div class="text-cream-50 font-medium leading-none truncate">{{ employeeName }}</div>
                    <div class="mt-0.5 truncate">{{ employeeRoleLabel }}</div>
                </div>
                <button class="rounded-md p-1.5 hover:bg-ink-700 text-cream-200/60 hover:text-cream-50 transition"
                        title="Выйти"
                        @click="doLogout">
                    <span class="pi pi-sign-out text-xs"></span>
                </button>
            </div>
        </div>
    </aside>
</template>
