import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getAddress, verifyMessage } from "viem";
import { privateKeyToAccount } from "viem/accounts";

describe("signature verification", () => {
  it("verifies a known local signer", async () => {
    const address = "0x31DD7123B95711ff15F2234574Ea5fF9cbd0A098";
    const message = [
      "yETH manual late claim",
      `Wallet: ${address}`,
      "Recipient: 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
      "Snapshot block: 23914085",
      "Snapshot amount: 1 ETH",
      "Manual settlement amount: 0.3196079 WETH",
      "Date: 2026-06-19",
      "I understand this is a manual late claim for recovered principal only and does not mint Recovery Vault shares or include accrued yield."
    ].join("\n");
    const signature =
      "0x5739687641f1d9a8ec5c751d86fc11478398ad18616e3549204d1f90c1079eae36b9104e758194fa3d8f1a910d07640c3e449a40f4836767702762e3b66505721c";

    await expect(
      verifyMessage({
        address: getAddress(address),
        message,
        signature
      })
    ).resolves.toBe(true);
  });

  it("can verify the same payload shape from a message file", async () => {
    const account = privateKeyToAccount("0x59c6995e998f97a5a004497e5da674887a0a37ae0d10d6d4c4ea5d1aef19e855");
    const message = "yETH manual late claim\nWallet: " + account.address;
    const signature = await account.signMessage({ message });
    const directory = await mkdtemp(join(tmpdir(), "yeth-signature-"));
    const messagePath = join(directory, "message.txt");

    try {
      await writeFile(messagePath, message);
      const messageFromFile = await import("node:fs/promises").then((fs) => fs.readFile(messagePath, "utf8"));

      await expect(
        verifyMessage({
          address: account.address,
          message: messageFromFile,
          signature
        })
      ).resolves.toBe(true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
