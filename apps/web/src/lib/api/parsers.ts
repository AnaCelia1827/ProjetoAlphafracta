import {
  BlockResponseSchema,
  FeeCurrentResponseSchema,
  FeeHistoryResponseSchema,
  LiveEventSchema,
  RecentBlocksResponseSchema,
} from "@alphractal/contracts";

export const parseCurrentFeeResponse = (value: unknown) =>
  FeeCurrentResponseSchema.parse(value);

export const parseFeeHistoryResponse = (value: unknown) =>
  FeeHistoryResponseSchema.parse(value);

export const parseRecentBlocksResponse = (value: unknown) =>
  RecentBlocksResponseSchema.parse(value);

export const parseBlockResponse = (value: unknown) =>
  BlockResponseSchema.parse(value);

export function parseLiveMessage(event: string, id: string, value: unknown) {
  return LiveEventSchema.parse({ event, id, data: value });
}
