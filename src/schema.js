// The ONE canonical shape of a captured call. Everything downstream (HubSpot,
// the PDF, the emails) reads from this object, so there is a single contract.
//
// Vapi fills most of this via its structured-data extraction plan (see
// src/vapi/assistant.config.js). We normalize/validate it here before use.
import { z } from "zod";

export const CallDataSchema = z.object({
  // Contact
  client_name: z.string().default(""),
  company_name: z.string().default(""),
  position: z.string().default(""),
  email: z
    .string()
    .trim()
    .email()
    .or(z.literal(""))
    .catch("")
    .default(""),
  phone: z.string().default(""),

  // Opportunity
  equipment_type: z.string().default(""),
  units: z.coerce.number().int().positive().catch(1).default(1),
  sourcing_route: z.enum(["asian", "european", "hybrid"]).catch("asian").default("asian"),
  exw_value: z.coerce.number().nonnegative().catch(0).default(0),
  ddp_value: z.coerce.number().nonnegative().catch(0).default(0),
  monthly_lease: z.coerce.number().nonnegative().catch(0).default(0),
  modality: z
    .enum(["prime_lease", "total_engineer", "capital_sale"])
    .catch("prime_lease")
    .default("prime_lease"),
  service_option: z.enum(["A", "B", "C"]).nullable().catch(null).default(null),
  timeline: z.string().default(""),
  language: z.enum(["en", "es"]).catch("en").default("en"),

  // Provenance
  call_id: z.string().default(""),
  transcript_url: z.string().default(""),
});

/** @typedef {z.infer<typeof CallDataSchema>} CallData */

/**
 * Normalize a loose object (from Vapi structuredData) into canonical CallData.
 * Unknown/extra keys are dropped; bad values fall back to safe defaults.
 */
export function normalizeCallData(raw = {}) {
  // Map a few likely alias keys from the extraction plan to our canonical names.
  const aliased = {
    ...raw,
    company_name: raw.company_name ?? raw.company ?? raw.company_plant ?? "",
    client_name: raw.client_name ?? raw.full_name ?? raw.name ?? "",
    equipment_type: raw.equipment_type ?? raw.equipment_required ?? raw.machinery ?? "",
    exw_value: raw.exw_value ?? raw.deal_size ?? raw.budget ?? 0,
  };
  return CallDataSchema.parse(aliased);
}
