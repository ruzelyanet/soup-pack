import { createRouter, createWebHistory } from 'vue-router'
import AdminLayout from '@/layouts/AdminLayout.vue'
import { useAuth, type StaffRole } from '@/stores/auth'

type Meta = { roles?: StaffRole[] }

const router = createRouter({
    history: createWebHistory(),
    routes: [
        { path: '/login', name: 'login', component: () => import('@/pages/LoginPage.vue'), meta: { public: true } },
        {
            path: '/',
            component: AdminLayout,
            children: [
                { path: '',                   name: 'dashboard',     component: () => import('@/pages/Dashboard.vue'), meta: { roles: ['manager', 'duty'] } satisfies Meta },
                { path: 'banners',            name: 'banners',       component: () => import('@/pages/Banners.vue'), meta: { roles: ['manager'] } satisfies Meta },

                { path: 'catalog/categories', name: 'categories',    component: () => import('@/pages/catalog/Categories.vue'), meta: { roles: ['manager'] } satisfies Meta },
                { path: 'catalog/home-sections', name: 'home-sections', component: () => import('@/pages/catalog/HomeSections.vue'), meta: { roles: ['manager'] } satisfies Meta },
                { path: 'catalog/products',   name: 'products',      component: () => import('@/pages/catalog/Products.vue'), meta: { roles: ['manager'] } satisfies Meta },
                { path: 'catalog/products/:id', name: 'product',     component: () => import('@/pages/catalog/ProductEditor.vue'), meta: { roles: ['manager'] } satisfies Meta },
                { path: 'catalog/sets',       name: 'sets',          component: () => import('@/pages/constructor/OrderSets.vue'), meta: { roles: ['manager'] } satisfies Meta },

                { path: 'requests',           name: 'requests',      component: () => import('@/pages/requests/Board.vue'), meta: { roles: ['manager', 'duty'] } satisfies Meta },
                { path: 'requests/all',       name: 'requests-all',  component: () => import('@/pages/requests/AllRequests.vue'), meta: { roles: ['manager', 'duty'] } satisfies Meta },
                { path: 'requests/:id',       name: 'request',       component: () => import('@/pages/requests/RequestDetails.vue'), meta: { roles: ['manager', 'duty'] } satisfies Meta },

                { path: 'orders',             name: 'orders',        component: () => import('@/pages/orders/Orders.vue') },
                { path: 'orders/new',         name: 'order-new',     component: () => import('@/pages/orders/OrderCreatePage.vue'), meta: { roles: ['manager', 'duty'] } },
                { path: 'orders/:id(\\d+)',    name: 'order',         component: () => import('@/pages/orders/OrderPage.vue') },
                { path: 'orders/:id(\\d+)/edit', name: 'order-edit', component: () => import('@/pages/orders/OrderEditPage.vue'), meta: { roles: ['manager', 'duty'] } satisfies Meta },
                { path: 'transactions',       name: 'transactions',  component: () => import('@/pages/transactions/Transactions.vue'), meta: { roles: ['manager', 'duty', 'courier'] } satisfies Meta },
                { path: 'discounts',          name: 'discounts',       component: () => import('@/pages/discounts/List.vue'),   meta: { roles: ['manager'] } satisfies Meta },
                { path: 'discounts/new',      name: 'discount-new',    component: () => import('@/pages/discounts/Editor.vue'), meta: { roles: ['manager'] } satisfies Meta },
                { path: 'discounts/:id',      name: 'discount',        component: () => import('@/pages/discounts/Card.vue'),   meta: { roles: ['manager'] } satisfies Meta },
                { path: 'discounts/:id/edit', name: 'discount-edit',   component: () => import('@/pages/discounts/Editor.vue'), meta: { roles: ['manager'] } satisfies Meta },
                { path: 'promotions',         redirect: '/discounts' },
                { path: 'promotions/:id',     redirect: (to) => `/discounts/${to.params.id}` },

                { path: 'clients',            name: 'clients',       component: () => import('@/pages/clients/Clients.vue'), meta: { roles: ['manager', 'duty'] } satisfies Meta },

                { path: 'employees',          name: 'employees',     component: () => import('@/pages/employees/Employees.vue'), meta: { roles: ['manager'] } satisfies Meta },
                { path: 'employees/:id',      name: 'employee',      component: () => import('@/pages/employees/EmployeeEditor.vue'), meta: { roles: ['manager'] } satisfies Meta },

                { path: 'request-forms',       name: 'request-forms',  component: () => import('@/pages/request-forms/List.vue'),   meta: { roles: ['manager'] } satisfies Meta },
                { path: 'request-forms/:id',   name: 'request-form',   component: () => import('@/pages/request-forms/Editor.vue'), meta: { roles: ['manager'] } satisfies Meta },
                { path: 'settings/sla',        name: 'settings-sla',   component: () => import('@/pages/request-settings/Editor.vue'), meta: { roles: ['manager'] } satisfies Meta },
                { path: 'settings/contacts',   name: 'settings-contacts', component: () => import('@/pages/ShopContact.vue'), meta: { roles: ['manager'] } satisfies Meta },
            ],
        },
    ],
    scrollBehavior(to, from, savedPosition) {
        if (savedPosition) return savedPosition
        // Смена только query/hash на той же странице (например, ?open=<id>) — скролл не трогаем.
        if (from && to.path === from.path) return false
        return { top: 0 }
    },
})

router.beforeEach((to) => {
    const auth = useAuth()
    if (to.meta?.public) return true
    if (!auth.isAuthed) {
        return { name: 'login', query: { redirect: to.fullPath } }
    }
    const allowed = (to.meta?.roles as StaffRole[] | undefined) ?? null
    if (allowed && auth.role && !allowed.includes(auth.role)) {
        return { name: 'orders' }
    }
    return true
})

export default router
