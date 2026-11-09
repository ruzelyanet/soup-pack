const staffManager = { policies: [{ name: 'global::is-staff', config: { roles: ['manager'] } }], auth: false as const }

export default {
    routes: [
        { method: 'GET',    path: '/staff/products/:id/prices', handler: 'api::price.pricing.listForProduct',  config: staffManager },
        { method: 'POST',   path: '/staff/products/:id/prices', handler: 'api::price.pricing.createForProduct', config: staffManager },
        { method: 'DELETE', path: '/staff/prices/:id',          handler: 'api::price.pricing.deleteFuture',     config: staffManager },
        { method: 'POST',   path: '/staff/pricing/simulate',    handler: 'api::price.pricing.simulate',         config: staffManager },
    ],
}
