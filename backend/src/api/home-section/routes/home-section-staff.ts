const staff = { policies: ['global::is-staff'], auth: false as const }

export default {
    routes: [
        { method: 'GET',    path: '/staff/home-sections',     handler: 'api::home-section.home-section.find',    config: staff },
        { method: 'GET',    path: '/staff/home-sections/:id', handler: 'api::home-section.home-section.findOne', config: staff },
        { method: 'POST',   path: '/staff/home-sections',     handler: 'api::home-section.home-section.create',  config: staff },
        { method: 'PUT',    path: '/staff/home-sections/:id', handler: 'api::home-section.home-section.update',  config: staff },
        { method: 'DELETE', path: '/staff/home-sections/:id', handler: 'api::home-section.home-section.delete',  config: staff },
    ],
}
