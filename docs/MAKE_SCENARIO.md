# Make.com equivalent (optional)

The client originally specced Make.com for orchestration. This repo implements the
same logic in code (more reliable, testable, version-controlled). If they still
want it in Make, replicate the post-call flow module-for-module:

```
[1] Webhook (Custom)                ← set this URL as the Vapi assistant server URL
       │   receives Vapi end-of-call-report (message.analysis.structuredData + summary)
       ▼
[2] Tools > Set variables           ← map structuredData -> canonical fields
       │
       ▼
[3] (optional) HTTP > POST /dev/quote  ← or replicate the pricing formula with Make
       │                                  functions; keep it identical to src/pricing.js
       ▼
[4] HubSpot > Search a Contact (by email)
       │
       ├── exists ──▶ HubSpot > Update a Contact
       └── none  ──▶ HubSpot > Create a Contact
       ▼
[5] HubSpot > Create a Deal (associate to the contact)
       ▼
[6] Google Docs > Create a Doc from a Template   ← fill the 6 {{merge}} fields
       ▼
[7] Google Drive > Export/Download the Doc as PDF
       ▼
[8] Email > Send an Email (to prospect)   attach the PDF
       ▼
[9] Email > Send an Email (to management@) call summary + transcript link + JSON
```

### Keeping parity with this codebase
- **Pricing MUST match `src/pricing.js` exactly** (DDP×1.25, /36, tiered HASS,
  volume discount, round to $10). Easiest: have Make call `POST /dev/quote` on this
  server so there's one source of truth instead of re-implementing the math.
- Add a **dedupe** on `call_id` (Make data store) to avoid double emails on retries.
- The canonical field list is in `src/schema.js`.
```
