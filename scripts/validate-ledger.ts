import { Command } from "commander";
import { validateLedgerFile } from "../src/ledger.js";
import { DEFAULT_LEDGER_PATH, DEFAULT_SNAPSHOT_PATH } from "../src/constants.js";

const program = new Command()
  .description("Validate the manual yETH recovery claim ledger")
  .option("--ledger <path>", "path to manual-claims.jsonl", DEFAULT_LEDGER_PATH)
  .option("--snapshot <path>", "path to snapshot.json", DEFAULT_SNAPSHOT_PATH);

program.parse();
const options = program.opts<{ ledger: string; snapshot: string }>();

try {
  const result = await validateLedgerFile(options.ledger, options.snapshot);
  if (!result.valid) {
    for (const issue of result.issues) {
      const prefix = issue.line === undefined ? "ledger" : `line ${issue.line}`;
      const address = issue.address === undefined ? "" : ` (${issue.address})`;
      console.error(`${prefix}${address}: ${issue.message}`);
    }
    process.exitCode = 1;
  } else {
    console.log(`Ledger valid: ${result.rows.length} row(s)`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
