/** Отправить одно сообщение в несколько чатов. Ошибки глотаем — чтобы не ронять lifecycle. */
export async function sendTelegram(
    botToken: string | null | undefined,
    chatIds: string | null | undefined,
    text: string,
    log?: { error: (msg: string) => void },
): Promise<void> {
    if (!botToken || !chatIds) return
    const ids = String(chatIds)
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter(Boolean)
    if (!ids.length) return

    const url = `https://api.telegram.org/bot${String(botToken).trim()}/sendMessage`

    await Promise.all(ids.map(async (chatId) => {
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    text,
                    parse_mode: 'HTML',
                    disable_web_page_preview: true,
                }),
            })
            if (!res.ok) {
                const body = await res.text().catch(() => '')
                log?.error(`[telegram] ${res.status} chat=${chatId} body=${body.slice(0, 200)}`)
            }
        } catch (e: any) {
            log?.error(`[telegram] fetch failed chat=${chatId}: ${e?.message || e}`)
        }
    }))
}

export function escapeHtml(input: string): string {
    return String(input || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
}
