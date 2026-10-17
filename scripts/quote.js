// Quick CLI to eyeball the pricing engine. No server needed.
// Usage:  node scripts/quote.js <exw_value> [units] [modality]
// Example: node scripts/quote.js 50000 1
import { calculateLeaseQuote, pricingConfigFromEnv } from "../src/pricing.js";
import "dotenv/config";

const [, , exw, units, modality] = process.argv;
if (!exw) {
  console.log("Usage: node scripts/quote.js <exw_value> [units] [modality]");
  process.exit(0);
}

const q = calculateLeaseQuote(
  { exw_value: Number(exw), units: units ? Number(units) : 1, modality },
  pricingConfigFromEnv(process.env)
);

console.log("\n" + q.spoken + "\n");
console.table({
  "EXW (total)": `$${q.totalExw.toLocaleString("en-US")}`,
  "DDP value": `$${q.ddpValue.toLocaleString("en-US")}`,
  "Base monthly": `$${q.baseMonthly.toLocaleString("en-US")}`,
  "HASS tier": q.hassTier,
  "HASS layer": `$${q.hassLayer.toLocaleString("en-US")}`,
  "Discount": `${Math.round(q.discountPct * 100)}%`,
  "MONTHLY QUOTED": `$${q.monthlyQuoted.toLocaleString("en-US")}`,
});
