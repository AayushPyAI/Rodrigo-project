// Runs the post-call pipeline when Vapi sends an end-of-call-report:
//   normalize data -> HubSpot upsert -> generate proposal PDF -> email client +
//   management. Each step is best-effort and isolated so one failure doesn't sink
//   the rest; everything is idempotent per call_id.
import { normalizeCallData } from "./schema.js";
import { calculateLeaseQuote } from "./pricing.js";
import { config } from "./config.js";
import { alreadyProcessed, markProcessed } from "./services/idempotency.js";
import { upsertContactAndDeal } from "./services/hubspot.js";
import { generateProposal } from "./services/proposal.js";
import { sendClientProposal, sendManagementSummary } from "./services/email.js";
import { logger } from "./utils/logger.js";

/** Pull the pieces we need out of the Vapi end-of-call-report message. */
function extractFromReport(message) {
  const analysis = message?.analysis ?? {};
  const call = message?.call ?? {};
  const artifact = message?.artifact ?? {};
  const structured = analysis.structuredData ?? {};
  return {
    structured,
    summary: analysis.summary ?? "",
    callId: call.id ?? message?.callId ?? "",
    transcriptUrl: artifact.recordingUrl ?? artifact.transcriptUrl ?? "",
  };
}

export async function handleEndOfCall(message) {
  const { structured, summary, callId, transcriptUrl } = extractFromReport(message);

  if (alreadyProcessed(callId)) {
    logger.info("orchestrator.skip.duplicate", { callId });
    return { skipped: true };
  }
  markProcessed(callId);

  // 1) Normalize to canonical CallData
  const data = normalizeCallData({ ...structured, call_id: callId, transcript_url: transcriptUrl });

  // 2) Recompute the quote server-side from captured EXW so the PDF/CRM match the
  //    deterministic engine (never trust a number the LLM might have voiced).
  let quote = null;
  if (data.exw_value > 0) {
    try {
      quote = calculateLeaseQuote(
        { exw_value: data.exw_value, units: data.units, modality: data.modality },
        config.pricing
      );
      data.ddp_value = quote.ddpValue;
      data.monthly_lease = quote.monthlyQuoted;
    } catch (err) {
      logger.warn("orchestrator.quote.failed", { error: String(err.message) });
    }
  }

  const outcome = { callId, steps: {} };

  // 3) HubSpot
  try {
    outcome.steps.hubspot = await upsertContactAndDeal(data, quote);
  } catch (err) {
    outcome.steps.hubspot = { error: String(err.message) };
    logger.error("orchestrator.hubspot.error", { error: String(err.message) });
  }

  // 4) Proposal PDF
  let proposal = null;
  try {
    proposal = await generateProposal(data, quote);
    outcome.steps.proposal = { fileName: proposal.fileName };
  } catch (err) {
    outcome.steps.proposal = { error: String(err.message) };
    logger.error("orchestrator.proposal.error", { error: String(err.message) });
  }

  // 5) Emails (client proposal + management summary)
  try {
    outcome.steps.clientEmail = await sendClientProposal(data, proposal ?? emptyProposal(data));
  } catch (err) {
    outcome.steps.clientEmail = { error: String(err.message) };
    logger.error("orchestrator.clientEmail.error", { error: String(err.message) });
  }
  try {
    outcome.steps.managementEmail = await sendManagementSummary(data, quote, proposal, summary);
  } catch (err) {
    outcome.steps.managementEmail = { error: String(err.message) };
    logger.error("orchestrator.managementEmail.error", { error: String(err.message) });
  }

  logger.info("orchestrator.done", outcome);
  return outcome;
}

// If the PDF step failed, still let the client email code run without an attachment.
function emptyProposal(data) {
  return {
    pdfBuffer: null,
    fileName: "proposal-unavailable.pdf",
    mergeFields: {
      Equipment_Requested: data.equipment_type || "Industrial machinery",
      Modality_Selected: data.modality,
      Calculated_Payment: "to be confirmed",
    },
    attachments: [],
  };
}
