import { Command } from "commander";
import { getAddress, isHash, parseAbi, parseEventLogs, toEventSelector } from "viem";
import type { Hex, PublicClient } from "viem";
import { CLAIM_CONTRACT, DEFAULT_LEDGER_PATH, WETH } from "../src/constants.js";
import { CLAIM_CONTRACT_ABI } from "../src/abi.js";
import { createEthereumClient } from "../src/ethereum.js";
import { parseDecimalInteger } from "../src/math.js";
import { updateManualClaimRow } from "../src/ledger-write.js";
import type { ManualClaimRow } from "../src/types.js";

const WETH_TRANSFER_ABI = parseAbi(["event Transfer(address indexed from, address indexed to, uint256 value)"]);
const TRANSFER_TOPIC = toEventSelector("Transfer(address,address,uint256)");

const program = new Command()
  .description("Record and verify a manual claim payout or claimable-zeroing transaction")
  .requiredOption("--address <address>", "snapshot claimant address")
  .requiredOption("--tx-kind <kind>", "transaction kind: payout or zeroing")
  .requiredOption("--tx-hash <hash>", "transaction hash")
  .option("--ledger <path>", "manual claim ledger path", DEFAULT_LEDGER_PATH);

program.parse();
const options = program.opts<{
  address: string;
  txKind: "payout" | "zeroing";
  txHash: Hex;
  ledger: string;
}>();

try {
  const rpcUrl = process.env.ETH_RPC_URL;
  if (rpcUrl === undefined || rpcUrl.trim() === "") {
    throw new Error("ETH_RPC_URL is required");
  }
  if (options.txKind !== "payout" && options.txKind !== "zeroing") {
    throw new Error("--tx-kind must be payout or zeroing");
  }
  if (!isHash(options.txHash)) {
    throw new Error("--tx-hash must be a transaction hash");
  }

  const address = getAddress(options.address);
  const client = createEthereumClient(rpcUrl);

  await updateManualClaimRow(
    address,
    (row) => verifyAndUpdateRow(client, row, options.txKind, options.txHash),
    options.ledger
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

async function verifyAndUpdateRow(
  client: PublicClient,
  row: ManualClaimRow,
  txKind: "payout" | "zeroing",
  txHash: Hex
): Promise<ManualClaimRow> {
  if (txKind === "payout") {
    await verifyPayoutTx(client, row, txHash);
    console.log(`Verified payout transaction for ${row.address}`);
    return { ...row, status: "paid", payoutTxHash: txHash };
  }

  if (row.payoutTxHash === null) {
    throw new Error("Cannot record zeroing transaction before payoutTxHash is present");
  }
  await verifyZeroingTx(client, row, txHash);
  console.log(`Verified zeroing transaction for ${row.address}`);
  return { ...row, status: "claimable_zeroed", claimableZeroedTxHash: txHash };
}

async function verifyPayoutTx(client: PublicClient, row: ManualClaimRow, txHash: Hex): Promise<void> {
  const [receipt, transaction] = await Promise.all([
    client.getTransactionReceipt({ hash: txHash }),
    client.getTransaction({ hash: txHash })
  ]);

  if (receipt.status !== "success") {
    throw new Error(`Transaction ${txHash} did not succeed`);
  }

  const expectedWei = parseDecimalInteger(row.manualPayoutWei, "manualPayoutWei");
  const nativeTransferMatches =
    transaction.to !== null &&
    getAddress(transaction.to) === row.recipient &&
    transaction.value === expectedWei;

  const wethLogs = receipt.logs.filter((log) => getAddress(log.address) === WETH && log.topics[0] === TRANSFER_TOPIC);
  const transferLogs = parseEventLogs({
    abi: WETH_TRANSFER_ABI,
    eventName: "Transfer",
    logs: wethLogs
  });
  const wethTransferredToRecipient = transferLogs.reduce((sum, log) => {
    return getAddress(log.args.to) === row.recipient ? sum + log.args.value : sum;
  }, 0n);

  if (!nativeTransferMatches && wethTransferredToRecipient !== expectedWei) {
    throw new Error(
      `Transaction ${txHash} does not contain an exact ${row.manualPayoutWei} wei WETH transfer or direct ETH transfer to ${row.recipient}`
    );
  }
}

async function verifyZeroingTx(client: PublicClient, row: ManualClaimRow, txHash: Hex): Promise<void> {
  const receipt = await client.getTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") {
    throw new Error(`Transaction ${txHash} did not succeed`);
  }

  const claimable = await client.readContract({
    address: CLAIM_CONTRACT,
    abi: CLAIM_CONTRACT_ABI,
    functionName: "claimable",
    args: [row.address],
    blockNumber: receipt.blockNumber
  });

  if (claimable !== 0n) {
    throw new Error(`claimable(${row.address}) is ${claimable.toString()} at block ${receipt.blockNumber}`);
  }
}
