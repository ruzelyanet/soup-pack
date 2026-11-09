const publicRoute = { auth: false as const }

export default {
    routes: [
        { method: 'POST', path: '/pricing/quote', handler: 'api::price.pricing.publicQuote', config: publicRoute },
    ],
}
