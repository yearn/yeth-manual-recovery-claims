import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { Command } from "commander";
import { CLAIM_CONTRACT, DEFAULT_GENERATED_DIR } from "../src/constants.js";
import { writeCsv } from "../src/csv.js";
import { createEthereumClient, readClaimables, readClaimContractState } from "../src/ethereum.js";
import { calculateManualPayoutWei, parseDecimalInteger } from "../src/math.js";
import { loadSnapshot, snapshotEntries } from "../src/snapshot.js";
import type { UnclaimedClaimRow, UnclaimedClaimsExport } from "../src/types.js";

const csvColumns = [
  "address",
  "snapshotAmountWei",
  "claimableWei",
  "manualPayoutWei",
  "recoveryRateWei",
  "extractionBlock"
].map((key) => ({ key, header: key }));

const program = new Command()
  .description("Extract still-unclaimed yETH recovery claims from mainnet")
  .option("--block <number>", "mainnet block number to read")
  .option("--out-dir <path>", "output directory", DEFAULT_GENERATED_DIR);

program.parse();
const options = program.opts<{ block?: string; outDir: string }>();

try {
  const rpcUrl = process.env.ETH_RPC_URL;
  if (rpcUrl === undefined || rpcUrl.trim() === "") {
    throw new Error("ETH_RPC_URL is required");
  }

  const client = createEthereumClient(rpcUrl);
  const snapshot = await loadSnapshot();
  const entries = snapshotEntries(snapshot);
  const extractionBlock = options.block === undefined ? await client.getBlockNumber() : parseBlock(options.block);
  const extractionBlockString = extractionBlock.toString();

  const state = await readClaimContractState(client, extractionBlock);
  const claimables = await readClaimables(
    client,
    entries.map((entry) => entry.address),
    extractionBlock
  );

  const recoveryRateWei = parseDecimalInteger(state.recoveryRateWei, "recoveryRateWei");
  const rows: UnclaimedClaimRow[] = [];
  let sumClaimableWei = 0n;
  let sumManualPayoutWei = 0n;

  for (const entry of entries) {
    const claimableWei = claimables.get(entry.address) ?? 0n;
    if (claimableWei === 0n) {
      continue;
    }

    const manualPayoutWei = calculateManualPayoutWei(claimableWei, recoveryRateWei);
    sumClaimableWei += claimableWei;
    sumManualPayoutWei += manualPayoutWei;
    rows.push({
      address: entry.address,
      snapshotAmountWei: entry.amountWei,
      claimableWei: claimableWei.toString(),
      manualPayoutWei: manualPayoutWei.toString(),
      extractionBlock: extractionBlockString
    });
  }

  rows.sort((a, b) => a.address.toLowerCase().localeCompare(b.address.toLowerCase()));

  const exportData: UnclaimedClaimsExport = {
    metadata: {
      extractedAt: new Date().toISOString(),
      extractionBlock: extractionBlockString,
      claimContract: CLAIM_CONTRACT,
      recoveryRateWei: state.recoveryRateWei,
      deadline: state.deadline,
      claimedWei: state.claimedWei,
      exitedWei: state.exitedWei,
      unclaimedWei: state.unclaimedWei,
      rowCount: rows.length,
      sumClaimableWei: sumClaimableWei.toString(),
      sumManualPayoutWei: sumManualPayoutWei.toString()
    },
    rows
  };

  await mkdir(options.outDir, { recursive: true });
  const jsonPath = `${options.outDir}/unclaimed-claims.${extractionBlockString}.json`;
  const csvPath = `${options.outDir}/unclaimed-claims.${extractionBlockString}.csv`;
  const latestJsonPath = `${options.outDir}/unclaimed-claims.latest.json`;
  const latestCsvPath = `${options.outDir}/unclaimed-claims.latest.csv`;

  await writeFile(jsonPath, `${JSON.stringify(exportData, null, 2)}\n`);
  await writeFile(
    csvPath,
    writeCsv(
      csvColumns,
      rows.map((row) => ({ ...row, recoveryRateWei: state.recoveryRateWei }))
    )
  );
  await copyFile(jsonPath, latestJsonPath);
  await copyFile(csvPath, latestCsvPath);

  console.log(`Wrote ${jsonPath}`);
  console.log(`Wrote ${csvPath}`);
  console.log(`Updated ${latestJsonPath}`);
  console.log(`Updated ${latestCsvPath}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

function parseBlock(value: string): bigint {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error("--block must be a non-negative decimal integer");
  }

  return BigInt(value);
}
