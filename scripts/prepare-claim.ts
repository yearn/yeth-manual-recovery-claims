import { writeFile } from "node:fs/promises";
import { Command } from "commander";
import { getAddress } from "viem";
import { buildClaimMessage } from "../src/claim-message.js";
import { DEFAULT_GENERATED_DIR } from "../src/constants.js";
import { findUnclaimedRow, loadUnclaimedClaimsExport } from "../src/unclaimed.js";

const program = new Command()
  .description("Prepare the exact signing message for a manual yETH recovery claim")
  .requiredOption("--address <address>", "snapshot claimant address")
  .requiredOption("--recipient <address>", "manual payout recipient address")
  .requiredOption("--issue-url <url>", "GitHub claim issue URL")
  .option("--date <yyyy-mm-dd>", "message date", new Date().toISOString().slice(0, 10))
  .option("--inventory <path>", "latest unclaimed inventory path", `${DEFAULT_GENERATED_DIR}/unclaimed-claims.latest.json`)
  .option("--out-md <path>", "write a GitHub issue comment markdown file");

program.parse();
const options = program.opts<{
  address: string;
  recipient: string;
  issueUrl: string;
  date: string;
  inventory: string;
  outMd?: string;
}>();

try {
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(options.date)) {
    throw new Error("--date must use YYYY-MM-DD");
  }

  const address = getAddress(options.address);
  const recipient = getAddress(options.recipient);
  const inventory = await loadUnclaimedClaimsExport(options.inventory);
  const unclaimed = findUnclaimedRow(inventory, address);
  const signedMessage = buildClaimMessage({
    address,
    recipient,
    snapshotAmountWei: unclaimed.snapshotAmountWei,
    manualPayoutWei: unclaimed.manualPayoutWei,
    date: options.date
  });

  const markdown = [
    "Use this exact message for the wallet signature:",
    "",
    "```text",
    signedMessage,
    "```",
    "",
    "Claim facts from the latest unclaimed inventory:",
    "",
    `- Address: \`${address}\``,
    `- Recipient: \`${recipient}\``,
    `- Snapshot amount wei: \`${unclaimed.snapshotAmountWei}\``,
    `- Claimable wei: \`${unclaimed.claimableWei}\``,
    `- Recovery rate wei: \`${inventory.metadata.recoveryRateWei}\``,
    `- Manual payout wei: \`${unclaimed.manualPayoutWei}\``,
    `- Extraction block: \`${inventory.metadata.extractionBlock}\``,
    "",
    "After signing, reply with the Etherscan verified signature URL, raw signature, and the exact signed message. Do not share a seed phrase or private key, and do not sign a transaction for verification.",
    "",
    `Issue: ${options.issueUrl}`
  ].join("\n");

  if (options.outMd !== undefined) {
    await writeFile(options.outMd, `${markdown}\n`);
  } else {
    console.log(markdown);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
