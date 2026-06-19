import { writeFile } from "node:fs/promises";
import { getAddress } from "viem";
import { DEFAULT_LEDGER_PATH } from "./constants.js";
import { readManualClaims } from "./ledger.js";
import type { ManualClaimRow } from "./types.js";

const LEDGER_FIELD_ORDER = [
  "address",
  "recipient",
  "snapshotAmountWei",
  "claimableWei",
  "recoveryRateWei",
  "manualPayoutWei",
  "signature",
  "signedMessage",
  "signatureUrl",
  "githubIssueUrl",
  "status",
  "payoutToken",
  "payoutTxHash",
  "claimableZeroedTxHash",
  "extractionBlock",
  "notes"
] as const;

export async function upsertManualClaimRow(row: ManualClaimRow, ledgerPath = DEFAULT_LEDGER_PATH): Promise<void> {
  const rows = await readManualClaims(ledgerPath);
  const index = rows.findIndex((candidate) => candidate.address === row.address);

  if (index === -1) {
    rows.push(row);
  } else {
    const existing = rows[index];
    if (existing === undefined) {
      throw new Error("Internal error: missing existing ledger row");
    }
    if (existing.status === "paid" || existing.status === "claimable_zeroed") {
      throw new Error(`Refusing to overwrite ${existing.status} row for ${row.address}`);
    }
    rows[index] = row;
  }

  await writeManualClaims(rows, ledgerPath);
}

export async function updateManualClaimRow(
  address: string,
  update: (row: ManualClaimRow) => ManualClaimRow | Promise<ManualClaimRow>,
  ledgerPath = DEFAULT_LEDGER_PATH
): Promise<void> {
  const checksummed = getAddress(address);
  const rows = await readManualClaims(ledgerPath);
  const index = rows.findIndex((candidate) => candidate.address === checksummed);
  if (index === -1 || rows[index] === undefined) {
    throw new Error(`${checksummed} does not exist in the manual claim ledger`);
  }

  rows[index] = await update(rows[index]);
  await writeManualClaims(rows, ledgerPath);
}

export async function writeManualClaims(rows: ManualClaimRow[], ledgerPath = DEFAULT_LEDGER_PATH): Promise<void> {
  const sorted = [...rows].sort((a, b) => a.address.toLowerCase().localeCompare(b.address.toLowerCase()));
  const body = sorted.map((row) => JSON.stringify(orderLedgerRow(row))).join("\n");
  await writeFile(ledgerPath, body.length === 0 ? "" : `${body}\n`);
}

function orderLedgerRow(row: ManualClaimRow): ManualClaimRow {
  return Object.fromEntries(LEDGER_FIELD_ORDER.map((key) => [key, row[key]])) as unknown as ManualClaimRow;
}
