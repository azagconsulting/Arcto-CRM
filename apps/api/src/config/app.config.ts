import type { EnvConfig } from './env.validation';

export const appConfig = () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  app: {
    name: 'arcto-crm-api',
    port: Number(process.env.PORT ?? 4000),
    url: process.env.API_URL ?? 'http://localhost:4000',
  },
  frontend: {
    url: process.env.APP_URL ?? 'http://localhost:3000',
  },
  auth: {
    jwt: {
      secret: process.env.JWT_SECRET as string,
      expiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
    },
    refresh: {
      secret: process.env.JWT_REFRESH_SECRET as string,
      expiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '30d',
    },
  },
});

export type AppConfig = ReturnType<typeof appConfig> & EnvConfig;
