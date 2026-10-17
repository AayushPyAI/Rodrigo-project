// Thin Vapi REST client (Node 18+ global fetch). Used to (a) create/update the
// assistant and (b) place form-triggered outbound callbacks.
// MOCK mode when VAPI_API_KEY is missing.
import { config, features } from "../config.js";
import { logger } from "../utils/logger.js";

const BASE = "https://api.vapi.ai";

async function vapiFetch(path, method, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${config.vapi.apiKey}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`Vapi ${method} ${path} -> ${res.status}: ${text.slice(0, 500)}`);
  }
  return json;
}

/** Create a new assistant, or update VAPI_ASSISTANT_ID if set. Returns the assistant. */
export async function createOrUpdateAssistant(assistant) {
  if (!features.vapiLive) {
    logger.warn("vapi.mock", { reason: "VAPI_API_KEY not set", wouldDeploy: assistant.name });
    return { id: "mock-assistant", mocked: true, assistant };
  }
  if (config.vapi.assistantId) {
    return vapiFetch(`/assistant/${config.vapi.assistantId}`, "PATCH", assistant);
  }
  return vapiFetch(`/assistant`, "POST", assistant);
}

/** Place an outbound callback to a lead who requested one via the website form. */
export async function triggerOutboundCallback({ phone, name, email }) {
  if (!features.vapiLive || !config.vapi.phoneNumberId || !config.vapi.assistantId) {
    logger.warn("vapi.callback.mock", {
      reason: "VAPI_API_KEY / VAPI_PHONE_NUMBER_ID / VAPI_ASSISTANT_ID not all set",
      phone,
    });
    return { mocked: true, phone };
  }
  const call = await vapiFetch(`/call`, "POST", {
    assistantId: config.vapi.assistantId,
    phoneNumberId: config.vapi.phoneNumberId,
    customer: { number: phone, name: name || undefined },
    metadata: { email: email || undefined, source: "website-callback" },
  });
  logger.info("vapi.callback.placed", { phone, callId: call.id });
  return { mocked: false, callId: call.id };
}
