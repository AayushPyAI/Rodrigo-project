// Sends the two post-call emails:
//   1. Client proposal  -> prospect, with the dynamic PDF attached.
//   2. Management summary -> MANAGEMENT_EMAIL, with transcript link + JSON payload.
//
// If SMTP is not configured -> MOCK mode (logs subject/recipient, no send).
import nodemailer from "nodemailer";
import { config, features } from "../config.js";
import { logger } from "../utils/logger.js";

let transporter = null;
function getTransport() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: config.email.smtpHost,
    port: config.email.smtpPort,
    secure: config.email.smtpPort === 465,
    auth: config.email.smtpUser ? { user: config.email.smtpUser, pass: config.email.smtpPass } : undefined,
  });
  return transporter;
}

async function send({ to, subject, html, attachments }) {
  if (!features.emailLive || !to) {
    logger.warn("email.mock", { reason: features.emailLive ? "no recipient" : "SMTP not set", to, subject });
    return { mocked: true };
  }
  const info = await getTransport().sendMail({ from: config.email.from, to, subject, html, attachments });
  logger.info("email.sent", { to, subject, messageId: info.messageId });
  return { mocked: false, messageId: info.messageId };
}

export async function sendClientProposal(data, proposal) {
  if (!data.email) {
    logger.warn("email.client.skip", { reason: "no prospect email captured" });
    return { mocked: true };
  }
  const html = `
    <p>Dear ${escapeHtml(data.client_name || "Valued Client")},</p>
    <p>Thank you for speaking with Wyoming Frontier Global. As promised, please find your
    formal Executive Financial Proposal attached, covering
    <strong>${escapeHtml(proposal.mergeFields.Equipment_Requested)}</strong> under our
    <strong>${escapeHtml(proposal.mergeFields.Modality_Selected)}</strong> program at
    <strong>${escapeHtml(proposal.mergeFields.Calculated_Payment)}</strong>.</p>
    <p>Everything is delivered Turnkey DDP — freight, customs, warranty and compliance included.
    Reply to this email to proceed to formal documentation.</p>
    <p>Warm regards,<br/>Commercial Desk<br/>${escapeHtml(config.company.name)}<br/>${escapeHtml(
      config.company.website
    )}</p>`;
  return send({
    to: data.email,
    subject: `Your WFG Executive Proposal — ${proposal.mergeFields.Equipment_Requested}`,
    html,
    attachments: proposal.pdfBuffer
      ? [{ filename: proposal.fileName, content: proposal.pdfBuffer }]
      : [],
  });
}

export async function sendManagementSummary(data, quote, proposal, summaryText) {
  const html = `
    <h3>New AI voice-agent lead — ${escapeHtml(data.company_name || data.client_name || "Unknown")}</h3>
    <p><strong>Summary:</strong> ${escapeHtml(summaryText || "n/a")}</p>
    <ul>
      <li>Contact: ${escapeHtml(data.client_name)} (${escapeHtml(data.position)}) — ${escapeHtml(
        data.email
      )} / ${escapeHtml(data.phone)}</li>
      <li>Equipment: ${escapeHtml(data.equipment_type)} x${data.units} · route ${escapeHtml(
        data.sourcing_route
      )}</li>
      <li>Modality: ${escapeHtml(data.modality)}${data.service_option ? ` (opt ${data.service_option})` : ""}</li>
      <li>EXW: $${Number(data.exw_value || 0).toLocaleString("en-US")} · DDP: $${(
        quote?.ddpValue || 0
      ).toLocaleString("en-US")} · Monthly: $${(quote?.monthlyQuoted || 0).toLocaleString("en-US")}</li>
      <li>Timeline: ${escapeHtml(data.timeline)}</li>
      <li>Transcript: ${data.transcript_url ? `<a href="${data.transcript_url}">link</a>` : "n/a"}</li>
    </ul>
    <p><strong>Structured payload (JSON):</strong></p>
    <pre>${escapeHtml(JSON.stringify(data, null, 2))}</pre>`;
  return send({
    to: config.email.managementEmail,
    subject: `[WFG Lead] ${data.company_name || data.client_name || "New call"} — ${
      data.equipment_type || "inquiry"
    }`,
    html,
    attachments: proposal ? [{ filename: proposal.fileName, content: proposal.pdfBuffer }] : [],
  });
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
