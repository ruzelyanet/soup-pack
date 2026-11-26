/** Яндекс.Карты 2.1 и геокодер — общий загрузчик для всей админки (скрипт грузится один раз). */

const YANDEX_API_KEY = import.meta.env.VITE_YANDEX_MAPS_KEY as string | undefined
export const YANDEX_GEOCODER_KEY = import.meta.env.VITE_YANDEX_GEOCODER_KEY as string | undefined

/** Центр Ташкента. */
export const TASHKENT: [number, number] = [41.3111, 69.2797]

let ymapsPromise: Promise<any> | null = null

export function loadYmaps(): Promise<any> {
    const w = window as any
    if (w.ymaps?.Map) return w.ymaps.ready().then(() => w.ymaps)
    if (ymapsPromise) return ymapsPromise
    ymapsPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script')
        const key = YANDEX_API_KEY ? `apikey=${encodeURIComponent(YANDEX_API_KEY)}&` : ''
        script.src = `https://api-maps.yandex.ru/2.1/?${key}lang=ru_RU`
        script.async = true
        script.onload = () => w.ymaps.ready(() => resolve(w.ymaps))
        script.onerror = () => { ymapsPromise = null; reject(new Error('yandex maps load failed')) }
        document.head.appendChild(script)
    })
    return ymapsPromise
}
