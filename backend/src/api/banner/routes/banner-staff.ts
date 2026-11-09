const staff = { policies: ['global::is-staff'], auth: false as const }

export default {
    routes: [
        { method: 'GET',    path: '/staff/banners',     handler: 'api::banner.banner.find',    config: staff },
        { method: 'GET',    path: '/staff/banners/:id', handler: 'api::banner.banner.findOne', config: staff },
        { method: 'POST',   path: '/staff/banners',     handler: 'api::banner.banner.create',  config: staff },
        { method: 'PUT',    path: '/staff/banners/:id', handler: 'api::banner.banner.update',  config: staff },
        { method: 'DELETE', path: '/staff/banners/:id', handler: 'api::banner.banner.delete',  config: staff },
    ],
}
