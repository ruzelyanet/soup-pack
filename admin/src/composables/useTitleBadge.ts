import { computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRequestsFeed } from '@/stores/requestsFeed'
import { useOrdersFeed } from '@/stores/ordersFeed'

/** `(N) <title>` пока есть непросмотренные; сумма по заявкам и заказам. */
export function useTitleBadge() {
    const requests = useRequestsFeed()
    const orders = useOrdersFeed()
    const total = computed(() => requests.unseenCount + orders.unseenCount)
    let base = ''

    const render = (n: number) => {
        if (!base) return
        const prefix = n > 0 ? `(${n > 9 ? '9+' : n}) ` : ''
        document.title = prefix + base
    }

    const stop = watch(() => total.value, (n) => render(n))

    onMounted(() => {
        base = document.title.replace(/^\(\d+\+?\)\s*/, '')
        render(total.value)
    })
    onBeforeUnmount(() => {
        stop()
        if (base) document.title = base
    })
}
