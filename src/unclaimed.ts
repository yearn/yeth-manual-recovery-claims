import { readFile } from "node:fs/promises";
import { getAddress } from "viem";
import type { Address } from "viem";
import { z } from "zod";
import { CLAIM_CONTRACT } from "./constants.js";
import { isDecimalIntegerString } from "./math.js";
import type { UnclaimedClaimRow, UnclaimedClaimsExport } from "./types.js";

export const DEFAULT_UNCLAIMED_LATEST_PATH = "data/generated/unclaimed-claims.latest.json";

const unclaimedExportSchema = z.object({
  metadata: z.object({
    extractedAt: z.string(),
    extractionBlock: z.string().refine(isDecimalIntegerString),
    claimContract: z.string(),
    recoveryRateWei: z.string().refine(isDecimalIntegerString),
    deadline: z.string().refine(isDecimalIntegerString),
    claimedWei: z.string().refine(isDecimalIntegerString),
    exitedWei: z.string().refine(isDecimalIntegerString),
    unclaimedWei: z.string().refine(isDecimalIntegerString),
    rowCount: z.number().int().nonnegative(),
    sumClaimableWei: z.string().refine(isDecimalIntegerString),
    sumManualPayoutWei: z.string().refine(isDecimalIntegerString)
  }),
  rows: z.array(
    z.object({
      address: z.string(),
      snapshotAmountWei: z.string().refine(isDecimalIntegerString),
      claimableWei: z.string().refine(isDecimalIntegerString),
      manualPayoutWei: z.string().refine(isDecimalIntegerString),
      extractionBlock: z.string().refine(isDecimalIntegerString)
    })
  )
});

export async function loadUnclaimedClaimsExport(
  path = DEFAULT_UNCLAIMED_LATEST_PATH
): Promise<UnclaimedClaimsExport> {
  const parsed = unclaimedExportSchema.parse(JSON.parse(await readFile(path, "utf8")));
  const claimContract = getAddress(parsed.metadata.claimContract);
  if (claimContract !== CLAIM_CONTRACT) {
    throw new Error(`Unexpected claim contract in unclaimed export: ${claimContract}`);
  }

  return {
    metadata: {
      ...parsed.metadata,
      claimContract
    },
    rows: parsed.rows.map((row) => ({
      ...row,
      address: getAddress(row.address)
    }))
  };
}

export function findUnclaimedRow(exportData: UnclaimedClaimsExport, address: Address): UnclaimedClaimRow {
  const row = exportData.rows.find((candidate) => candidate.address === address);
  if (row === undefined) {
    throw new Error(`${address} is not present in the latest unclaimed inventory`);
  }

  return row;
}
