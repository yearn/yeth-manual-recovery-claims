import { readFile } from "node:fs/promises";
import { getAddress, isHex, verifyMessage } from "viem";
import type { Address, Hex } from "viem";
import { z } from "zod";
import { assertSignedMessageMatchesLedgerRow } from "./claim-message.js";
import { DEFAULT_LEDGER_PATH, DEFAULT_SNAPSHOT_PATH } from "./constants.js";
import { calculateManualPayoutWeiString, isDecimalIntegerString, parseDecimalInteger } from "./math.js";
import { loadSnapshot } from "./snapshot.js";
import { LEDGER_STATUSES } from "./types.js";
import type { LedgerValidationIssue, LedgerValidationResult, ManualClaimRow, SnapshotMap } from "./types.js";

const SIGNATURE_REQUIRED_STATUSES = new Set([
  "signature_received",
  "verified",
  "ready_to_pay",
  "paid",
  "claimable_zeroed"
]);

const PAID_STATUSES = new Set(["paid", "claimable_zeroed"]);

const TX_HASH_PATTERN = /^0x[a-fA-F0-9]{64}$/;

const nullableString = z.union([z.string(), z.null()]);
const nullableHex = z.union([z.string().refine((value) => isHex(value), "must be hex"), z.null()]);

const ledgerRowSchema = z
  .object({
    address: z.string(),
    recipient: z.string(),
    snapshotAmountWei: z.string().refine(isDecimalIntegerString, "must be a decimal string"),
    claimableWei: z.string().refine(isDecimalIntegerString, "must be a decimal string"),
    recoveryRateWei: z.string().refine(isDecimalIntegerString, "must be a decimal string"),
    manualPayoutWei: z.string().refine(isDecimalIntegerString, "must be a decimal string"),
    signature: nullableHex,
    signedMessage: nullableString,
    signatureUrl: nullableString,
    githubIssueUrl: z.string().url(),
    status: z.enum(LEDGER_STATUSES),
    payoutToken: z.literal("WETH"),
    payoutTxHash: nullableString,
    claimableZeroedTxHash: nullableString,
    extractionBlock: z.string().refine(isDecimalIntegerString, "must be a decimal string"),
    notes: z.string()
  })
  .strict();

export async function validateLedgerFile(
  ledgerPath = DEFAULT_LEDGER_PATH,
  snapshotPath = DEFAULT_SNAPSHOT_PATH
): Promise<LedgerValidationResult> {
  const [rowsWithLines, snapshot] = await Promise.all([readLedgerRows(ledgerPath), loadSnapshot(snapshotPath)]);
  return validateLedgerRows(rowsWithLines, snapshot);
}

export async function readManualClaims(ledgerPath = DEFAULT_LEDGER_PATH): Promise<ManualClaimRow[]> {
  const result = await validateLedgerFile(ledgerPath);
  if (!result.valid) {
    const message = result.issues
      .map((issue) => {
        const prefix = issue.line === undefined ? "ledger" : `line ${issue.line}`;
        return `${prefix}: ${issue.message}`;
      })
      .join("\n");
    throw new Error(`Ledger is invalid:\n${message}`);
  }

  return result.rows;
}

export async function validateLedgerRows(
  rowsWithLines: Array<{ line: number; row: unknown }>,
  snapshot: SnapshotMap
): Promise<LedgerValidationResult> {
  const issues: LedgerValidationIssue[] = [];
  const rows: ManualClaimRow[] = [];
  const paidByAddress = new Map<Address, number>();

  for (const { line, row } of rowsWithLines) {
    const parsed = ledgerRowSchema.safeParse(row);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        issues.push({ line, message: `${issue.path.join(".") || "row"}: ${issue.message}` });
      }
      continue;
    }

    const normalized = normalizeLedgerRow(parsed.data, line, issues);
    if (normalized === null) {
      continue;
    }

    const snapshotAmountWei = snapshot.get(normalized.address);
    if (snapshotAmountWei === undefined) {
      issues.push({ line, address: normalized.address, message: "address does not exist in source snapshot" });
    } else if (normalized.snapshotAmountWei !== snapshotAmountWei) {
      issues.push({
        line,
        address: normalized.address,
        message: `snapshotAmountWei must equal snapshot value ${snapshotAmountWei}`
      });
    }

    const expectedManualPayoutWei = calculateManualPayoutWeiString(
      normalized.claimableWei,
      normalized.recoveryRateWei
    );
    if (normalized.manualPayoutWei !== expectedManualPayoutWei) {
      issues.push({
        line,
        address: normalized.address,
        message: `manualPayoutWei must equal ${expectedManualPayoutWei}`
      });
    }

    if (
      parseDecimalInteger(normalized.manualPayoutWei, "manualPayoutWei") >
      parseDecimalInteger(normalized.claimableWei, "claimableWei")
    ) {
      issues.push({ line, address: normalized.address, message: "manualPayoutWei must be <= claimableWei" });
    }

    validateStatusRequirements(normalized, line, issues);
    validateSignedMessage(normalized, line, issues);
    await validateSignature(normalized, line, issues);

    if (PAID_STATUSES.has(normalized.status)) {
      const existingLine = paidByAddress.get(normalized.address);
      if (existingLine !== undefined) {
        issues.push({
          line,
          address: normalized.address,
          message: `duplicate paid claim for address; first paid row is on line ${existingLine}`
        });
      } else {
        paidByAddress.set(normalized.address, line);
      }
    }

    rows.push(normalized);
  }

  return { valid: issues.length === 0, rows, issues };
}

export async function readLedgerRows(ledgerPath = DEFAULT_LEDGER_PATH): Promise<Array<{ line: number; row: unknown }>> {
  const source = await readFile(ledgerPath, "utf8");
  if (source.length === 0) {
    return [];
  }

  const rows: Array<{ line: number; row: unknown }> = [];
  const lines = source.split(/\r?\n/);
  for (const [index, lineSource] of lines.entries()) {
    if (lineSource.length === 0 && index === lines.length - 1) {
      continue;
    }
    if (lineSource.trim().length === 0) {
      throw new Error(`Line ${index + 1}: blank lines are not valid JSONL rows`);
    }

    try {
      rows.push({ line: index + 1, row: JSON.parse(lineSource) as unknown });
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown JSON parse error";
      throw new Error(`Line ${index + 1}: invalid JSON: ${message}`);
    }
  }

  return rows;
}

function normalizeLedgerRow(
  row: z.infer<typeof ledgerRowSchema>,
  line: number,
  issues: LedgerValidationIssue[]
): ManualClaimRow | null {
  const address = normalizeChecksummedAddress(row.address, "address", line, issues);
  const recipient = normalizeChecksummedAddress(row.recipient, "recipient", line, issues);
  if (address === null || recipient === null) {
    return null;
  }

  const payoutTxHash = normalizeOptionalTxHash(row.payoutTxHash, "payoutTxHash", line, issues);
  const claimableZeroedTxHash = normalizeOptionalTxHash(row.claimableZeroedTxHash, "claimableZeroedTxHash", line, issues);
  if (payoutTxHash === undefined || claimableZeroedTxHash === undefined) {
    return null;
  }

  return {
    ...row,
    address,
    recipient,
    signature: row.signature as Hex | null,
    payoutTxHash,
    claimableZeroedTxHash
  };
}

function normalizeChecksummedAddress(
  value: string,
  fieldName: string,
  line: number,
  issues: LedgerValidationIssue[]
): Address | null {
  try {
    const checksummed = getAddress(value);
    if (value !== checksummed) {
      issues.push({ line, address: value, message: `${fieldName} must be a checksummed Ethereum address` });
      return null;
    }
    return checksummed;
  } catch {
    issues.push({ line, address: value, message: `${fieldName} must be a valid Ethereum address` });
    return null;
  }
}

function normalizeOptionalTxHash(
  value: string | null,
  fieldName: string,
  line: number,
  issues: LedgerValidationIssue[]
): Hex | null | undefined {
  if (value === null || value === "") {
    return null;
  }

  if (!TX_HASH_PATTERN.test(value)) {
    issues.push({ line, message: `${fieldName} must be a transaction hash or null` });
    return undefined;
  }

  return value as Hex;
}

function requirePresent(
  value: string | null,
  fieldName: keyof ManualClaimRow,
  row: ManualClaimRow,
  line: number,
  issues: LedgerValidationIssue[]
): boolean {
  if (value === null || value.trim() === "") {
    issues.push({ line, address: row.address, message: `${String(fieldName)} is required for status ${row.status}` });
    return false;
  }

  return true;
}

function validateStatusRequirements(row: ManualClaimRow, line: number, issues: LedgerValidationIssue[]): void {
  if (SIGNATURE_REQUIRED_STATUSES.has(row.status)) {
    requirePresent(row.signature, "signature", row, line, issues);
    requirePresent(row.signedMessage, "signedMessage", row, line, issues);
    if (requirePresent(row.signatureUrl, "signatureUrl", row, line, issues)) {
      try {
        new URL(row.signatureUrl as string);
      } catch {
        issues.push({ line, address: row.address, message: "signatureUrl must be a valid URL" });
      }
    }
  }

  if ((row.status === "paid" || row.status === "claimable_zeroed") && row.payoutTxHash === null) {
    issues.push({ line, address: row.address, message: `payoutTxHash is required for status ${row.status}` });
  }

  if (row.status === "claimable_zeroed" && row.claimableZeroedTxHash === null) {
    issues.push({ line, address: row.address, message: "claimableZeroedTxHash is required for status claimable_zeroed" });
  }

  if (row.status === "exception" && row.notes.trim() === "") {
    issues.push({ line, address: row.address, message: "status exception requires non-empty notes" });
  }
}

async function validateSignature(row: ManualClaimRow, line: number, issues: LedgerValidationIssue[]): Promise<void> {
  if (row.signature === null || row.signedMessage === null || row.signedMessage.trim() === "") {
    return;
  }

  try {
    const verified = await verifyMessage({
      address: row.address,
      message: row.signedMessage,
      signature: row.signature
    });

    if (!verified) {
      issues.push({ line, address: row.address, message: "signature does not verify for address" });
    }
  } catch {
    issues.push({ line, address: row.address, message: "signature does not verify for address" });
  }
}

function validateSignedMessage(row: ManualClaimRow, line: number, issues: LedgerValidationIssue[]): void {
  if (row.signedMessage === null || row.signedMessage.trim() === "") {
    return;
  }

  try {
    assertSignedMessageMatchesLedgerRow(row);
  } catch (error) {
    const message = error instanceof Error ? error.message : "signedMessage does not match ledger row";
    issues.push({ line, address: row.address, message });
  }
}
