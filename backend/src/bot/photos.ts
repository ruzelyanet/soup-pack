/**
 * Картинки товаров для Telegram.
 *
 * 1. Сжатие: локальный файл из public/uploads (PNG ≈ 1 МБ) перед загрузкой переводим в JPEG
 *    до 800 px по длинной стороне, качество 80 — обычно 50–120 КБ. Прозрачный фон → белый.
 *    Используется `sharp`, который ставится вместе со Strapi (плагин upload). Нет sharp — шлём оригинал.
 * 2. file_id: после первой отправки Telegram отдаёт идентификатор файла, по нему картинка уходит
 *    мгновенно, без повторной загрузки. Храним их в БД (strapi.store), чтобы не терять при рестарте.
 *    file_id привязан к боту — ключ включает id бота; при смене токена старые id просто не используются.
 */
import path from 'node:path'
import type { PhotoSource } from './api'

export const MAX_SIDE = 800
export const JPEG_QUALITY = 80

export interface PhotoStore {
    get(key: string): Promise<string | null>
    set(key: string, fileId: string): Promise<void>
    delete(key: string): Promise<void>
}

export class MemoryPhotoStore implements PhotoStore {
    map = new Map<string, string>()
    async get(key: string) { return this.map.get(key) ?? null }
    async set(key: string, fileId: string) { this.map.set(key, fileId) }
    async delete(key: string) { this.map.delete(key) }
}

/** Одна запись в core-store Strapi: { [ключ картинки]: file_id }. Читаем один раз, пишем при изменении. */
export class StrapiPhotoStore implements PhotoStore {
    private cache: Map<string, string> | null = null
    private writing: Promise<void> = Promise.resolve()

    constructor(private strapi: any, private botId: string) {}

    private store() {
        return this.strapi.store({ type: 'plugin', name: 'shop-bot', key: 'photo-file-ids' })
    }

    private async load() {
        if (this.cache) return this.cache
        let raw: any = null
        try { raw = await this.store().get() } catch { /* нет записи */ }
        this.cache = new Map(Object.entries(raw && typeof raw === 'object' ? raw : {}) as [string, string][])
        return this.cache
    }

    private k(key: string) { return `${this.botId}:${key}` }

    private persist() {
        const snapshot = Object.fromEntries(this.cache || [])
        this.writing = this.writing
            .then(() => this.store().set({ value: snapshot }))
            .catch((e: any) => this.strapi.log?.warn?.('[shop-bot] photo cache save: ' + (e?.message || e)))
        return this.writing
    }

    async get(key: string) { return (await this.load()).get(this.k(key)) ?? null }
    async set(key: string, fileId: string) {
        const m = await this.load()
        if (m.get(this.k(key)) === fileId) return
        m.set(this.k(key), fileId)
        await this.persist()
    }
    async delete(key: string) {
        const m = await this.load()
        if (m.delete(this.k(key))) await this.persist()
    }
}

export type Compressed = { buffer: Buffer; filename: string }

let sharpMod: any | null | undefined
function loadSharp(): any | null {
    if (sharpMod !== undefined) return sharpMod
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        sharpMod = require('sharp')
    } catch {
        sharpMod = null
    }
    return sharpMod
}

/** Загрузить sharp заранее (первая загрузка библиотеки занимает несколько секунд). */
export function preloadSharp(): boolean {
    return !!loadSharp()
}

/** JPEG ≤ 800 px, q80. null — если sharp недоступен или файл не читается (тогда отправим оригинал). */
export async function compressForTelegram(filePath: string): Promise<Compressed | null> {
    const sharp = loadSharp()
    if (!sharp) return null
    try {
        const buffer: Buffer = await sharp(filePath, { failOn: 'none' })
            .rotate() // учесть EXIF-поворот
            .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true })
            .flatten({ background: '#ffffff' })
            .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
            .toBuffer()
        return { buffer, filename: path.basename(filePath, path.extname(filePath)) + '.jpg' }
    } catch {
        return null
    }
}

/** Ключ картинки для кеша file_id. Имена файлов Strapi уникальны (хеш в имени) — замена фото даёт новый ключ. */
export function photoKey(photo: PhotoSource): string | null {
    if ('url' in photo) return photo.url
    if ('filePath' in photo) return photo.filePath
    return null
}
