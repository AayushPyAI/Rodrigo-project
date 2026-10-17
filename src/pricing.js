// =============================================================================
// HASS Lease pricing — the single source of truth.
//
// WHY THIS EXISTS: the client's Master System Prompt asks GPT-4o to do this math
// live, mid-call, while never speaking the formula aloud. LLMs are unreliable at
// arithmetic under latency and will drift, which also makes the spoken number
// disagree with the generated PDF. So the agent NEVER computes — it calls the
// `calculate_lease_quote` tool, which runs this deterministic function. The same
// function feeds the proposal PDF, guaranteeing spoken == written.
//
// Formula (from the prompt, section 3 "INSTANT FINANCIAL CALCULATION LOGIC"):
//   1. DDP delivered value = EXW/FOB * 1.25
//   2. Base monthly rent    = DDP / 36
//   3. Tiered HASS layer (per deal, by total DDP):
//        DDP < $200k            -> +$400/mo
//        $200k <= DDP <= $1M    -> +$800/mo
//        DDP > $1M              -> +1.5% of DDP /mo
//   4. Total monthly = base + HASS layer (+ optional on-site engineer)
//   Volume discount on the TOTAL monthly invoice: 2u = 5%, 3u+ = 10%..15%.
//
// NOTE ON PRICE SOURCE (open client decision #2): `exw_value` is the EXW/FOB
// value the PROSPECT states (their target machine value / budget). There is no
// price catalog in the spec. If the client later supplies one, add a lookup that
// resolves equipment_type -> exw_value before calling this function.
// =============================================================================

export const DEFAULT_PRICING_CONFIG = {
  ddpMultiplier: 1.25,
  leaseTermMonths: 36,
  minFactoryBaseline: 50000,
  hass: {
    tier2Min: 200000, // DDP >= this  -> tier 2
    tier3Min: 1000000, // DDP > this  -> tier 3
    tier1Flat: 400, // DDP < 200k
    tier2Flat: 800, // 200k..1M
    tier3Pct: 0.015, // > 1M : 1.5% of DDP
  },
  discounts: { two: 0.05, threePlus: 0.1 },
  onsiteEngineerMonthly: 13500,
  spokenRoundTo: 10,
};

const round2 = (n) => Math.round(n * 100) / 100;
const roundTo = (n, step) => Math.round(n / step) * step;
const money = (n) => `$${Math.round(n).toLocaleString("en-US")}`;

/**
 * @param {object} input
 * @param {number} input.exw_value      EXW/FOB value per unit (USD), prospect-stated
 * @param {number} [input.units=1]      quantity
 * @param {'prime_lease'|'total_engineer'|'capital_sale'} [input.modality='prime_lease']
 * @param {boolean} [input.on_site_engineer=false]  add the Total-Engineer resident engineer
 * @param {object} [config=DEFAULT_PRICING_CONFIG]
 */
export function calculateLeaseQuote(input, config = DEFAULT_PRICING_CONFIG) {
  const exwPerUnit = Number(input?.exw_value);
  const units = Math.max(1, parseInt(input?.units ?? 1, 10) || 1);
  const modality = input?.modality ?? "prime_lease";
  const onSiteEngineer = Boolean(input?.on_site_engineer) || modality === "total_engineer";

  if (!Number.isFinite(exwPerUnit) || exwPerUnit <= 0) {
    throw new Error(
      "exw_value must be a positive number (the prospect-stated machine/budget value in USD)."
    );
  }

  const totalExw = exwPerUnit * units;
  const ddpValue = totalExw * config.ddpMultiplier;
  const baseMonthly = ddpValue / config.leaseTermMonths;

  // Tiered HASS subscription layer — one per deal, based on total DDP.
  let hassLayer;
  let hassTier;
  if (ddpValue < config.hass.tier2Min) {
    hassLayer = config.hass.tier1Flat;
    hassTier = 1;
  } else if (ddpValue <= config.hass.tier3Min) {
    hassLayer = config.hass.tier2Flat;
    hassTier = 2;
  } else {
    hassLayer = ddpValue * config.hass.tier3Pct;
    hassTier = 3;
  }

  const engineerMonthly = onSiteEngineer ? config.onsiteEngineerMonthly : 0;
  const subtotalMonthly = baseMonthly + hassLayer + engineerMonthly;

  // Volume discount applies to the total monthly invoice.
  let discountPct = 0;
  if (units === 2) discountPct = config.discounts.two;
  else if (units >= 3) discountPct = config.discounts.threePlus;

  const totalMonthly = subtotalMonthly * (1 - discountPct);
  const monthlyQuoted = roundTo(totalMonthly, config.spokenRoundTo);
  const belowBaseline = totalExw < config.minFactoryBaseline;

  const spoken = belowBaseline
    ? `That configuration sits below our ${money(config.minFactoryBaseline)} factory baseline. ` +
      `I'd recommend bundling it into a turnkey production combo — main machine plus auxiliaries — ` +
      `to elevate the order above our baseline and unlock the full DDP leasing terms.`
    : `Your all-inclusive Turnkey DDP value delivered to your plant floor is roughly ${money(ddpValue)}. ` +
      `Under our ${config.leaseTermMonths}-month Prime-Lease program that translates to an all-inclusive, ` +
      `100% tax-deductible payment of approximately ${money(monthlyQuoted)} per month — covering the ` +
      `machinery, ocean freight, customs, full warranty, and automated compliance reporting.` +
      (discountPct > 0
        ? ` That already reflects a ${Math.round(discountPct * 100)}% multi-unit volume discount.`
        : "");

  return {
    currency: "USD",
    inputs: { exwPerUnit, units, modality, onSiteEngineer },
    totalExw: round2(totalExw),
    ddpValue: round2(ddpValue),
    baseMonthly: round2(baseMonthly),
    hassTier,
    hassLayer: round2(hassLayer),
    engineerMonthly,
    discountPct,
    totalMonthlyExact: round2(totalMonthly),
    monthlyQuoted, // <-- the figure used in BOTH the voice quote and the PDF
    leaseTermMonths: config.leaseTermMonths,
    belowBaseline,
    spoken,
  };
}

/** Build a pricing config object from parsed env (see src/config.js). */
export function pricingConfigFromEnv(env) {
  const num = (v, d) => (v === undefined || v === "" ? d : Number(v));
  return {
    ddpMultiplier: num(env.DDP_MULTIPLIER, 1.25),
    leaseTermMonths: num(env.LEASE_TERM_MONTHS, 36),
    minFactoryBaseline: num(env.MIN_FACTORY_BASELINE, 50000),
    hass: {
      tier2Min: num(env.HASS_TIER2_MIN, 200000),
      tier3Min: num(env.HASS_TIER3_MIN, 1000000),
      tier1Flat: num(env.HASS_TIER1_FLAT, 400),
      tier2Flat: num(env.HASS_TIER2_FLAT, 800),
      tier3Pct: num(env.HASS_TIER3_PCT, 0.015),
    },
    discounts: {
      two: num(env.DISCOUNT_2_UNITS, 0.05),
      threePlus: num(env.DISCOUNT_3PLUS_UNITS, 0.1),
    },
    onsiteEngineerMonthly: num(env.ONSITE_ENGINEER_MONTHLY, 13500),
    spokenRoundTo: num(env.SPOKEN_ROUND_TO, 10),
  };
}
