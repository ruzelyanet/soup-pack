const staff = { policies: ['global::is-staff'], auth: false as const }

export default {
    routes: [
        { method: 'GET',    path: '/staff/categories',     handler: 'api::category.category.find',    config: staff },
        { method: 'GET',    path: '/staff/categories/:id', handler: 'api::category.category.findOne', config: staff },
        { method: 'POST',   path: '/staff/categories',     handler: 'api::category.category.create',  config: staff },
        { method: 'PUT',    path: '/staff/categories/:id', handler: 'api::category.category.update',  config: staff },
        { method: 'DELETE', path: '/staff/categories/:id', handler: 'api::category.category.delete',  config: staff },
    ],
}
