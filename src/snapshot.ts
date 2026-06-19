import { readFile } from "node:fs/promises";
import { getAddress } from "viem";
import type { Address } from "viem";
import { DEFAULT_SNAPSHOT_PATH } from "./constants.js";
import { isDecimalIntegerString } from "./math.js";
import type { SnapshotEntry, SnapshotMap } from "./types.js";

interface RawSnapshotPair {
  key: string;
  value: string;
}

export async function loadSnapshot(snapshotPath = DEFAULT_SNAPSHOT_PATH): Promise<SnapshotMap> {
  const source = await readFile(snapshotPath, "utf8");
  return parseSnapshotText(source);
}

export function parseSnapshotText(source: string): SnapshotMap {
  const pairs = tokenizeSnapshotObject(source);
  const snapshot: SnapshotMap = new Map();

  for (const pair of pairs) {
    let address: Address;
    try {
      address = getAddress(pair.key);
    } catch {
      throw new Error(`Invalid snapshot address key: ${pair.key}`);
    }

    if (!isDecimalIntegerString(pair.value)) {
      throw new Error(`Snapshot value for ${pair.key} must be a non-negative integer`);
    }

    if (snapshot.has(address)) {
      throw new Error(`Duplicate snapshot address after normalization: ${address}`);
    }

    snapshot.set(address, pair.value);
  }

  return snapshot;
}

export function snapshotEntries(snapshot: SnapshotMap): SnapshotEntry[] {
  return [...snapshot.entries()]
    .map(([address, amountWei]) => ({ address, amountWei }))
    .sort((a, b) => a.address.toLowerCase().localeCompare(b.address.toLowerCase()));
}

function tokenizeSnapshotObject(source: string): RawSnapshotPair[] {
  const trimmed = source.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    throw new Error("Snapshot must be a JSON object");
  }

  const pairs: RawSnapshotPair[] = [];
  let index = 1;
  const end = trimmed.length - 1;

  while (index < end) {
    index = skipWhitespace(trimmed, index);
    if (index >= end) {
      break;
    }

    const keyResult = readJsonString(trimmed, index);
    const key = keyResult.value;
    index = skipWhitespace(trimmed, keyResult.nextIndex);

    if (trimmed[index] !== ":") {
      throw new Error(`Expected ':' after snapshot key ${key}`);
    }
    index = skipWhitespace(trimmed, index + 1);

    const valueResult = readSnapshotInteger(trimmed, index);
    pairs.push({ key, value: valueResult.value });
    index = skipWhitespace(trimmed, valueResult.nextIndex);

    if (index < end) {
      if (trimmed[index] !== ",") {
        throw new Error(`Expected ',' after snapshot value for ${key}`);
      }
      index += 1;
      if (skipWhitespace(trimmed, index) >= end) {
        throw new Error("Snapshot object must not contain a trailing comma");
      }
    }
  }

  return pairs;
}

function skipWhitespace(source: string, index: number): number {
  while (index < source.length && /\s/.test(source[index] ?? "")) {
    index += 1;
  }
  return index;
}

function readJsonString(source: string, index: number): { value: string; nextIndex: number } {
  if (source[index] !== "\"") {
    throw new Error("Expected JSON string");
  }

  let cursor = index + 1;
  let escaped = false;
  while (cursor < source.length) {
    const char = source[cursor];
    if (escaped) {
      escaped = false;
    } else if (char === "\\") {
      escaped = true;
    } else if (char === "\"") {
      const raw = source.slice(index, cursor + 1);
      return { value: JSON.parse(raw) as string, nextIndex: cursor + 1 };
    }
    cursor += 1;
  }

  throw new Error("Unterminated JSON string");
}

function readSnapshotInteger(source: string, index: number): { value: string; nextIndex: number } {
  if (source[index] === "\"") {
    const stringResult = readJsonString(source, index);
    if (!isDecimalIntegerString(stringResult.value)) {
      throw new Error("Snapshot string value must contain only decimal digits");
    }
    return stringResult;
  }

  let cursor = index;
  while (cursor < source.length && /[0-9]/.test(source[cursor] ?? "")) {
    cursor += 1;
  }

  if (cursor === index) {
    throw new Error("Snapshot value must be an integer");
  }

  return { value: source.slice(index, cursor), nextIndex: cursor };
}
