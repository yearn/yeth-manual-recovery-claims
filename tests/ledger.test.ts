import { describe, expect, it } from "vitest";
import type { ManualClaimRow } from "../src/types.js";
import { loadSnapshot } from "../src/snapshot.js";
import { validateLedgerRows } from "../src/ledger.js";

const snapshotAddress = "0x1d0a2944a5BD421C5d84aE2F935bAFCD6bBE3d16";
const snapshotAmountWei = "11457663322397255498";

function baseRow(overrides: Partial<ManualClaimRow> = {}): ManualClaimRow {
  return {
    address: snapshotAddress,
    recipient: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    snapshotAmountWei,
    claimableWei: "1000000000000000000",
    recoveryRateWei: "319607900000000000",
    manualPayoutWei: "319607900000000000",
    signature: null,
    signedMessage: null,
    signatureUrl: null,
    githubIssueUrl: "https://github.com/yearn/yeth-manual-recovery-claims/issues/1",
    status: "needs_signature",
    payoutToken: "WETH",
    payoutTxHash: null,
    claimableZeroedTxHash: null,
    extractionBlock: "23914085",
    notes: "",
    ...overrides
  };
}

describe("ledger validation", () => {
  it("accepts an empty ledger", async () => {
    const snapshot = await loadSnapshot();
    const result = await validateLedgerRows([], snapshot);

    expect(result.valid).toBe(true);
    expect(result.rows).toEqual([]);
  });

  it("rejects snapshot amount mismatches", async () => {
    const snapshot = await loadSnapshot();
    const result = await validateLedgerRows([{ line: 1, row: baseRow({ snapshotAmountWei: "1" }) }], snapshot);

    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.message.includes("snapshotAmountWei"))).toBe(true);
  });

  it("rejects manual payout mismatches", async () => {
    const snapshot = await loadSnapshot();
    const result = await validateLedgerRows([{ line: 1, row: baseRow({ manualPayoutWei: "1" }) }], snapshot);

    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.message.includes("manualPayoutWei"))).toBe(true);
  });

  it("rejects duplicate paid claims for the same address", async () => {
    const snapshot = await loadSnapshot();
    const paidRow = baseRow({
      status: "paid",
      signature: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      signedMessage: "bad signature",
      signatureUrl: "https://etherscan.io/verifiedSignatures/1",
      payoutTxHash: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    });
    const result = await validateLedgerRows(
      [
        { line: 1, row: paidRow },
        { line: 2, row: paidRow }
      ],
      snapshot
    );

    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.message.includes("duplicate paid claim"))).toBe(true);
  });

  it("rejects mismatched signatures", async () => {
    const snapshot = await loadSnapshot();
    const result = await validateLedgerRows(
      [
        {
          line: 1,
          row: baseRow({
            status: "signature_received",
            signature: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            signedMessage: "not signed by the snapshot address",
            signatureUrl: "https://etherscan.io/verifiedSignatures/1"
          })
        }
      ],
      snapshot
    );

    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.message.includes("signature"))).toBe(true);
  });

  it("requires notes for exception rows", async () => {
    const snapshot = await loadSnapshot();
    const result = await validateLedgerRows([{ line: 1, row: baseRow({ status: "exception" }) }], snapshot);

    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.message.includes("exception"))).toBe(true);
  });
});
