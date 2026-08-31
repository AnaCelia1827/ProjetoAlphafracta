import { randomUUID } from 'node:crypto';

import type { RequestHandler } from 'express';

/**
 * Camada: interface HTTP.
 *
 * Garante um identificador em toda resposta, reaproveitando valor do cliente
 * somente dentro de limite seguro. O ID une logs e envelopes de erro sem estado.
 */
/** Middleware que atribui request ID a locals e cabeçalho de resposta. */
export const requestIdMiddleware: RequestHandler = (request, response, next) => {
  const supplied = request.header('x-request-id');
  const requestId = supplied !== undefined && supplied.length <= 200 ? supplied : randomUUID();
  response.locals.requestId = requestId;
  response.setHeader('X-Request-Id', requestId);
  next();
};
