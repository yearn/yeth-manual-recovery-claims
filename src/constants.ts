import { getAddress } from "viem";

export const SNAPSHOT_BLOCK = 23914085;

export const CLAIM_CONTRACT = getAddress("0x9564850c7090B13794e6d1164B0826C0aEFf3143");
export const YIELD_VAULT = getAddress("0xd7a540ba3626c0aa66e7DB4088971d0CD64695B6");
export const RECOVERY_VAULT = getAddress("0xE5387cd454Dcc542421c069C009D915Ab9EFaaFd");
export const WETH = getAddress("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2");

export const ASSET_SYMBOL = "WETH";

export const DEFAULT_SNAPSHOT_PATH = "data/source/snapshot.json";
export const DEFAULT_LEDGER_PATH = "data/manual-claims.jsonl";
export const DEFAULT_GENERATED_DIR = "data/generated";
