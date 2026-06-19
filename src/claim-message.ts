import { getAddress } from "viem";
import { SNAPSHOT_BLOCK } from "./constants.js";
import { formatWeiAsEthDecimal } from "./math.js";
import type { ManualClaimRow } from "./types.js";

export const CLAIM_MESSAGE_ACKNOWLEDGEMENT =
  "I understand this is a manual late claim for recovered principal only and does not mint Recovery Vault shares or include accrued yield.";

export interface ClaimMessageValues {
  address: string;
  recipient: string;
  snapshotAmountWei: string;
  manualPayoutWei: string;
  date: string;
}

export function buildClaimMessage(values: ClaimMessageValues): string {
  return [
    "yETH manual late claim",
    `Wallet: ${getAddress(values.address)}`,
    `Recipient: ${getAddress(values.recipient)}`,
    `Snapshot block: ${SNAPSHOT_BLOCK}`,
    `Snapshot amount: ${formatWeiAsEthDecimal(values.snapshotAmountWei)} ETH`,
    `Manual settlement amount: ${formatWeiAsEthDecimal(values.manualPayoutWei)} WETH`,
    `Date: ${values.date}`,
    CLAIM_MESSAGE_ACKNOWLEDGEMENT
  ].join("\n");
}

export function assertSignedMessageMatchesLedgerRow(row: ManualClaimRow): void {
  if (row.signedMessage === null) {
    throw new Error("signedMessage is required");
  }

  const date = extractMessageDate(row.signedMessage);
  const expected = buildClaimMessage({
    address: row.address,
    recipient: row.recipient,
    snapshotAmountWei: row.snapshotAmountWei,
    manualPayoutWei: row.manualPayoutWei,
    date
  });

  if (row.signedMessage !== expected) {
    throw new Error("signedMessage does not match the expected yETH manual claim template and ledger values");
  }
}

export function extractMessageDate(message: string): string {
  const lines = message.split("\n");
  const dateLine = lines[6];
  const match = dateLine?.match(/^Date: ([0-9]{4}-[0-9]{2}-[0-9]{2})$/);
  if (match?.[1] === undefined) {
    throw new Error("signedMessage must contain Date: <YYYY-MM-DD> on line 7");
  }

  return match[1];
}
