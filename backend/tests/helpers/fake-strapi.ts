/**
 * Минимальная in-memory замена `strapi` для unit-тестов сервисов (заказы, транзакции, pricing).
 * Поддерживает db.query(uid).findOne/findMany/create/update/count, db.transaction, documents().create,
 * service(uid). Фильтр `where` — только простое равенство (в т.ч. по связи `{ id }` или по id связи);
 * операторы `$and/$or/$lte/...` игнорируются — тесты сидируют данные так, чтобы это не мешало.
 */

type Row = Record<string, any>

function relId(v: any): any {
    if (v && typeof v === 'object' && !(v instanceof Date)) return v.id ?? v.documentId
    return v
}

function matches(row: Row, where: Row | undefined): boolean {
    if (!where) return true
    for (const [k, v] of Object.entries(where)) {
        if (k.startsWith('$')) continue
        if (v && typeof v === 'object' && !(v instanceof Date)) {
            if ('id' in v) {
                if (relId(row[k]) !== v.id) return false
            }
            continue // операторы ($lte, $in, ...) не поддерживаем
        }
        const actual = relId(row[k])
        if (actual !== v && !(actual == null && v == null)) return false
    }
    return true
}

export function createFakeStrapi() {
    const tables = new Map<string, Row[]>()
    const services = new Map<string, any>()
    let idSeq = 1000

    const table = (uid: string) => {
        if (!tables.has(uid)) tables.set(uid, [])
        return tables.get(uid)!
    }

    const query = (uid: string) => ({
        async findOne(opts: any = {}) {
            const row = table(uid).find((r) => matches(r, opts.where)) ?? null
            if (row && Array.isArray(opts.populate)) {
                // связь, сохранённая как id, при populate отдаётся объектом { id }
                const out = { ...row }
                for (const k of opts.populate) if (typeof out[k] === 'number') out[k] = { id: out[k] }
                return out
            }
            return row
        },
        async findMany(opts: any = {}) {
            let rows = table(uid).filter((r) => matches(r, opts.where))
            if (opts.orderBy?.id === 'desc') rows = [...rows].sort((a, b) => b.id - a.id)
            if (opts.limit) rows = rows.slice(0, opts.limit)
            return rows
        },
        async count(opts: any = {}) {
            return table(uid).filter((r) => matches(r, opts.where)).length
        },
        async create({ data }: any) {
            const id = data.id ?? ++idSeq
            const row = { ...data, id, documentId: data.documentId ?? `doc-${id}`, createdAt: data.createdAt ?? new Date() }
            table(uid).push(row)
            return row
        },
        async update({ where, data }: any) {
            const row = table(uid).find((r) => matches(r, where))
            if (!row) return null
            Object.assign(row, data)
            return row
        },
        async deleteMany({ where }: any = {}) {
            const rows = table(uid)
            const keep = rows.filter((r) => !matches(r, where))
            const count = rows.length - keep.length
            tables.set(uid, keep)
            return { count }
        },
    })

    const strapi: any = {
        db: {
            query,
            async transaction(fn: () => Promise<any>) { return fn() },
        },
        documents: (uid: string) => ({
            async create({ data }: any) { return query(uid).create({ data }) },
            async update({ documentId, data }: any) {
                const row = table(uid).find((r) => r.documentId === documentId)
                if (!row) return null
                Object.assign(row, data)
                return row
            },
        }),
        service: (uid: string) => {
            const s = services.get(uid)
            if (!s) throw new Error('service not registered in fake: ' + uid)
            return s
        },
        log: { warn() {}, info() {}, error() {} },
        store: () => ({ async get() { return null }, async set() {} }),
    }

    return {
        strapi,
        table,
        seed(uid: string, rows: Row[]) { table(uid).push(...rows) },
        register(uid: string, svc: any) { services.set(uid, svc) },
    }
}
