import { z } from 'zod';

/**
 * Camada: contrato público.
 *
 * Reúne validações atômicas reutilizadas por todos os DTOs REST e SSE. Manter
 * estas regras em um único ponto evita que consumidores recebam formatos
 * equivalentes, porém ambíguos, para o mesmo dado de blockchain.
 */
/** Valida uma data UTC serializada de forma canônica para comparação entre fontes. */
export const utcDateTimeSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/)
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Invalid UTC timestamp');

/** Restringe medidas monetárias e contagens a números finitos não negativos. */
export const nonNegativeFiniteSchema = z.number().finite().nonnegative();
/** Limita percentuais de ocupação e proporção à escala fechada de 0 a 100. */
export const percentageSchema = z.number().finite().min(0).max(100);
/** Aceita variações percentuais positivas ou negativas, mas nunca infinitas. */
export const signedPercentageSchema = z.number().finite();
/** Preserva identificadores numéricos como texto decimal sem zeros à esquerda. */
export const decimalIntegerStringSchema = z.string().regex(/^(0|[1-9]\d*)$/);
/** Garante o formato completo de um hash de bloco Ethereum hexadecimal. */
export const blockHashSchema = z.string().regex(/^0x[a-fA-F0-9]{64}$/);
/** Fixa a única rede suportada para impedir mistura acidental de ambientes. */
export const networkSchema = z.literal('ethereum-mainnet');
