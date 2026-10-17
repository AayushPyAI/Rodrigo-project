// Handles Vapi tool calls. Currently one tool: calculate_lease_quote.
// Vapi POSTs a message of type "tool-calls"; we must respond with
// { results: [{ toolCallId, result }] } where result is a STRING the model reads.
import { calculateLeaseQuote } from "../pricing.js";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";

/** Extract the tool-call list across Vapi payload shapes. */
function extractToolCalls(message) {
  if (Array.isArray(message?.toolCallList)) return message.toolCallList;
  if (Array.isArray(message?.toolCalls)) return message.toolCalls;
  if (Array.isArray(message?.toolWithToolCallList)) {
    return message.toolWithToolCallList.map((t) => t.toolCall).filter(Boolean);
  }
  return [];
}

function getCall(tc) {
  const id = tc.id ?? tc.toolCallId ?? tc.function?.id;
  const name = tc.name ?? tc.function?.name;
  let args = tc.arguments ?? tc.function?.arguments ?? {};
  if (typeof args === "string") {
    try {
      args = JSON.parse(args);
    } catch {
      args = {};
    }
  }
  return { id, name, args };
}

export function handleToolCalls(message) {
  const results = [];
  for (const raw of extractToolCalls(message)) {
    const { id, name, args } = getCall(raw);
    if (name === "calculate_lease_quote") {
      try {
        const quote = calculateLeaseQuote(args, config.pricing);
        logger.info("tool.calculate_lease_quote", { args, monthlyQuoted: quote.monthlyQuoted });
        // Give the model the spoken line plus the key numbers to work with.
        results.push({
          toolCallId: id,
          result: JSON.stringify({
            spoken: quote.spoken,
            ddp_value: quote.ddpValue,
            monthly_payment: quote.monthlyQuoted,
            lease_term_months: quote.leaseTermMonths,
            below_baseline: quote.belowBaseline,
            discount_pct: quote.discountPct,
          }),
        });
      } catch (err) {
        logger.warn("tool.calculate_lease_quote.error", { args, error: String(err.message) });
        results.push({
          toolCallId: id,
          result: JSON.stringify({
            error: String(err.message),
            spoken:
              "I'll need an approximate machine value or budget to put precise numbers together — " +
              "roughly what investment level are you considering?",
          }),
        });
      }
    } else {
      logger.warn("tool.unknown", { name });
      results.push({ toolCallId: id, result: JSON.stringify({ error: `Unknown tool: ${name}` }) });
    }
  }
  return { results };
}
