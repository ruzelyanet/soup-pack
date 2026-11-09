const staff = {
    policies: ['global::is-staff'],
    auth: false as const,
}

const managerOnly = {
    policies: [{ name: 'global::is-staff', config: { roles: ['manager'] } }],
    auth: false as const,
}

export default {
    routes: [
        { method: 'GET',  path: '/staff/request-settings',     handler: 'api::request-setting.request-setting.getOne',       config: managerOnly },
        { method: 'PUT',  path: '/staff/request-settings',     handler: 'api::request-setting.request-setting.updateOne',    config: managerOnly },
        { method: 'POST', path: '/staff/request-settings/telegram-test', handler: 'api::request-setting.request-setting.testTelegram', config: managerOnly },
        { method: 'GET',  path: '/staff/request-settings/sla', handler: 'api::request-setting.request-setting.getPublicSla', config: staff },
    ],
}
