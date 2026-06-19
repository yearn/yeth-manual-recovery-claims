import type { Address, Hex } from "viem";

export const LEDGER_STATUSES = [
  "needs_signature",
  "signature_received",
  "verified",
  "ready_to_pay",
  "paid",
  "claimable_zeroed",
  "exception"
] as const;

export type LedgerStatus = (typeof LEDGER_STATUSES)[number];

export interface SnapshotEntry {
  address: Address;
  amountWei: string;
}

export type SnapshotMap = Map<Address, string>;

export interface ManualClaimRow {
  address: Address;
  recipient: Address;
  snapshotAmountWei: string;
  claimableWei: string;
  recoveryRateWei: string;
  manualPayoutWei: string;
  signature: Hex | null;
  signedMessage: string | null;
  signatureUrl: string | null;
  githubIssueUrl: string;
  status: LedgerStatus;
  payoutToken: "WETH";
  payoutTxHash: Hex | null;
  claimableZeroedTxHash: Hex | null;
  extractionBlock: string;
  notes: string;
}

export interface LedgerValidationIssue {
  line?: number;
  address?: string;
  message: string;
}

export interface LedgerValidationResult {
  valid: boolean;
  rows: ManualClaimRow[];
  issues: LedgerValidationIssue[];
}

export interface ClaimContractState {
  recoveryRateWei: string;
  deadline: string;
  unclaimedWei: string;
  claimedWei: string;
  exitedWei: string;
}

export interface UnclaimedClaimRow {
  address: Address;
  snapshotAmountWei: string;
  claimableWei: string;
  manualPayoutWei: string;
  extractionBlock: string;
}

export interface UnclaimedClaimsExport {
  metadata: {
    extractedAt: string;
    extractionBlock: string;
    claimContract: Address;
    recoveryRateWei: string;
    deadline: string;
    claimedWei: string;
    exitedWei: string;
    unclaimedWei: string;
    rowCount: number;
    sumClaimableWei: string;
    sumManualPayoutWei: string;
  };
  rows: UnclaimedClaimRow[];
}
