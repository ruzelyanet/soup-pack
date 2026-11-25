import type { Core } from '@strapi/strapi';

const allowedMediaTypes = [
  'image/*',
  'video/*',
  'audio/*',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.*',
  'text/plain',
  'text/csv',
];

const deniedTypes = [
  'image/svg+xml',
  'application/vnd.microsoft.portable-executable',
  'application/x-msdownload',
  'application/x-msdos-program',
  'application/x-executable',
  'application/x-dosexec',
  'application/x-sh',
  'text/x-shellscript',
  'application/x-mach-binary',
];

const config = ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Plugin => ({
  'users-permissions': {
    config: {
      jwtManagement: 'refresh',
      sessions: {
        httpOnly: true,
      },
    },
  },
  upload: {
    // Если задан CLOUDFLARE_R2_ACCESS_KEY — используем R2 (S3-совместимо).
    // Иначе — локальная папка /public/uploads (как по-умолчанию у Strapi).
    ...(env('CLOUDFLARE_R2_ACCESS_KEY') ? {
      config: {
        provider: 'aws-s3',
        providerOptions: {
          s3Options: {
            endpoint: env('CLOUDFLARE_R2_ENDPOINT'),
            accessKeyId: env('CLOUDFLARE_R2_ACCESS_KEY'),
            secretAccessKey: env('CLOUDFLARE_R2_SECRET_KEY'),
            region: 'auto',
            params: {
              Bucket: env('CLOUDFLARE_R2_BUCKET'),
            },
          },
          baseUrl: env('CLOUDFLARE_R2_PUBLIC_URL'),  // https://<id>.r2.cloudflarestorage.com/<bucket>  или кастомный домен
        },
        actionOptions: {
          upload: {},
          uploadStream: {},
          delete: {},
        },
        security: {
          allowedTypes: allowedMediaTypes,
          deniedTypes,
        },
      },
    } : {
      config: {
        security: {
          allowedTypes: allowedMediaTypes,
          deniedTypes,
        },
      },
    }),
  },
});

export default config;
