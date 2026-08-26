import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import pino from 'pino';
import { pinoHttp } from 'pino-http';

export function createApp(): Express {
  const logger = pino({ enabled: process.env.NODE_ENV !== 'test' });
  const app = express();

  app.use(pinoHttp({ logger }));
  app.use(helmet());
  app.use(cors());
  app.use(express.json());
  app.get('/health', (_request, response) => response.status(200).json({ status: 'ok' }));

  return app;
}
