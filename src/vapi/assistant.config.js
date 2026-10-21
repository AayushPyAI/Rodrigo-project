// Builds the Vapi assistant object. Used by scripts/deploy-vapi.js to create or
// update the assistant via the Vapi API. Everything environment-specific comes
// from config so there are no hardcoded secrets or URLs.
import { config } from "../config.js";
import { SYSTEM_PROMPT, FIRST_MESSAGE } from "./systemPrompt.js";

// JSON Schema for the tool the model calls to price a deal.
export const CALCULATE_LEASE_QUOTE_TOOL = {
  type: "function",
  function: {
    name: "calculate_lease_quote",
    description:
      "Compute the HASS Lease monthly figure for a machine. Call whenever the prospect " +
      "gives a target EXW/FOB machine value (and optionally quantity). Returns the DDP " +
      "value, the monthly payment, and a `spoken` sentence to read back. NEVER do this " +
      "math yourself.",
    parameters: {
      type: "object",
      properties: {
        exw_value: {
          type: "number",
          description: "EXW/FOB value per unit in USD, as stated by the prospect (their budget/target).",
        },
        units: { type: "integer", description: "Quantity of units. Default 1.", default: 1 },
        modality: {
          type: "string",
          enum: ["prime_lease", "total_engineer", "capital_sale"],
          description: "Commercial product. Default prime_lease.",
        },
        on_site_engineer: {
          type: "boolean",
          description: "True to include the Total-Engineer resident on-site engineer add-on.",
        },
      },
      required: ["exw_value"],
    },
  },
  // Vapi will POST tool calls to this server URL; our Express app answers them.
  server: { url: `${config.publicBaseUrl}/vapi` },
};

// Structured-data extraction plan -> fills the canonical CallData after each call.
const STRUCTURED_DATA_SCHEMA = {
  type: "object",
  properties: {
    client_name: { type: "string" },
    company_name: { type: "string" },
    position: { type: "string" },
    email: { type: "string" },
    phone: { type: "string" },
    equipment_type: { type: "string" },
    units: { type: "integer" },
    sourcing_route: { type: "string", enum: ["asian", "european", "hybrid"] },
    exw_value: { type: "number" },
    modality: { type: "string", enum: ["prime_lease", "total_engineer", "capital_sale"] },
    service_option: { type: "string", enum: ["A", "B", "C"] },
    timeline: { type: "string" },
    language: { type: "string", enum: ["en", "es"] },
  },
};

export function buildAssistantConfig() {
  return {
    name: "WFG Commercial Executive",
    firstMessage: FIRST_MESSAGE,
    model: {
      provider: "openai",
      model: "gpt-4o",
      temperature: 0.4,
      messages: [{ role: "system", content: SYSTEM_PROMPT }],
      tools: [CALCULATE_LEASE_QUOTE_TOOL],
      // Knowledge Base query tool (created once via the Vapi API; see VAPI_KB_TOOL_ID)
      toolIds: config.vapi.kbToolId ? [config.vapi.kbToolId] : [],
    },
    voice: {
      provider: config.vapi.voiceProvider, // e.g. 11labs
      voiceId: config.vapi.voiceId, // a FEMALE voice id
    },
    transcriber: {
      provider: "deepgram",
      model: "nova-2",
      language: config.vapi.transcriberLanguage, // "multi" for EN+ES
    },
    // End-of-call analysis -> structured data + summary used by our webhook.
    analysisPlan: {
      structuredDataPlan: {
        enabled: true,
        schema: STRUCTURED_DATA_SCHEMA,
      },
      summaryPlan: { enabled: true },
    },
    // Where Vapi sends status-update / end-of-call-report events.
    server: { url: `${config.publicBaseUrl}/vapi`, secret: config.vapi.webhookSecret || undefined },
    serverMessages: ["tool-calls", "end-of-call-report", "status-update"],
  };
}
