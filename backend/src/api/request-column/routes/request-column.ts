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
        { method: 'GET',    path: '/staff/request-columns',             handler: 'api::request-column.request-column.listAll',   config: staff },
        { method: 'POST',   path: '/staff/request-columns',             handler: 'api::request-column.request-column.createOne', config: managerOnly },
        { method: 'POST',   path: '/staff/request-columns/reorder',     handler: 'api::request-column.request-column.reorder',   config: managerOnly },
        { method: 'PUT',    path: '/staff/request-columns/:id',         handler: 'api::request-column.request-column.updateOne', config: managerOnly },
        { method: 'DELETE', path: '/staff/request-columns/:id',         handler: 'api::request-column.request-column.deleteOne', config: managerOnly },

        { method: 'GET',    path: '/staff/request-columns/:id/goals',           handler: 'api::request-column.request-column.listGoals',   config: staff },
        { method: 'POST',   path: '/staff/request-columns/:id/goals',           handler: 'api::request-column.request-column.createGoal', config: managerOnly },
        { method: 'PUT',    path: '/staff/request-columns/:id/goals/:goalId',   handler: 'api::request-column.request-column.updateGoal', config: managerOnly },
        { method: 'DELETE', path: '/staff/request-columns/:id/goals/:goalId',   handler: 'api::request-column.request-column.deleteGoal', config: managerOnly },
    ],
}
