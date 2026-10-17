# What we need from the client (maps to `.env`)

Nothing below blocks us from building — the app already runs in mock mode. These
are needed to switch each integration from MOCK to LIVE and to go to production.

## 🔴 Hard blockers (go-live is impossible without these)
| Item | `.env` key(s) | Notes |
|---|---|---|
| Twilio number + creds | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `VAPI_PHONE_NUMBER_ID` | Pending "compliance". Link the number inside Vapi, then paste the Vapi phone-number id. Until then, test on the Vapi web console. |
| Price source decision | (confirm in chat) | The calculator needs an EXW value. Default implemented: **agent quotes off the prospect's stated budget**. If the client wants fixed catalog prices, send the catalog and we add a lookup. |
| Website form platform | (for `/callback-request`) | WordPress / Webflow / HubSpot? We add a webhook on the form that POSTs `{phone,name,email}` to `/callback-request`. |
| HubSpot deal config | `HUBSPOT_PIPELINE_ID`, `HUBSPOT_DEALSTAGE_ID` | Which pipeline/stage new deals land in, and whether deal **amount** = DDP value (current default) or monthly lease. |

## 🟡 Needed before production
| Item | `.env` key(s) | Notes |
|---|---|---|
| HubSpot private-app token | `HUBSPOT_ACCESS_TOKEN` | Scopes: `crm.objects.contacts` + `crm.objects.deals` (read/write). We already have the user invite. |
| Vapi API key + credits | `VAPI_API_KEY` | Confirm a number is bought and there are test credits. |
| Google service account | `GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_DOC_TEMPLATE_ID`, `GOOGLE_DRIVE_OUTPUT_FOLDER_ID` | Share the template Doc + output folder with the service-account email as Editor. (Local PDF works meanwhile.) |
| SMTP / email sender | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` | Use a domain sender with SPF/DKIM so proposals don't hit spam. |
| Voice choice | `VAPI_VOICE_PROVIDER`, `VAPI_VOICE_ID` | Pick the female voice. |

## 🟢 Decisions to confirm (we have sensible defaults)
- 3+ unit discount: default **10%** (spec says 10–15%) → `DISCOUNT_3PLUS_UNITS`.
- Total-Engineer on-site engineer monthly: default **$13,500** (spec $12k–$15k) → `ONSITE_ENGINEER_MONTHLY`.
- Call recording / AI-disclosure consent wording (legal).
