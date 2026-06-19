import { describe, expect, it } from "vitest";
import { getAddress } from "viem";
import { loadSnapshot, parseSnapshotText } from "../src/snapshot.js";

describe("snapshot parser", () => {
  it("preserves unsafe JSON integer tokens exactly", async () => {
    const snapshot = await loadSnapshot();
    const address = getAddress("0x1d0a2944a5BD421C5d84aE2F935bAFCD6bBE3d16");

    expect(snapshot.get(address)).toBe("11457663322397255498");
  });

  it("rejects duplicate addresses after normalization", () => {
    expect(() =>
      parseSnapshotText(`{
        "0x1d0a2944a5BD421C5d84aE2F935bAFCD6bBE3d16": 1,
        "0x1D0A2944A5bd421c5D84Ae2f935Bafcd6BBE3d16": 2
      }`)
    ).toThrow(/Duplicate snapshot address/);
  });
});
