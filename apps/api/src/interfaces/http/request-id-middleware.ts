import { randomUUID } from 'node:crypto';

import type { RequestHandler } from 'express';

export const requestIdMiddleware: RequestHandler = (request, response, next) => {
  const supplied = request.header('x-request-id');
  const requestId = supplied !== undefined && supplied.length <= 200 ? supplied : randomUUID();
  response.locals.requestId = requestId;
  response.setHeader('X-Request-Id', requestId);
  next();
};
