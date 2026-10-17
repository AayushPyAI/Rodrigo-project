// Central config. Loads .env once, derives feature flags, and tells the rest of
// the app which integrations are LIVE vs running in MOCK mode (credential absent).
import "dotenv/config";
import { pricingConfigFromEnv } from "./pricing.js";

const env = process.env;
const blank = (v) => v === undefined || v === null || String(v).trim() === "";
const val = (v, d = "") => (blank(v) ? d : String(v).trim());

export const config = {
  port: Number(val(env.PORT, "3000")),
  publicBaseUrl: val(env.PUBLIC_BASE_URL, "https://your-server.example.com"),
  logLevel: val(env.LOG_LEVEL, "info"),

  vapi: {
    apiKey: val(env.VAPI_API_KEY),
    assistantId: val(env.VAPI_ASSISTANT_ID),
    phoneNumberId: val(env.VAPI_PHONE_NUMBER_ID),
    webhookSecret: val(env.VAPI_WEBHOOK_SECRET),
    voiceProvider: val(env.VAPI_VOICE_PROVIDER, "11labs"),
    voiceId: val(env.VAPI_VOICE_ID, "paula"),
    transcriberLanguage: val(env.VAPI_TRANSCRIBER_LANGUAGE, "multi"),
  },

  pricing: pricingConfigFromEnv(env),

  hubspot: {
    accessToken: val(env.HUBSPOT_ACCESS_TOKEN),
    pipelineId: val(env.HUBSPOT_PIPELINE_ID, "default"),
    dealStageId: val(env.HUBSPOT_DEALSTAGE_ID, "appointmentscheduled"),
  },

  proposal: {
    provider: val(env.PROPOSAL_PROVIDER, "local"), // 'google' | 'local'
    googleServiceAccountJson: val(env.GOOGLE_SERVICE_ACCOUNT_JSON, "./secrets/service-account.json"),
    googleDocTemplateId: val(env.GOOGLE_DOC_TEMPLATE_ID),
    googleDriveOutputFolderId: val(env.GOOGLE_DRIVE_OUTPUT_FOLDER_ID),
  },

  email: {
    provider: val(env.EMAIL_PROVIDER, "smtp"),
    smtpHost: val(env.SMTP_HOST),
    smtpPort: Number(val(env.SMTP_PORT, "587")),
    smtpUser: val(env.SMTP_USER),
    smtpPass: val(env.SMTP_PASS),
    from: val(env.EMAIL_FROM, "WFG Holding LLC <noreply@wyomingfrontierglobal.com>"),
    managementEmail: val(env.MANAGEMENT_EMAIL, "management@wyomingfrontierglobal.com"),
  },

  company: {
    name: val(env.COMPANY_NAME, "Wyoming Frontier Global LLC"),
    address: val(env.COMPANY_ADDRESS, "1603 Capitol Ave, Suite 414, Cheyenne, WY 82001, USA"),
    website: val(env.COMPANY_WEBSITE, "wyomingfrontierglobal.com"),
  },
};

// Feature flags: an integration is LIVE only when its credential is present.
export const features = {
  hubspotLive: !blank(config.hubspot.accessToken),
  proposalGoogleLive:
    config.proposal.provider === "google" && !blank(config.proposal.googleDocTemplateId),
  emailLive: config.email.provider === "smtp" && !blank(config.email.smtpHost),
  vapiLive: !blank(config.vapi.apiKey),
};

/** One-line readiness summary printed at boot. */
export function readinessReport() {
  const flag = (ok, pendingLabel) => (ok ? "LIVE" : `MOCK (pending ${pendingLabel})`);
  return {
    HubSpot: flag(features.hubspotLive, "HUBSPOT_ACCESS_TOKEN"),
    Proposal:
      config.proposal.provider === "google"
        ? flag(features.proposalGoogleLive, "GOOGLE_DOC_TEMPLATE_ID + service account")
        : "LOCAL PDF (pdfkit)",
    Email: flag(features.emailLive, "SMTP_HOST/USER/PASS"),
    Vapi: flag(features.vapiLive, "VAPI_API_KEY"),
  };
}
