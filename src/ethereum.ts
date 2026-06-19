import { createPublicClient, http } from "viem";
import type { Address, PublicClient } from "viem";
import { mainnet } from "viem/chains";
import { CLAIM_CONTRACT_ABI } from "./abi.js";
import { CLAIM_CONTRACT } from "./constants.js";
import type { ClaimContractState } from "./types.js";

const MULTICALL_CHUNK_SIZE = 500;

export function createEthereumClient(rpcUrl: string): PublicClient {
  return createPublicClient({
    chain: mainnet,
    transport: http(rpcUrl)
  });
}

export async function readClaimContractState(
  client: PublicClient,
  blockNumber: bigint
): Promise<ClaimContractState> {
  const [recoveryRateWei, deadline, unclaimedWei, claimedWei, exitedWei] = await Promise.all([
    readContractUint(client, "recovery_rate", blockNumber),
    readContractUint(client, "deadline", blockNumber),
    readContractUint(client, "unclaimed", blockNumber),
    readContractUint(client, "claimed", blockNumber),
    readContractUint(client, "exited", blockNumber)
  ]);

  return {
    recoveryRateWei: recoveryRateWei.toString(),
    deadline: deadline.toString(),
    unclaimedWei: unclaimedWei.toString(),
    claimedWei: claimedWei.toString(),
    exitedWei: exitedWei.toString()
  };
}

export async function readClaimables(
  client: PublicClient,
  addresses: Address[],
  blockNumber: bigint
): Promise<Map<Address, bigint>> {
  const claimables = new Map<Address, bigint>();

  for (let start = 0; start < addresses.length; start += MULTICALL_CHUNK_SIZE) {
    const chunk = addresses.slice(start, start + MULTICALL_CHUNK_SIZE);
    const results = await client.multicall({
      allowFailure: false,
      blockNumber,
      contracts: chunk.map((address) => ({
        address: CLAIM_CONTRACT,
        abi: CLAIM_CONTRACT_ABI,
        functionName: "claimable",
        args: [address]
      }))
    });

    results.forEach((claimable, index) => {
      const address = chunk[index];
      if (address === undefined) {
        throw new Error("Internal error: missing address for claimable result");
      }
      claimables.set(address, claimable);
    });
  }

  return claimables;
}

async function readContractUint(
  client: PublicClient,
  functionName: "recovery_rate" | "deadline" | "unclaimed" | "claimed" | "exited",
  blockNumber: bigint
): Promise<bigint> {
  return client.readContract({
    address: CLAIM_CONTRACT,
    abi: CLAIM_CONTRACT_ABI,
    functionName,
    blockNumber
  });
}
