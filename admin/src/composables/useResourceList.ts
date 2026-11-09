import { onMounted, ref } from 'vue'

export function useResourceList<T>(fetcher: () => Promise<T>) {
    const data = ref<T>()
    const loading = ref(true)
    const err = ref<string | null>(null)

    async function reload() {
        loading.value = true
        err.value = null
        try {
            data.value = await fetcher()
        } catch (e: any) {
            err.value = e?.response?.status
                ? `${e.response.status} ${e.response.statusText}: ${e?.response?.data?.error?.message || ''}`
                : 'Нет связи с API — запустите backend (cd backend && npm run develop)'
        } finally {
            loading.value = false
        }
    }

    onMounted(reload)

    return { data, loading, err, reload }
}
