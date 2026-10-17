// HTTP entrypoint. One webhook Vapi calls for BOTH tool calls and end-of-call
// reports, plus a form->callback trigger and dev helpers.
import express from "express";
import { config, features, readinessReport } from "./config.js";
import { logger } from "./utils/logger.js";
import { handleToolCalls } from "./vapi/toolHandlers.js";
import { handleEndOfCall } from "./orchestrator.js";
import { calculateLeaseQuote } from "./pricing.js";
import { triggerOutboundCallback } from "./services/vapiClient.js";

const app = express();
app.use(express.json({ limit: "2mb" }));

// --- Health / readiness -------------------------------------------------------
app.get("/health", (_req, res) => res.json({ ok: true, readiness: readinessReport() }));

// --- Vapi webhook: tool-calls + end-of-call-report + status-update ------------
app.post("/vapi", async (req, res) => {
  // Optional shared-secret check
  if (config.vapi.webhookSecret) {
    const got = req.get("x-vapi-secret");
    if (got !== config.vapi.webhookSecret) {
      logger.warn("vapi.webhook.badSecret");
      return res.status(401).json({ error: "unauthorized" });
    }
  }

  const message = req.body?.message ?? req.body ?? {};
  const type = message.type;

  try {
    if (type === "tool-calls") {
      // Must respond synchronously with tool results.
      return res.json(handleToolCalls(message));
    }

    if (type === "end-of-call-report") {
      // Ack immediately, then process async so Vapi isn't kept waiting.
      res.json({ received: true });
      handleEndOfCall(message).catch((err) =>
        logger.error("vapi.endOfCall.error", { error: String(err.message) })
      );
      return;
    }

    // status-update and everything else: just ack.
    return res.json({ received: true });
  } catch (err) {
    logger.error("vapi.webhook.error", { type, error: String(err.message) });
    return res.status(500).json({ error: "internal" });
  }
});

// --- Website form -> outbound callback ----------------------------------------
// Point your WordPress/Webflow/HubSpot form webhook here. Expects at least
// { phone, name?, email? }. Fully TCPA-compliant: only fires on a form the lead
// submitted asking to be called back.
app.post("/callback-request", async (req, res) => {
  const { phone, name, email } = req.body ?? {};
  if (!phone) return res.status(400).json({ error: "phone is required" });
  try {
    const result = await triggerOutboundCallback({ phone, name, email });
    return res.json(result);
  } catch (err) {
    logger.error("callback.error", { error: String(err.message) });
    return res.status(502).json({ error: String(err.message) });
  }
});

// --- Dev helper: sanity-check pricing without a call --------------------------
// POST /dev/quote  { "exw_value": 50000, "units": 1 }
app.post("/dev/quote", (req, res) => {
  try {
    return res.json(calculateLeaseQuote(req.body ?? {}, config.pricing));
  } catch (err) {
    return res.status(400).json({ error: String(err.message) });
  }
});

app.listen(config.port, () => {
  logger.info("server.started", {
    port: config.port,
    publicBaseUrl: config.publicBaseUrl,
    readiness: readinessReport(),
  });
  // Human-friendly boot banner
  console.log(`\nWFG AI Sales Engine listening on :${config.port}`);
  console.table(readinessReport());
  if (!features.vapiLive) {
    console.log("↳ Vapi key not set — run locally and use POST /dev/quote to test pricing.\n");
  }
});

export default app;
