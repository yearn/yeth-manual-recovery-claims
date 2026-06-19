import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { Command } from "commander";
import { DEFAULT_GENERATED_DIR, DEFAULT_LEDGER_PATH } from "../src/constants.js";
import { writeCsv } from "../src/csv.js";
import { readManualClaims } from "../src/ledger.js";

const columns = [
  "address",
  "recipient",
  "status",
  "snapshotAmountWei",
  "claimableWei",
  "recoveryRateWei",
  "manualPayoutWei",
  "payoutToken",
  "signatureUrl",
  "githubIssueUrl",
  "payoutTxHash",
  "claimableZeroedTxHash",
  "extractionBlock",
  "notes"
].map((key) => ({ key, header: key }));

const program = new Command()
  .description("Export manual yETH recovery claims ledger to CSV")
  .option("--ledger <path>", "path to manual-claims.jsonl", DEFAULT_LEDGER_PATH)
  .option("--out <path>", "output CSV path", `${DEFAULT_GENERATED_DIR}/manual-claims.csv`);

program.parse();
const options = program.opts<{ ledger: string; out: string }>();

try {
  const rows = await readManualClaims(options.ledger);
  const csv = writeCsv(columns, rows as unknown as Record<string, unknown>[]);
  await mkdir(dirname(options.out), { recursive: true });
  await writeFile(options.out, csv);
  console.log(`Wrote ${options.out}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
