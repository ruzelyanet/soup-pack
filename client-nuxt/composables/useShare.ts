/**
 * Поделиться: Web Share API на мобильных, копия в буфер как fallback.
 */
export function useShare() {
    return async (payload: { title?: string; text?: string; url?: string }) => {
        if (!import.meta.client) return
        const url = payload.url || window.location.href
        const data = { title: payload.title, text: payload.text, url }

        if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
            try {
                await navigator.share(data)
                return
            } catch (e: any) {
                if (e?.name === 'AbortError') return // пользователь закрыл шит
                // проваливаемся в fallback
            }
        }

        try {
            await navigator.clipboard.writeText(url)
            alert('Ссылка скопирована')
        } catch {
            prompt('Скопируйте ссылку:', url)
        }
    }
}
