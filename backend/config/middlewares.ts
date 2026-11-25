import type { Core } from '@strapi/strapi';

const config: Core.Config.Middlewares = [
  'strapi::logger',
  'strapi::errors',
  // CSP: разрешаем загружать картинки/медиа с R2-домена (чтобы Strapi Admin их отрисовал).
  {
    name: 'strapi::security',
    config: {
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'connect-src': ["'self'", 'https:'],
          'img-src': [
            "'self'",
            'data:',
            'blob:',
            'market-assets.strapi.io',
            // R2 public endpoint (или кастомный домен) — берётся из env, fallback разрешает все *.r2.cloudflarestorage.com
            process.env.CLOUDFLARE_R2_PUBLIC_URL
              ? new URL(process.env.CLOUDFLARE_R2_PUBLIC_URL).host
              : '*.r2.cloudflarestorage.com',
            '*.r2.dev',
          ],
          'media-src': [
            "'self'",
            'data:',
            'blob:',
            process.env.CLOUDFLARE_R2_PUBLIC_URL
              ? new URL(process.env.CLOUDFLARE_R2_PUBLIC_URL).host
              : '*.r2.cloudflarestorage.com',
            '*.r2.dev',
          ],
          upgradeInsecureRequests: null,
        },
      },
    },
  },
  'strapi::cors',
  'strapi::poweredBy',
  'strapi::query',
  'strapi::body',
  'strapi::session',
  'strapi::favicon',
  'strapi::public',
];

export default config;
