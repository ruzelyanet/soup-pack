const staffManager = { policies: [{ name: 'global::is-staff', config: { roles: ['manager'] } }], auth: false as const }

export default {
    routes: [
        { method: 'GET',    path: '/staff/discounts',             handler: 'api::discount.discount.staffList',      config: staffManager },
        { method: 'GET',    path: '/staff/discounts/report',      handler: 'api::discount.discount.staffReport',    config: staffManager },
        { method: 'POST',   path: '/staff/discounts/preview',     handler: 'api::discount.discount.staffPreview',   config: staffManager },
        { method: 'GET',    path: '/staff/discounts/:id',         handler: 'api::discount.discount.staffFindOne',   config: staffManager },
        { method: 'POST',   path: '/staff/discounts',             handler: 'api::discount.discount.staffCreate',    config: staffManager },
        { method: 'PATCH',  path: '/staff/discounts/:id',         handler: 'api::discount.discount.staffUpdate',    config: staffManager },
        { method: 'DELETE', path: '/staff/discounts/:id',         handler: 'api::discount.discount.staffDelete',    config: staffManager },
        { method: 'POST',   path: '/staff/discounts/:id/status',  handler: 'api::discount.discount.staffSetStatus', config: staffManager },

        // @deprecated Один релиз — алиасы со старых путей /staff/promotions*.
        { method: 'GET',    path: '/staff/promotions',            handler: 'api::discount.discount.staffList',      config: staffManager },
        { method: 'GET',    path: '/staff/promotions/report',     handler: 'api::discount.discount.staffReport',    config: staffManager },
        { method: 'GET',    path: '/staff/promotions/:id',        handler: 'api::discount.discount.staffFindOne',   config: staffManager },
        { method: 'POST',   path: '/staff/promotions',            handler: 'api::discount.discount.staffCreate',    config: staffManager },
        { method: 'PATCH',  path: '/staff/promotions/:id',        handler: 'api::discount.discount.staffUpdate',    config: staffManager },
        { method: 'POST',   path: '/staff/promotions/:id/status', handler: 'api::discount.discount.staffSetStatus', config: staffManager },
    ],
}
