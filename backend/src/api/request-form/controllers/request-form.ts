import { factories } from '@strapi/strapi'
import { randomBytes } from 'node:crypto'
import { hashKey, verifyKey } from '../../../utils/staff-key'
import { allow as rateAllow } from '../services/rate-limit'

type FieldSchema = {
    key: string
    label: string
    type: 'text' | 'textarea' | 'number' | 'select' | 'date' | 'checkbox' | 'address'
    required?: boolean
    options?: string[]
    placeholder?: string
    position?: number
}

function sanitizeForm(f: any) {
    if (!f) return f
    const { apiKey, apiKeyHashed, ...rest } = f
    return { ...rest, apiKeySet: Boolean(apiKey) }
}

function publicForm(f: any) {
    if (!f) return null
    return {
        slug: f.slug,
        type: f.type,
        title: f.title || '',
        description: f.description || '',
        fields: Array.isArray(f.fields) ? f.fields : [],
        successMessage: f.successMessage || 'Спасибо! Мы свяжемся с вами.',
    }
}

function newApiKey(): string {
    return 'rfk_' + randomBytes(24).toString('hex')
}

/** Строгая валидация body формы: name, phone + required-поля из fields. */
function validateBody(form: any, body: any): { ok: true } | { ok: false; errors: Record<string, string> } {
    const errors: Record<string, string> = {}
    if (!String(body?.name || '').trim()) errors.name = 'required'
    if (!String(body?.phone || '').trim()) errors.phone = 'required'

    const incoming = (body?.fields || {}) as Record<string, unknown>
    for (const f of (form.fields as FieldSchema[]) || []) {
        if (!f.required) continue
        const v = incoming[f.key]
        if (v == null || (typeof v === 'string' && !v.trim())) {
            errors[f.key] = 'required'
        }
    }
    if (Object.keys(errors).length) return { ok: false, errors }
    return { ok: true }
}

export default factories.createCoreController('api::request-form.request-form' as any, ({ strapi }: any) => ({
    // --- Публичные ---

    /** Схема формы для публичной страницы `/f/:slug`. */
    async getPublic(ctx) {
        const slug = String(ctx.params.slug || '').trim()
        if (!slug) return ctx.badRequest('slug required')
        const form = await strapi.db.query('api::request-form.request-form').findOne({ where: { slug } })
        if (!form || !form.isActive) return ctx.notFound()
        // Форма с requireApiKey не рендерится как публичная страница.
        if (form.requireApiKey) return ctx.notFound()
        ctx.body = { data: publicForm(form) }
    },

    /** Приём заявки по форме. */
    async submit(ctx) {
        const slug = String(ctx.params.slug || '').trim()
        const form = await strapi.db.query('api::request-form.request-form').findOne({ where: { slug } })
        if (!form || !form.isActive) return ctx.notFound()

        const headers = ctx.request.headers || {}
        const providedKey = String(headers['x-form-key'] || '').trim()
        if (form.requireApiKey) {
            if (!providedKey || !form.apiKey) return ctx.unauthorized('X-Form-Key required')
            const ok = form.apiKeyHashed ? verifyKey(providedKey, form.apiKey) : form.apiKey === providedKey
            if (!ok) return ctx.unauthorized('invalid key')
        }

        // Rate limit — по IP + slug.
        const ip = (ctx.request.ip || ctx.ip || 'unknown') as string
        if (!rateAllow(`form:${slug}:${ip}`, 10, 10 * 60 * 1000)) {
            return ctx.throw(429, 'RATE_LIMIT')
        }

        const body = (ctx.request.body?.data || ctx.request.body) as any

        // Honeypot — тихо возвращаем «ок», чтобы боты не детектили.
        if (body?._hp) {
            ctx.body = { data: { code: 'RQ-HONEYPOT' } }
            return
        }

        const check = validateBody(form, body)
        if (!check.ok) return ctx.badRequest('validation', { errors: check.errors })

        // values: snapshot label-ов из схемы формы для известных ключей.
        const incoming = (body?.fields || {}) as Record<string, unknown>
        const schemaFields = (form.fields as FieldSchema[]) || []
        const schemaKeys = new Set(schemaFields.map((f) => f.key))

        const values = schemaFields.map((f) => ({
            key: f.key,
            label: f.label,
            value: incoming[f.key] ?? null,
        }))

        // Неизвестные ключи → extra, вместе с meta.utm_* / referrer.
        const unknownFields: Record<string, unknown> = {}
        for (const k of Object.keys(incoming)) {
            if (!schemaKeys.has(k)) unknownFields[k] = incoming[k]
        }
        const meta = (body?.meta || {}) as Record<string, unknown>
        const extra: Record<string, unknown> = { ...unknownFields }
        for (const k of Object.keys(meta)) {
            if (/^utm_/i.test(k) || k === 'referrer') extra[k] = meta[k]
        }

        const idempotencyKey = String(headers['idempotency-key'] || '').trim() || null

        try {
            const created = await strapi.service('api::request.request').createRequest(
                {
                    // Тип ВСЕГДА из формы, body.type игнорируется.
                    type: form.type,
                    name: body.name,
                    phone: body.phone,
                    values,
                    extra,
                    comment: body?.comment || null,
                    source: 'form',
                    sourceDetail: form.sourceDetail || null,
                    idempotencyKey,
                },
                { actorId: null },
            )
            ctx.status = 201
            ctx.body = { data: { code: created.code } }
        } catch (err: any) {
            const msg = err?.message || 'create failed'
            if (/required|invalid phone/.test(msg)) return ctx.badRequest(msg)
            strapi.log.error('[request-forms/submit] ' + msg)
            return ctx.internalServerError(msg)
        }
    },

    // --- Админка (staff manager) ---

    async listAll(ctx) {
        const rows = await strapi.db.query('api::request-form.request-form').findMany({
            orderBy: { id: 'asc' as const },
            limit: 100,
        })
        ctx.body = { data: rows.map(sanitizeForm) }
    },

    async getOneAdmin(ctx) {
        const id = Number(ctx.params.id)
        if (!id) return ctx.badRequest('bad id')
        const form = await strapi.db.query('api::request-form.request-form').findOne({ where: { id } })
        if (!form) return ctx.notFound()
        ctx.body = { data: sanitizeForm(form) }
    },

    async createOne(ctx) {
        const body = (ctx.request.body?.data || ctx.request.body) as any
        const name = String(body?.name || '').trim()
        const slug = String(body?.slug || '').trim()
        if (!name || !slug) return ctx.badRequest('name and slug are required')
        if (!['individual', 'shop'].includes(body?.type)) return ctx.badRequest('invalid type')

        const existing = await strapi.db.query('api::request-form.request-form').findOne({ where: { slug } })
        if (existing) return ctx.badRequest('SLUG_TAKEN')

        const created = await strapi.db.query('api::request-form.request-form').create({
            data: {
                name,
                slug,
                type: body.type,
                isActive: body.isActive !== false,
                title: body.title || null,
                description: body.description || null,
                fields: Array.isArray(body.fields) ? body.fields : [],
                successMessage: body.successMessage || null,
                sourceDetail: body.sourceDetail || null,
                requireApiKey: Boolean(body.requireApiKey),
                publishedAt: new Date(),
            },
        })
        ctx.body = { data: sanitizeForm(created) }
    },

    async updateOne(ctx) {
        const id = Number(ctx.params.id)
        if (!id) return ctx.badRequest('bad id')
        const body = (ctx.request.body?.data || ctx.request.body) as any
        const form = await strapi.db.query('api::request-form.request-form').findOne({ where: { id } })
        if (!form) return ctx.notFound()

        const patch: Record<string, any> = {}
        if ('name' in body) patch.name = String(body.name).trim()
        if ('type' in body) {
            if (!['individual', 'shop'].includes(body.type)) return ctx.badRequest('invalid type')
            patch.type = body.type
        }
        if ('isActive' in body) patch.isActive = Boolean(body.isActive)
        if ('title' in body) patch.title = body.title || null
        if ('description' in body) patch.description = body.description || null
        if ('fields' in body) patch.fields = Array.isArray(body.fields) ? body.fields : []
        if ('successMessage' in body) patch.successMessage = body.successMessage || null
        if ('sourceDetail' in body) patch.sourceDetail = body.sourceDetail || null
        if ('requireApiKey' in body) patch.requireApiKey = Boolean(body.requireApiKey)

        if ('slug' in body) {
            const slug = String(body.slug).trim()
            if (!slug) return ctx.badRequest('slug required')
            if (slug !== form.slug) {
                const taken = await strapi.db.query('api::request-form.request-form').findOne({ where: { slug } })
                if (taken) return ctx.badRequest('SLUG_TAKEN')
                patch.slug = slug
            }
        }

        const updated = await strapi.db.query('api::request-form.request-form').update({
            where: { id },
            data: patch,
        })
        ctx.body = { data: sanitizeForm(updated) }
    },

    async deleteOne(ctx) {
        const id = Number(ctx.params.id)
        if (!id) return ctx.badRequest('bad id')
        await strapi.db.query('api::request-form.request-form').delete({ where: { id } })
        ctx.body = { data: { ok: true } }
    },

    /** Выпустить новый ключ. Отдаём plain-строку один раз, в БД — хэш. */
    async rotateKey(ctx) {
        const id = Number(ctx.params.id)
        if (!id) return ctx.badRequest('bad id')
        const form = await strapi.db.query('api::request-form.request-form').findOne({ where: { id } })
        if (!form) return ctx.notFound()
        const plain = newApiKey()
        await strapi.db.query('api::request-form.request-form').update({
            where: { id },
            data: { apiKey: hashKey(plain), apiKeyHashed: true },
        })
        ctx.body = { data: { apiKey: plain } }
    },
}))
