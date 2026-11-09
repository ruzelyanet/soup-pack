import { createRouter, createWebHistory } from 'vue-router'
import MainLayout from '@/layouts/MainLayout.vue'

const router = createRouter({
    history: createWebHistory(),
    routes: [
        {
            path: '/',
            component: MainLayout,
            children: [
                { path: '',               name: 'home',     component: () => import('@/pages/HomePage.vue') },
                { path: 'search',         name: 'search',   component: () => import('@/pages/SearchPage.vue') },
                { path: 'product/:slug',  name: 'product',  component: () => import('@/pages/ProductPage.vue'), meta: { hideBottom: true } },
                { path: 'category/:slug', name: 'category', component: () => import('@/pages/CategoryPage.vue') },
                { path: 'sets',           name: 'sets',     component: () => import('@/pages/SetsPage.vue') },
                { path: 'set/:slug',      name: 'set',      component: () => import('@/pages/SetPage.vue') },
                { path: 'cart',           name: 'cart',     component: () => import('@/pages/CartPage.vue') },
                { path: 'checkout',       name: 'checkout', component: () => import('@/pages/CheckoutPage.vue'), meta: { hideBottom: true } },
                { path: 'success/:code',  name: 'success',  component: () => import('@/pages/SuccessPage.vue'),  meta: { hideBottom: true } },
                { path: 'account',        name: 'account',  component: () => import('@/pages/AccountPage.vue') },
                { path: 'login',          name: 'login',    component: () => import('@/pages/LoginPage.vue'),    meta: { hideBottom: true } },
                { path: 'order/:code',    name: 'order',    component: () => import('@/pages/OrderPage.vue') },
                { path: 'about',          name: 'about',       component: () => import('@/pages/AboutPage.vue') },
                { path: 'delivery',       name: 'delivery',    component: () => import('@/pages/DeliveryPage.vue') },
                { path: 'discounts',      name: 'discounts',   component: () => import('@/pages/DiscountsPage.vue') },
                { path: 'promotions',     redirect: '/discounts' },
                { path: 'f/:slug',        name: 'public-form', component: () => import('@/pages/FormSubmitPage.vue'), meta: { hideBottom: true } },
            ],
        },
    ],
    scrollBehavior() {
        return { top: 0 }
    },
})

export default router
