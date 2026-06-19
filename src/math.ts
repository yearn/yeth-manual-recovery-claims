export const WAD = 10n ** 18n;

const DECIMAL_INTEGER_PATTERN = /^(0|[1-9][0-9]*)$/;

export function isDecimalIntegerString(value: unknown): value is string {
  return typeof value === "string" && DECIMAL_INTEGER_PATTERN.test(value);
}

export function parseDecimalInteger(value: string, fieldName = "value"): bigint {
  if (!isDecimalIntegerString(value)) {
    throw new Error(`${fieldName} must be a non-negative decimal integer string`);
  }

  return BigInt(value);
}

export function calculateManualPayoutWei(claimableWei: bigint, recoveryRateWei: bigint): bigint {
  if (claimableWei < 0n) {
    throw new Error("claimableWei must be non-negative");
  }
  if (recoveryRateWei < 0n) {
    throw new Error("recoveryRateWei must be non-negative");
  }

  return (claimableWei * recoveryRateWei) / WAD;
}

export function calculateManualPayoutWeiString(claimableWei: string, recoveryRateWei: string): string {
  return calculateManualPayoutWei(
    parseDecimalInteger(claimableWei, "claimableWei"),
    parseDecimalInteger(recoveryRateWei, "recoveryRateWei")
  ).toString();
}

export function formatWeiAsEthDecimal(wei: bigint | string): string {
  const value = typeof wei === "bigint" ? wei : parseDecimalInteger(wei, "wei");
  const whole = value / WAD;
  const fraction = value % WAD;

  if (fraction === 0n) {
    return whole.toString();
  }

  return `${whole.toString()}.${fraction.toString().padStart(18, "0").replace(/0+$/, "")}`;
}
