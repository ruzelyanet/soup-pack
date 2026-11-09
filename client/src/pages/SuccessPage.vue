<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '@/stores/auth'
import Icon from '@/components/Icon.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuth()

const order = computed(() =>
    auth.myOrders.find((o) => o.code === route.params.code),
)
</script>

<template>
    <section class="flex-1 flex flex-col px-4 pt-8 safe-top">
        <div class="flex-1 flex flex-col items-center text-center gap-5">
            <div aria-hidden="true"
                 class="size-28 rounded-full bg-acc text-white flex items-center justify-center shadow-[0_20px_40px_-14px_rgba(214,58,28,0.55)]">
                <Icon name="check" :size="52" :stroke="3" />
            </div>
            <h1 class="m-0 font-display font-black text-[30px] leading-tight">
                Заказ принят!
            </h1>

            <!-- Основное сообщение: с клиентом свяжется оператор -->
            <div class="bg-sf rounded-[22px] p-5 w-full flex gap-3 items-start text-left">
                <div class="shrink-0 size-11 rounded-full bg-acc/15 text-acc flex items-center justify-center">
                    <Icon name="phone" :size="20" />
                </div>
                <div class="flex-1 flex flex-col gap-1">
                    <span class="font-display font-extrabold text-[16px] leading-tight">
                        С вами скоро свяжется оператор
                    </span>
                    <span class="text-mut text-[14px] leading-snug">
                        Мы перезвоним на
                        <b class="text-ink">{{ auth.client?.phone || 'ваш номер' }}</b>
                        для уточнения деталей и подтверждения заказа.
                        Начнём собирать сразу после звонка.
                    </span>
                </div>
            </div>

            <div class="bg-sf rounded-[22px] p-5 w-full flex flex-col gap-2 items-center">
                <span class="text-[12px] font-bold uppercase tracking-wider text-fnt">Номер заказа</span>
                <span class="font-display font-black text-[26px]">{{ order?.code || route.params.code }}</span>
            </div>
        </div>

        <div class="pt-5 pb-6 flex flex-col gap-2.5">
            <RouterLink v-if="order" :to="`/order/${order.code}`"
                        class="h-[60px] rounded-[20px] bg-acc text-white font-extrabold text-[17px] flex items-center justify-center">
                Открыть заказ
            </RouterLink>
            <button type="button" @click="router.replace('/')"
                    class="h-[52px] rounded-[18px] bg-sf text-ink font-extrabold text-[15px]">
                На главную
            </button>
        </div>
    </section>
</template>
