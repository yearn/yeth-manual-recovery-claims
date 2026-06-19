import { readFile } from "node:fs/promises";
import { Command } from "commander";
import { getAddress, verifyMessage } from "viem";
import type { Hex } from "viem";
import { assertSignedMessageMatchesLedgerRow } from "../src/claim-message.js";
import { DEFAULT_GENERATED_DIR, DEFAULT_LEDGER_PATH } from "../src/constants.js";
import { findUnclaimedRow, loadUnclaimedClaimsExport } from "../src/unclaimed.js";
import { upsertManualClaimRow } from "../src/ledger-write.js";
import type { ManualClaimRow } from "../src/types.js";

const program = new Command()
  .description("Verify a signature and upsert a manual claim ledger row")
  .requiredOption("--address <address>", "snapshot claimant address")
  .requiredOption("--recipient <address>", "manual payout recipient address")
  .requiredOption("--issue-url <url>", "GitHub claim issue URL")
  .requiredOption("--signature-url <url>", "Etherscan verified signature URL")
  .requiredOption("--signature <hex>", "raw signature")
  .requiredOption("--signed-message-file <path>", "path to exact signed message")
  .option("--notes <notes>", "ledger notes", "")
  .option("--status <status>", "ledger status", "ready_to_pay")
  .option("--inventory <path>", "latest unclaimed inventory path", `${DEFAULT_GENERATED_DIR}/unclaimed-claims.latest.json`)
  .option("--ledger <path>", "manual claim ledger path", DEFAULT_LEDGER_PATH);

program.parse();
const options = program.opts<{
  address: string;
  recipient: string;
  issueUrl: string;
  signatureUrl: string;
  signature: Hex;
  signedMessageFile: string;
  notes: string;
  status: ManualClaimRow["status"];
  inventory: string;
  ledger: string;
}>();

try {
  if (!["signature_received", "verified", "ready_to_pay"].includes(options.status)) {
    throw new Error("--status must be signature_received, verified, or ready_to_pay");
  }

  const address = getAddress(options.address);
  const recipient = getAddress(options.recipient);
  const signedMessage = await readFile(options.signedMessageFile, "utf8");
  const inventory = await loadUnclaimedClaimsExport(options.inventory);
  const unclaimed = findUnclaimedRow(inventory, address);

  const row: ManualClaimRow = {
    address,
    recipient,
    snapshotAmountWei: unclaimed.snapshotAmountWei,
    claimableWei: unclaimed.claimableWei,
    recoveryRateWei: inventory.metadata.recoveryRateWei,
    manualPayoutWei: unclaimed.manualPayoutWei,
    signature: options.signature,
    signedMessage,
    signatureUrl: options.signatureUrl,
    githubIssueUrl: options.issueUrl,
    status: options.status,
    payoutToken: "WETH",
    payoutTxHash: null,
    claimableZeroedTxHash: null,
    extractionBlock: inventory.metadata.extractionBlock,
    notes: options.notes
  };

  assertSignedMessageMatchesLedgerRow(row);

  const verified = await verifyMessage({
    address,
    message: signedMessage,
    signature: options.signature
  });
  if (!verified) {
    throw new Error(`Signature does not verify for ${address}`);
  }

  await upsertManualClaimRow(row, options.ledger);
  console.log(`Upserted ${options.status} claim row for ${address}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
