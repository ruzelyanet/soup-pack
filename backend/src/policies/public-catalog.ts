/** Policy: без JWT-проверки, просто спуфит `ctx.state.auth` под read-only API-token,
 *  чтобы Strapi 5 sanitize-output не отрезал public-populate для relations каталога
 *  (category, image, banner, items.product, products в home-section). Применять ТОЛЬКО на публичные find/findOne
 *  тех content-type, которые по дизайну публичны (product, category, banner, order-set, cart-discount, home-section). */
const publicCatalog = async (policyContext: any) => {
    policyContext.state.auth = {
        strategy: { name: 'api-token' },
        credentials: { type: 'read-only', name: 'public-catalog' },
        ability: null,
    }
    return true
}

export default publicCatalog
