'use strict'

/**
 * Rename "promotion*" → "discount*".
 *
 * Переименовывает БД-таблицы и колонки, созданные под старые UID
 * `api::promotion.promotion` / `api::promotion-target.promotion-target`, в новые
 * `api::discount.discount` / `api::discount-target.discount-target`.
 *
 * - id/documentId сохраняются (переименование таблицы их не трогает).
 * - Если Strapi уже создал пустые таблицы с новыми именами (из новой схемы контент-типов) —
 *   они дропаются, а старые с данными переименовываются на их место.
 *   Если новая таблица существует и в ней есть строки — миграция падает (это неожиданное состояние).
 * - Снимки `order.items[].discounts[].promotionId` в JSON не переписываются;
 *   читатели нормализуют `discountId ?? promotionId`.
 */

async function listTables(knex, like) {
    const client = knex.client.config.client
    if (client === 'sqlite' || client === 'better-sqlite3') {
        const rows = await knex('sqlite_master')
            .select('name')
            .where('type', 'table')
            .andWhere('name', 'like', like)
        return rows.map((r) => r.name)
    }
    const schemaExpr =
        client === 'postgres' || client === 'pg'
            ? knex.raw('current_schema()')
            : client === 'mysql' || client === 'mysql2'
            ? knex.raw('database()')
            : null
    if (!schemaExpr) throw new Error(`unsupported DB client: ${client}`)
    const rows = await knex('information_schema.tables')
        .select('table_name as name')
        .where('table_schema', schemaExpr)
        .andWhere('table_name', 'like', like)
    return rows.map((r) => r.name)
}

async function dropTableAnyDeps(knex, name) {
    // Postgres: на пустую таблицу уже могут быть FK от соседних пустых link-таблиц
    // (их тоже создал Strapi из новой схемы). CASCADE убирает только зависимые constraint-ы,
    // не сами таблицы. На sqlite/mysql CASCADE не нужен (sqlite не enforce FK по умолчанию;
    // mysql по умолчанию без CASCADE тоже справляется для простых случаев).
    const client = knex.client.config.client
    if (client === 'postgres' || client === 'pg') {
        await knex.raw(`DROP TABLE "${name}" CASCADE`)
    } else {
        await knex.schema.dropTable(name)
    }
}

async function safeRenameTable(knex, from, to, log) {
    const hasFrom = await knex.schema.hasTable(from)
    if (!hasFrom) return
    if (await knex.schema.hasTable(to)) {
        const cnt = Number((await knex(to).count('* as c'))[0].c)
        if (cnt > 0) {
            throw new Error(
                `cannot rename ${from} → ${to}: destination table already exists with ${cnt} rows`,
            )
        }
        await dropTableAnyDeps(knex, to)
        log(`dropped empty destination: ${to}`)
    }
    await knex.schema.renameTable(from, to)
    log(`renamed table: ${from} → ${to}`)
}

async function safeRenameColumn(knex, table, from, to, log) {
    if (!(await knex.schema.hasTable(table))) return
    if (!(await knex.schema.hasColumn(table, from))) return
    if (await knex.schema.hasColumn(table, to)) return
    await knex.schema.alterTable(table, (t) => t.renameColumn(from, to))
    log(`renamed column: ${table}.${from} → ${to}`)
}

module.exports = {
    async up(knex) {
        const log = (...a) => console.log('[rename-promotions]', ...a)

        // Отчёт до.
        const before = {}
        for (const t of ['promotions', 'promotion_targets', 'discounts', 'discount_targets']) {
            if (await knex.schema.hasTable(t)) {
                before[t] = Number((await knex(t).count('* as c'))[0].c)
            }
        }
        log('before:', before)

        // 1. Базовые таблицы.
        await safeRenameTable(knex, 'promotions', 'discounts', log)
        await safeRenameTable(knex, 'promotion_targets', 'discount_targets', log)

        // 2. Колонки в order_discounts.
        await safeRenameColumn(knex, 'order_discounts', 'promotion_id', 'discount_id', log)
        await safeRenameColumn(knex, 'order_discounts', 'promotion_version', 'discount_version', log)

        // 3. Link-таблицы Strapi (*_lnk / *_links) с "promotion" в имени.
        //    Если Strapi параллельно создал link-таблицу с новым именем (пустую) —
        //    safeRenameTable её дропнет и займёт её место.
        const linkTables = await listTables(knex, '%promotion%')
        for (const name of linkTables) {
            const newName = name.replace(/promotion/g, 'discount')
            if (newName === name) continue
            await safeRenameTable(knex, name, newName, log)
        }

        // 4. Колонки *_promotion*_id / promotion_ord / promotion_version в link-таблицах.
        //    Порядок важен: сначала переименовываем длинные имена (promotion_target_id),
        //    чтобы они не ловились правилом promotion_id.
        const allLinkTables = [
            ...(await listTables(knex, '%_lnk')),
            ...(await listTables(knex, '%_links')),
        ]
        for (const t of allLinkTables) {
            for (const [from, to] of [
                ['promotion_target_id', 'discount_target_id'],
                ['promotion_target_ord', 'discount_target_ord'],
                ['inv_promotion_target_id', 'inv_discount_target_id'],
                ['promotion_id', 'discount_id'],
                ['promotion_ord', 'discount_ord'],
                ['promotion_version', 'discount_version'],
                ['inv_promotion_id', 'inv_discount_id'],
            ]) {
                await safeRenameColumn(knex, t, from, to, log)
            }
        }

        // Отчёт после + сверка.
        const after = {}
        for (const t of ['discounts', 'discount_targets']) {
            if (await knex.schema.hasTable(t)) {
                after[t] = Number((await knex(t).count('* as c'))[0].c)
            }
        }
        log('after:', after)
        if (before.promotions != null && after.discounts !== before.promotions) {
            throw new Error(
                `row count mismatch: promotions=${before.promotions} discounts=${after.discounts}`,
            )
        }
        if (before.promotion_targets != null && after.discount_targets !== before.promotion_targets) {
            throw new Error(
                `row count mismatch: promotion_targets=${before.promotion_targets} discount_targets=${after.discount_targets}`,
            )
        }
    },
}
