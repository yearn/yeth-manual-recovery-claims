import { readFile } from "node:fs/promises";
import { Command } from "commander";
import { getAddress, recoverMessageAddress } from "viem";
import type { Hex } from "viem";

const program = new Command()
  .description("Verify an EIP-191 personal signature for a manual yETH recovery claim")
  .requiredOption("--address <address>", "expected signer address")
  .requiredOption("--message-file <path>", "path to signed message text")
  .requiredOption("--signature <signature>", "hex signature");

program.parse();
const options = program.opts<{ address: string; messageFile: string; signature: Hex }>();

try {
  const address = getAddress(options.address);
  const message = await readFile(options.messageFile, "utf8");
  const recovered = await recoverMessageAddress({
    message,
    signature: options.signature
  });
  const verified = getAddress(recovered) === address;

  if (!verified) {
    console.error(`Invalid signature for ${address}; recovered ${recovered}`);
    process.exitCode = 1;
  } else {
    console.log(`Verified signer: ${recovered}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
