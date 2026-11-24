/**
 * Кнопка «назад»: в SPA router.back() молча проваливается, когда history пустой
 * (прямой заход, перезагрузка). Отдаём fallback на главную.
 */
export function useGoBack(fallback = '/') {
    const router = useRouter()
    return () => {
        if (import.meta.client && window.history.length > 1) {
            router.back()
        } else {
            router.push(fallback)
        }
    }
}
