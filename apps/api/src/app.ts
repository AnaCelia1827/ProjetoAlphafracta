import cors from 'cors';
import express, { type Express, type Request, type Response } from 'express';
import helmet from 'helmet';
import pino from 'pino';
import { pinoHttp } from 'pino-http';

import type { BlockByIdentifierQuery, RecentBlocksQuery } from './interfaces/http/block-routes.js';
import { createBlockRouter } from './interfaces/http/block-routes.js';
import { errorMiddleware, routeNotFoundMiddleware } from './interfaces/http/error-middleware.js';
import type {
  CurrentFeeSnapshotQuery,
  FeeHistoryQueryUseCase,
} from './interfaces/http/fee-routes.js';
import { createFeeRouter } from './interfaces/http/fee-routes.js';
import { requestIdMiddleware } from './interfaces/http/request-id-middleware.js';

export interface ApiDependencies {
  corsOrigins: ReadonlySet<string>;
  getCurrentFeeSnapshot: CurrentFeeSnapshotQuery;
  getFeeHistory: FeeHistoryQueryUseCase;
  getRecentBlocks: RecentBlocksQuery;
  getBlockByIdentifier: BlockByIdentifierQuery;
  liveSseHub: { handle(request: Request, response: Response): void };
}

export function createApp(dependencies?: ApiDependencies): Express {
  const logger = pino({ enabled: process.env.NODE_ENV !== 'test' });
  const app = express();

  app.use(pinoHttp({ logger }));
  app.use(helmet());
  app.use(requestIdMiddleware);
  app.use((_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(
    cors({
      origin: (origin, callback) => {
        callback(null, origin === undefined || dependencies?.corsOrigins.has(origin) === true);
      },
    }),
  );
  app.use(express.json({ limit: '32kb' }));
  app.get('/health', (_request, response) => response.status(200).json({ status: 'ok' }));

  if (dependencies !== undefined) {
    app.use('/api/v1/fees', createFeeRouter(dependencies));
    app.use('/api/v1/blocks', createBlockRouter(dependencies));
    app.get('/api/v1/live/stream', (request, response) => {
      dependencies.liveSseHub.handle(request, response);
    });
  }

  app.use(routeNotFoundMiddleware);
  app.use(errorMiddleware);

  return app;
}
