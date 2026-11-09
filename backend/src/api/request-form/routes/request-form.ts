const managerOnly = {
    policies: [{ name: 'global::is-staff', config: { roles: ['manager'] } }],
    auth: false as const,
}

export default {
    routes: [
        { method: 'GET',    path: '/staff/request-forms',               handler: 'api::request-form.request-form.listAll',    config: managerOnly },
        { method: 'POST',   path: '/staff/request-forms',               handler: 'api::request-form.request-form.createOne',  config: managerOnly },
        { method: 'GET',    path: '/staff/request-forms/:id',           handler: 'api::request-form.request-form.getOneAdmin', config: managerOnly },
        { method: 'PUT',    path: '/staff/request-forms/:id',           handler: 'api::request-form.request-form.updateOne',  config: managerOnly },
        { method: 'DELETE', path: '/staff/request-forms/:id',           handler: 'api::request-form.request-form.deleteOne',  config: managerOnly },
        { method: 'POST',   path: '/staff/request-forms/:id/rotate-key', handler: 'api::request-form.request-form.rotateKey', config: managerOnly },
    ],
}
