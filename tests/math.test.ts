import { describe, expect, it } from "vitest";
import { calculateManualPayoutWei, calculateManualPayoutWeiString, formatWeiAsEthDecimal } from "../src/math.js";

describe("manual payout math", () => {
  it("uses exact floor integer math", () => {
    expect(calculateManualPayoutWei(10n, 333333333333333333n)).toBe(3n);
    expect(calculateManualPayoutWeiString("10", "333333333333333333")).toBe("3");
  });

  it("formats wei without floating point math", () => {
    expect(formatWeiAsEthDecimal("1000000000000000000")).toBe("1");
    expect(formatWeiAsEthDecimal("11457663322397255498")).toBe("11.457663322397255498");
  });
});
