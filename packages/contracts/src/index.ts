/**
 * Camada: contrato público.
 *
 * Oferece uma única porta de importação para os DTOs e schemas compartilhados,
 * preservando os módulos internos livres para evoluir sem mudar consumidores.
 */
export * from './blocks.js';
export * from './common.js';
export * from './errors.js';
export * from './fees.js';
export * from './live.js';
