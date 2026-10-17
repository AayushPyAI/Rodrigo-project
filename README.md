# WFG AI Sales Engine

Automated inbound voice-sales pipeline for Wyoming Frontier Global LLC:

**Vapi (GPT-4o voice agent) → deterministic HASS-lease pricing → HubSpot CRM → dynamic PDF proposal → client + management emails**, plus a website-form → outbound-callback trigger.

Built to run **today, before credentials arrive**: every external integration has a safe **mock mode** that logs instead of calling the API. Drop real values into `.env` and each one flips to live — no code changes.

---

## Architecture

```
Caller ─▶ Twilio # ─▶ Vapi assistant (GPT-4o, EN/ES, female voice)
                         │   • qualifies, enforces $50k floor
                         │   • calls calculate_lease_quote tool ──▶  POST /vapi (tool-calls)
                         │                                           └▶ src/pricing.js (deterministic)
                         ▼
                  end-of-call-report ──────────────────────────▶  POST /vapi (end-of-call-report)
                                                                        │ src/orchestrator.js
                        ┌───────────────────────────────────────────────┼─────────────────────────┐
                        ▼                         ▼                      ▼                          ▼
                 normalize (schema.js)     HubSpot upsert         Proposal PDF              2 emails
                                           (contact + deal)   (Google Docs OR pdkit)   client + management

Website form ─▶ POST /callback-request ─▶ Vapi outbound call
```

The pricing engine is the single source of truth for the number the agent **speaks** and the number printed on the **PDF** — they can never disagree.

## Quick start

```bash
cd wfg-ai-sales-engine
cp .env.example .env            # fill in later; blanks = mock mode
npm install
npm test                        # pricing engine unit tests (10)
npm run quote 50000 1           # sanity-check a quote from the CLI
npm start                       # boots the server; prints a LIVE/MOCK readiness table
```

Test the pieces with no credentials:

```bash
# pricing
curl -s localhost:3000/dev/quote -H 'content-type: application/json' \
  -d '{"exw_value":50000,"units":1}' | jq

# simulate a Vapi tool call
curl -s localhost:3000/vapi -H 'content-type: application/json' -d '{
  "message":{"type":"tool-calls","toolCallList":[
    {"id":"tc1","name":"calculate_lease_quote","arguments":{"exw_value":250000,"units":2}}]}}' | jq

# simulate an end-of-call report (runs the full HubSpot/PDF/email pipeline in mock mode)
curl -s localhost:3000/vapi -H 'content-type: application/json' -d '{
  "message":{"type":"end-of-call-report",
    "call":{"id":"call_demo_1"},
    "analysis":{"summary":"Interested in 2 injection molders",
      "structuredData":{"client_name":"Jane Doe","company_name":"Acme Plastics",
        "email":"jane@acme.com","equipment_type":"injection molding machine",
        "units":2,"exw_value":120000,"modality":"prime_lease","sourcing_route":"asian"}}}}'
```

## Project layout

```
src/
  index.js            Express app: /vapi, /callback-request, /dev/quote, /health
  config.js           loads .env, derives LIVE/MOCK feature flags
  pricing.js          ★ deterministic HASS-lease calculator (single source of truth)
  schema.js           canonical CallData shape (zod) + normalizer
  orchestrator.js     post-call pipeline (HubSpot → PDF → emails), idempotent
  vapi/
    systemPrompt.js   lean refactored agent prompt (pricing delegated to the tool)
    assistant.config.js  Vapi assistant object + tool + structured-data schema
    toolHandlers.js   answers calculate_lease_quote tool calls
  services/
    hubspot.js        contact+deal upsert (standard props only; mock fallback)
    proposal.js       Google Docs → PDF  OR  local pdfkit PDF
    email.js          client proposal + management summary (SMTP; mock fallback)
    vapiClient.js     Vapi REST (deploy assistant + outbound callbacks)
    idempotency.js    per-call dedupe
scripts/
  deploy-vapi.js      create/update the assistant (prints JSON in mock mode)
  quote.js            CLI pricing check
knowledge/catalog.md  upload as the Vapi Knowledge Base
templates/proposal-google-doc.md   how to build the Google Docs template
docs/CLIENT_CHECKLIST.md           what the client still owes (maps to .env)
docs/MAKE_SCENARIO.md              optional Make.com equivalent
test/pricing.test.js
```

## Going live (per integration)

| Integration | Flip to live by setting | Until then |
|---|---|---|
| Vapi agent | `VAPI_API_KEY`, then `npm run deploy:vapi`, paste `VAPI_ASSISTANT_ID` | `deploy:vapi` prints the assistant JSON to paste manually |
| Telephony | link Twilio # in Vapi → `VAPI_PHONE_NUMBER_ID` | test on Vapi web console |
| HubSpot | `HUBSPOT_ACCESS_TOKEN` (+ pipeline/stage) | payloads logged |
| Proposal PDF | `PROPOSAL_PROVIDER=google` + `GOOGLE_DOC_TEMPLATE_ID` + service account | local pdfkit PDF |
| Email | `SMTP_HOST/USER/PASS` + `EMAIL_FROM` | sends logged |
| Form callback | point the website form webhook at `/callback-request` | returns mock |

Full list with notes: **`docs/CLIENT_CHECKLIST.md`**.

## Deploy the assistant

```bash
npm run deploy:vapi
```

Set the assistant's **Server URL** (and the tool's server URL) to `${PUBLIC_BASE_URL}/vapi`. In dev, expose localhost with an ngrok/Cloudflare tunnel and set `PUBLIC_BASE_URL` to that HTTPS URL. Upload `knowledge/catalog.md` as the Knowledge Base.

## Production notes
- Swap `src/services/idempotency.js` (in-memory) for Redis or a DB table keyed on `call_id`.
- Set `VAPI_WEBHOOK_SECRET` and configure the same secret on the assistant to authenticate webhooks.
- Keep `service-account.json` out of git (already in `.gitignore`); mount it as a secret in prod.
- Confirm legal wording for AI-disclosure + call-recording consent before live calls.

## What was intentionally de-scoped
- **SignWell** — dropped by the client (replaced by the Make/Docs PDF). No e-signature step.
- **Datasheets** — custom/on-demand per the client; v1 generates the Executive Proposal only. The pipeline leaves an attachment hook for datasheets later.
