import type {
  BlockSummaryDto,
  FeeSnapshotDto,
  LiveEventDto,
} from "@alphractal/contracts";

export type LiveMonitorState = {
  fee: FeeSnapshotDto | null;
  blocks: BlockSummaryDto[];
};

export function reduceLiveEvent(
  state: LiveMonitorState,
  event: LiveEventDto,
): LiveMonitorState {
  if (event.event === "fee-snapshot") {
    return { ...state, fee: event.data.data };
  }

  if (event.event === "block-added") {
    const block = event.data.data;
    const blocks = [
      block,
      ...state.blocks.filter((item) => item.number !== block.number),
    ].slice(0, 20);

    return { ...state, blocks };
  }

  const change = event.data.data;

  return {
    ...state,
    blocks: state.blocks.map((block) =>
      block.number === change.number &&
      block.hash.toLowerCase() === change.hash.toLowerCase()
        ? { ...block, finality: change.finality }
        : block,
    ),
  };
}
