// HubSpot CRM: upsert the Contact (by email) and create a Deal associated to it.
// Uses only STANDARD properties so it works with zero custom-property setup; the
// full deal detail goes into the deal `description`. Optional custom properties
// are documented in docs/CLIENT_CHECKLIST.md.
//
// If HUBSPOT_ACCESS_TOKEN is absent -> MOCK mode (logs the payload, no API call).
import { Client } from "@hubspot/api-client";
import { config, features } from "../config.js";
import { logger } from "../utils/logger.js";

function dealDescription(data, quote) {
  return [
    `Equipment: ${data.equipment_type || "n/a"} x${data.units}`,
    `Sourcing route: ${data.sourcing_route}`,
    `Modality: ${data.modality}${data.service_option ? ` (option ${data.service_option})` : ""}`,
    `EXW value (stated): $${Number(data.exw_value || 0).toLocaleString("en-US")}`,
    quote ? `DDP value: $${quote.ddpValue.toLocaleString("en-US")}` : null,
    quote ? `Monthly lease: $${quote.monthlyQuoted.toLocaleString("en-US")}` : null,
    `Timeline: ${data.timeline || "n/a"}`,
    `Language: ${data.language}`,
    data.transcript_url ? `Transcript: ${data.transcript_url}` : null,
    `Source: Vapi AI voice agent (call ${data.call_id || "n/a"})`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * @returns {Promise<{mocked:boolean, contactId?:string, dealId?:string}>}
 */
export async function upsertContactAndDeal(data, quote) {
  const [firstname, ...rest] = (data.client_name || "").trim().split(/\s+/);
  const lastname = rest.join(" ");
  const amount = quote?.ddpValue || data.ddp_value || 0; // deal amount = total DDP contract value
  const dealname = `${data.company_name || data.client_name || "New prospect"} — ${
    data.equipment_type || "Industrial machinery"
  }`;

  if (!features.hubspotLive) {
    logger.warn("hubspot.mock", {
      reason: "HUBSPOT_ACCESS_TOKEN not set",
      contact: { email: data.email, firstname, lastname, company: data.company_name },
      deal: { dealname, amount, pipeline: config.hubspot.pipelineId, dealstage: config.hubspot.dealStageId },
    });
    return { mocked: true };
  }

  const hs = new Client({ accessToken: config.hubspot.accessToken });

  // --- Upsert contact by email ---
  let contactId;
  const contactProps = {
    email: data.email || undefined,
    firstname: firstname || undefined,
    lastname: lastname || undefined,
    phone: data.phone || undefined,
    company: data.company_name || undefined,
    jobtitle: data.position || undefined,
  };

  if (data.email) {
    const found = await hs.crm.contacts.searchApi.doSearch({
      filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: data.email }] }],
      properties: ["email"],
      limit: 1,
    });
    if (found.results?.length) {
      contactId = found.results[0].id;
      await hs.crm.contacts.basicApi.update(contactId, { properties: contactProps });
    }
  }
  if (!contactId) {
    const created = await hs.crm.contacts.basicApi.create({ properties: contactProps });
    contactId = created.id;
  }

  // --- Create deal, associated to the contact (assoc type 3 = deal->contact) ---
  const deal = await hs.crm.deals.basicApi.create({
    properties: {
      dealname,
      amount: String(amount),
      pipeline: config.hubspot.pipelineId,
      dealstage: config.hubspot.dealStageId,
      description: dealDescription(data, quote),
    },
    associations: [
      {
        to: { id: contactId },
        types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 3 }],
      },
    ],
  });

  logger.info("hubspot.upserted", { contactId, dealId: deal.id, amount });
  return { mocked: false, contactId, dealId: deal.id };
}
