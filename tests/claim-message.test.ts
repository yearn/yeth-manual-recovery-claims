import { describe, expect, it } from "vitest";
import { buildClaimMessage, assertSignedMessageMatchesLedgerRow } from "../src/claim-message.js";
import type { ManualClaimRow } from "../src/types.js";

function rowWithMessage(signedMessage: string): ManualClaimRow {
  return {
    address: "0x1d0a2944a5BD421C5d84aE2F935bAFCD6bBE3d16",
    recipient: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    snapshotAmountWei: "11457663322397255498",
    claimableWei: "1000000000000000000",
    recoveryRateWei: "319607900000000000",
    manualPayoutWei: "319607900000000000",
    signature: null,
    signedMessage,
    signatureUrl: null,
    githubIssueUrl: "https://github.com/yearn/yeth-manual-recovery-claims/issues/1",
    status: "needs_signature",
    payoutToken: "WETH",
    payoutTxHash: null,
    claimableZeroedTxHash: null,
    extractionBlock: "25351790",
    notes: ""
  };
}

describe("claim message", () => {
  it("builds the exact expected yETH manual claim message", () => {
    const message = buildClaimMessage({
      address: "0x1d0a2944a5BD421C5d84aE2F935bAFCD6bBE3d16",
      recipient: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
      snapshotAmountWei: "11457663322397255498",
      manualPayoutWei: "319607900000000000",
      date: "2026-06-19"
    });

    expect(message).toBe(
      [
        "yETH manual late claim",
        "Wallet: 0x1d0a2944a5BD421C5d84aE2F935bAFCD6bBE3d16",
        "Recipient: 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
        "Snapshot block: 23914085",
        "Snapshot amount: 11.457663322397255498 ETH",
        "Manual settlement amount: 0.3196079 WETH",
        "Date: 2026-06-19",
        "I understand this is a manual late claim for recovered principal only and does not mint Recovery Vault shares or include accrued yield."
      ].join("\n")
    );
  });

  it("rejects signed messages whose amount no longer matches the ledger row", () => {
    const message = buildClaimMessage({
      address: "0x1d0a2944a5BD421C5d84aE2F935bAFCD6bBE3d16",
      recipient: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
      snapshotAmountWei: "11457663322397255498",
      manualPayoutWei: "1",
      date: "2026-06-19"
    });

    expect(() => assertSignedMessageMatchesLedgerRow(rowWithMessage(message))).toThrow(/signedMessage/);
  });
});
