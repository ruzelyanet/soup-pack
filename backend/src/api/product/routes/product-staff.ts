const staff = { policies: ['global::is-staff'], auth: false as const }

/** Staff-прокси над core CRUD. is-staff policy спуфит ctx.state.auth под full-access,
 *  поэтому strictRelations не отрезает populate — админка видит category/image/gallery. */
export default {
    routes: [
        { method: 'GET',    path: '/staff/products',     handler: 'api::product.product.find',    config: staff },
        { method: 'GET',    path: '/staff/products/:id', handler: 'api::product.product.findOne', config: staff },
        { method: 'POST',   path: '/staff/products',     handler: 'api::product.product.create',  config: staff },
        { method: 'PUT',    path: '/staff/products/:id', handler: 'api::product.product.update',  config: staff },
        { method: 'DELETE', path: '/staff/products/:id', handler: 'api::product.product.delete',  config: staff },
    ],
}
