import { z } from 'zod';

export const utcDateTimeSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/)
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Invalid UTC timestamp');

export const nonNegativeFiniteSchema = z.number().finite().nonnegative();
export const percentageSchema = z.number().finite().min(0).max(100);
export const signedPercentageSchema = z.number().finite();
export const decimalIntegerStringSchema = z.string().regex(/^(0|[1-9]\d*)$/);
export const blockHashSchema = z.string().regex(/^0x[a-fA-F0-9]{64}$/);
export const networkSchema = z.literal('ethereum-mainnet');
