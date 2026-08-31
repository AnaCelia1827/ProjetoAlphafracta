import type { ErrorRequestHandler, RequestHandler } from 'express';

import {
  ApplicationError,
  InvalidQueryError,
  RouteNotFoundError,
} from '../../application/common/errors.js';

/**
 * Camada: interface HTTP.
 *
 * Uniformiza falhas da aplicação, corpo inválido e exceções inesperadas em um
 * envelope seguro com request ID. Stack traces e detalhes de infraestrutura não
 * atravessam a fronteira pública.
 */
/** Middleware terminal que transforma caminhos não registrados em erro público. */
export const routeNotFoundMiddleware: RequestHandler = (_request, _response, next) => {
  next(new RouteNotFoundError());
};

/** Reconhece apenas categorias seguras de erro do parser que devem virar INVALID_QUERY. */
function isBodyParserError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as { type?: unknown; status?: unknown };
  return (
    candidate.type === 'entity.too.large' ||
    candidate.type === 'entity.parse.failed' ||
    candidate.status === 413
  );
}

/** Middleware final que serializa somente código, mensagem, detalhes permitidos e request ID. */
export const errorMiddleware: ErrorRequestHandler = (error, _request, response, _next) => {
  void _next;
  const safeError =
    error instanceof ApplicationError
      ? error
      : isBodyParserError(error)
        ? new InvalidQueryError()
        : new ApplicationError('INTERNAL_ERROR', 500, 'An unexpected error occurred');

  response.status(safeError.httpStatus).json({
    error: {
      code: safeError.code,
      message: safeError.message,
      ...(safeError instanceof InvalidQueryError && safeError.details !== undefined
        ? { details: safeError.details }
        : {}),
      requestId: String(response.locals.requestId),
    },
  });
};
