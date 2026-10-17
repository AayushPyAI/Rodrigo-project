# Google Docs proposal template — setup

The production proposal path (`PROPOSAL_PROVIDER=google`) copies a Google Doc,
replaces the `{{placeholders}}` below, and exports it to PDF. Create the template
once, then put its file id in `GOOGLE_DOC_TEMPLATE_ID`.

## How to create it
1. In the client's Google Drive (the shared "Wyoming Frontier Global LLC" folder),
   create a new Google Doc named **"WFG Executive Proposal — TEMPLATE"**.
2. Design the letterhead (logo, the company block below) and paste the body.
3. Use the EXACT placeholder tokens — double curly braces, matching case.
4. Share the Doc (and the output folder) with the service-account email
   (`client_email` in `service-account.json`) as **Editor**.
5. Copy the file id from the URL (`/document/d/<THIS_IS_THE_ID>/edit`) into
   `GOOGLE_DOC_TEMPLATE_ID`.

## Placeholders (must match exactly)
| Placeholder | Filled with |
|---|---|
| `{{Client_Name}}` | Prospect full name |
| `{{Company_Name}}` | Company / plant |
| `{{Equipment_Requested}}` | Equipment type (+ qty) |
| `{{Estimated_DDP_Value}}` | Turnkey DDP value, e.g. `$62,500` |
| `{{Modality_Selected}}` | e.g. "WFG Prime-Lease (36-month operating lease)" |
| `{{Calculated_Payment}}` | e.g. `$2,140 / month` |

## Suggested body copy
---
**WYOMING FRONTIER GLOBAL LLC**
1603 Capitol Ave, Suite 414, Cheyenne, WY 82001, USA · wyomingfrontierglobal.com

# Executive Financial Proposal

Prepared for: **{{Client_Name}}**, {{Company_Name}}

Dear {{Client_Name}},

Thank you for considering Wyoming Frontier Global for your plant's equipment needs.
Based on our conversation, here is your tailored turnkey proposal:

- **Equipment requested:** {{Equipment_Requested}}
- **Estimated Turnkey DDP value:** {{Estimated_DDP_Value}}
- **Commercial modality:** {{Modality_Selected}}
- **All-inclusive monthly payment:** {{Calculated_Payment}}

This all-inclusive, 100% tax-deductible monthly figure covers machinery, ocean
freight, customs clearance, full warranty, and automated ESG compliance reporting
under WFG's SeamlessDDP framework. Figures are indicative and subject to a formal
executed agreement.

To proceed to formal documentation, simply reply to the delivery email.

Warm regards,
Commercial Desk — Wyoming Frontier Global LLC
---

> The `local` provider (pdfkit) reproduces this same layout automatically with no
> Google setup, so you can demo the full flow before the Google account is connected.
