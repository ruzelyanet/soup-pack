import { useCatalog } from '@/stores/catalog'

// shortcut: ранний клиентский fetch каталога. SSR-страницы должны всё равно
// вызывать useAsyncData(() => catalog.fetchAll()) — тогда данные приедут в HTML,
// а этот плагин просто гарантирует наличие стора у клиента.
export default defineNuxtPlugin(async () => {
    const catalog = useCatalog()
    await catalog.fetchAll().catch(() => {})
})
