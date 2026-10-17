import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateLeaseQuote } from "../src/pricing.js";

test("worked example from the spec: $50k single unit", () => {
  const q = calculateLeaseQuote({ exw_value: 50000, units: 1 });
  assert.equal(q.ddpValue, 62500); // 50000 * 1.25
  assert.ok(Math.abs(q.baseMonthly - 1736.11) < 0.02); // 62500 / 36
  assert.equal(q.hassTier, 1); // DDP < 200k
  assert.equal(q.hassLayer, 400);
  assert.equal(q.discountPct, 0);
  // base 1736.11 + 400 = 2136.11 -> nearest $10 = 2140
  assert.equal(q.monthlyQuoted, 2140);
  assert.equal(q.belowBaseline, false);
});

test("tier 2: DDP between 200k and 1M gets +$800", () => {
  const q = calculateLeaseQuote({ exw_value: 200000, units: 1 }); // DDP 250000
  assert.equal(q.ddpValue, 250000);
  assert.equal(q.hassTier, 2);
  assert.equal(q.hassLayer, 800);
});

test("tier 3: DDP over 1M gets 1.5% of DDP", () => {
  const q = calculateLeaseQuote({ exw_value: 1000000, units: 1 }); // DDP 1,250,000 ( > 1M )
  assert.equal(q.ddpValue, 1250000);
  assert.equal(q.hassTier, 3);
  assert.equal(q.hassLayer, 18750); // 1,250,000 * 0.015
});

test("tier boundary: DDP exactly 1,000,000 stays in tier 2", () => {
  const q = calculateLeaseQuote({ exw_value: 800000, units: 1 }); // DDP exactly 1,000,000
  assert.equal(q.ddpValue, 1000000);
  assert.equal(q.hassTier, 2);
  assert.equal(q.hassLayer, 800);
});

test("volume discount: 2 units -> 5% off total monthly", () => {
  const q = calculateLeaseQuote({ exw_value: 50000, units: 2 }); // totalExw 100k, DDP 125k
  assert.equal(q.ddpValue, 125000);
  assert.equal(q.hassTier, 1);
  assert.equal(q.discountPct, 0.05);
  // base 125000/36 = 3472.22 + 400 = 3872.22 ; *0.95 = 3678.61 ; nearest 10 = 3680
  assert.equal(q.monthlyQuoted, 3680);
});

test("volume discount: 3+ units -> 10% off (default)", () => {
  const q = calculateLeaseQuote({ exw_value: 50000, units: 3 });
  assert.equal(q.discountPct, 0.1);
});

test("below baseline flag trips under $50k total EXW", () => {
  const q = calculateLeaseQuote({ exw_value: 30000, units: 1 });
  assert.equal(q.belowBaseline, true);
  assert.match(q.spoken, /baseline/i);
});

test("total-engineer modality adds the resident engineer cost", () => {
  const base = calculateLeaseQuote({ exw_value: 100000, units: 1 });
  const te = calculateLeaseQuote({ exw_value: 100000, units: 1, modality: "total_engineer" });
  assert.equal(te.engineerMonthly, 13500);
  assert.ok(te.monthlyQuoted > base.monthlyQuoted);
});

test("invalid exw_value throws a clear error", () => {
  assert.throws(() => calculateLeaseQuote({ exw_value: 0 }), /positive number/);
  assert.throws(() => calculateLeaseQuote({ exw_value: "abc" }), /positive number/);
});

test("spoken quote never leaks the raw formula", () => {
  const q = calculateLeaseQuote({ exw_value: 50000, units: 1 });
  assert.doesNotMatch(q.spoken, /1\.25|\/ ?36|\* ?1\.25/);
});
