// Generates the dynamic Executive Proposal PDF.
//
//   provider = 'google' : copy a Google Docs template, replace {{merge}} fields,
//                         export as PDF (production path; needs service account +
//                         GOOGLE_DOC_TEMPLATE_ID).
//   provider = 'local'  : render a clean self-contained PDF with pdfkit. Works
//                         with NO credentials — the default so the pipeline is
//                         testable today.
//
// Both return { pdfBuffer, fileName, mergeFields }.
import fs from "node:fs";
import PDFDocument from "pdfkit";
import { google } from "googleapis";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";

/** The 6 merge fields from the client's spec, derived from canonical data + quote. */
export function buildMergeFields(data, quote) {
  const fmt = (n) => `$${Number(n || 0).toLocaleString("en-US")}`;
  const modalityLabel = {
    prime_lease: "WFG Prime-Lease (36-month operating lease)",
    total_engineer: "WFG Total-Engineer (managed, resident engineer)",
    capital_sale: "WFG Capital-Sale (structured credit sale)",
  }[data.modality] || "WFG Prime-Lease";

  return {
    Client_Name: data.client_name || "Valued Client",
    Company_Name: data.company_name || "",
    Equipment_Requested: `${data.equipment_type || "Industrial machinery"}${
      data.units > 1 ? ` (x${data.units})` : ""
    }`,
    Estimated_DDP_Value: fmt(quote?.ddpValue ?? data.ddp_value),
    Modality_Selected: modalityLabel,
    Calculated_Payment: `${fmt(quote?.monthlyQuoted ?? data.monthly_lease)} / month`,
  };
}

function fileNameFor(data) {
  const safe = (data.company_name || data.client_name || "prospect")
    .replace(/[^a-z0-9]+/gi, "-")
    .toLowerCase()
    .slice(0, 40);
  return `WFG-Executive-Proposal-${safe}-${Date.now()}.pdf`;
}

export async function generateProposal(data, quote) {
  const mergeFields = buildMergeFields(data, quote);
  const fileName = fileNameFor(data);

  if (config.proposal.provider === "google" && config.proposal.googleDocTemplateId) {
    const pdfBuffer = await generateViaGoogleDocs(mergeFields, fileName);
    return { pdfBuffer, fileName, mergeFields };
  }

  if (config.proposal.provider === "google") {
    logger.warn("proposal.google.fallback", {
      reason: "GOOGLE_DOC_TEMPLATE_ID not set — using local PDF",
    });
  }
  const pdfBuffer = await generateLocalPdf(mergeFields);
  return { pdfBuffer, fileName, mergeFields };
}

// --- Google Docs provider -----------------------------------------------------
async function generateViaGoogleDocs(mergeFields, fileName) {
  const auth = new google.auth.GoogleAuth({
    keyFile: config.proposal.googleServiceAccountJson,
    scopes: ["https://www.googleapis.com/auth/documents", "https://www.googleapis.com/auth/drive"],
  });
  const authClient = await auth.getClient();
  const drive = google.drive({ version: "v3", auth: authClient });
  const docs = google.docs({ version: "v1", auth: authClient });

  // 1) Copy template
  const copy = await drive.files.copy({
    fileId: config.proposal.googleDocTemplateId,
    requestBody: {
      name: fileName.replace(/\.pdf$/, ""),
      parents: config.proposal.googleDriveOutputFolderId
        ? [config.proposal.googleDriveOutputFolderId]
        : undefined,
    },
    supportsAllDrives: true,
  });
  const docId = copy.data.id;

  // 2) Replace every {{Field}} placeholder
  const requests = Object.entries(mergeFields).map(([key, value]) => ({
    replaceAllText: {
      containsText: { text: `{{${key}}}`, matchCase: true },
      replaceText: String(value ?? ""),
    },
  }));
  if (requests.length) {
    await docs.documents.batchUpdate({ documentId: docId, requestBody: { requests } });
  }

  // 3) Export the filled doc as PDF
  const exported = await drive.files.export(
    { fileId: docId, mimeType: "application/pdf" },
    { responseType: "arraybuffer" }
  );

  logger.info("proposal.google.generated", { docId });
  return Buffer.from(exported.data);
}

// --- Local pdfkit provider ----------------------------------------------------
function generateLocalPdf(f) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 56 });
      const chunks = [];
      doc.on("data", (c) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const green = "#1f7a4d";
      // Header
      doc.fillColor(green).fontSize(20).text(config.company.name, { continued: false });
      doc.fillColor("#555").fontSize(9).text(config.company.address);
      doc.fillColor("#555").fontSize(9).text(config.company.website);
      doc.moveDown(1.5);

      doc.fillColor("#111").fontSize(16).text("Executive Financial Proposal", { underline: false });
      doc.moveDown(0.5);
      doc.fillColor("#333").fontSize(11).text(`Prepared for: ${f.Client_Name}`);
      if (f.Company_Name) doc.text(`Company: ${f.Company_Name}`);
      doc.text(`Date: ${new Date().toLocaleDateString("en-US")}`);
      doc.moveDown(1.2);

      const row = (label, value) => {
        doc.fillColor("#666").fontSize(10).text(label);
        doc.fillColor("#111").fontSize(13).text(value);
        doc.moveDown(0.6);
      };
      row("Equipment Requested", f.Equipment_Requested);
      row("Estimated Turnkey DDP Value", f.Estimated_DDP_Value);
      row("Commercial Modality", f.Modality_Selected);
      row("All-Inclusive Monthly Payment", f.Calculated_Payment);

      doc.moveDown(0.8);
      doc
        .fillColor("#333")
        .fontSize(10)
        .text(
          "This all-inclusive, 100% tax-deductible monthly figure covers machinery, ocean " +
            "freight, customs clearance, full warranty, and automated compliance reporting under " +
            "WFG's SeamlessDDP framework. Figures are indicative and subject to a formal executed " +
            "agreement.",
          { align: "justify" }
        );

      doc.moveDown(2);
      doc.fillColor("#999").fontSize(8).text(
        `${config.company.name} · ${config.company.website} · Generated by WFG AI Sales Engine`,
        { align: "center" }
      );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
