const staff = {
    policies: ['global::is-staff'],
    auth: false as const,
}
const staffEvents = {
    policies: [{ name: 'global::is-staff', config: { roles: ['manager', 'duty', 'courier'] } }],
    auth: false as const,
}

export default {
    routes: [
        { method: 'GET',    path: '/staff/events',                       handler: 'api::request.realtime.stream',       config: staffEvents },
        { method: 'GET',    path: '/staff/requests',                     handler: 'api::request.request.list',          config: staff },
        { method: 'POST',   path: '/staff/requests',                     handler: 'api::request.request.create',        config: staff },
        { method: 'POST',   path: '/staff/requests/reorder',             handler: 'api::request.request.reorder',       config: staff },
        { method: 'GET',    path: '/staff/requests/:id',                 handler: 'api::request.request.getOne',        config: staff },
        { method: 'PATCH',  path: '/staff/requests/:id',                 handler: 'api::request.request.patch',         config: staff },
        { method: 'POST',   path: '/staff/requests/:id/accept',          handler: 'api::request.request.accept',        config: staff },
        { method: 'POST',   path: '/staff/requests/:id/reassign',        handler: 'api::request.request.reassign',      config: staff },
        { method: 'POST',   path: '/staff/requests/:id/move',            handler: 'api::request.request.move',          config: staff },
        { method: 'POST',   path: '/staff/requests/:id/lose',            handler: 'api::request.request.lose',          config: staff },
        { method: 'POST',   path: '/staff/requests/:id/reopen',          handler: 'api::request.request.reopen',        config: staff },
        { method: 'POST',   path: '/staff/requests/:id/convert',         handler: 'api::request.request.convert',       config: staff },
        { method: 'POST',   path: '/staff/requests/:id/goals/restore',   handler: 'api::request.request.restoreGoals',  config: staff },
        { method: 'POST',   path: '/staff/requests/:id/goals/:stateId',  handler: 'api::request.request.toggleGoal',    config: staff },
        { method: 'DELETE', path: '/staff/requests/:id/goals/:stateId',  handler: 'api::request.request.removeGoal',    config: staff },
    ],
}
