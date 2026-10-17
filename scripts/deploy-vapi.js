// Creates or updates the Vapi assistant from src/vapi/assistant.config.js.
// Usage: npm run deploy:vapi
// In MOCK mode (no VAPI_API_KEY) it prints the assistant JSON so you can review
// or paste it into the Vapi dashboard manually.
import { buildAssistantConfig } from "../src/vapi/assistant.config.js";
import { createOrUpdateAssistant } from "../src/services/vapiClient.js";
import { config } from "../src/config.js";

const assistant = buildAssistantConfig();

try {
  const result = await createOrUpdateAssistant(assistant);
  if (result.mocked) {
    console.log("\n[MOCK] VAPI_API_KEY not set. Assistant that WOULD be deployed:\n");
    console.log(JSON.stringify(assistant, null, 2));
    console.log(
      "\nTo deploy for real: set VAPI_API_KEY in .env (and VAPI_ASSISTANT_ID to update in place), then re-run.\n"
    );
  } else {
    console.log(`\n✅ Assistant deployed. id = ${result.id}`);
    if (!config.vapi.assistantId) {
      console.log(`   Add this to your .env:  VAPI_ASSISTANT_ID=${result.id}\n`);
    }
  }
} catch (err) {
  console.error("\n❌ Vapi deploy failed:", err.message, "\n");
  process.exit(1);
}
