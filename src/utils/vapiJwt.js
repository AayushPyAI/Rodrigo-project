// Mint short-lived Vapi JWTs (HS256, signed with the private API key).
// Public-scope tokens can be used by the browser Web SDK to start a web call
// without needing the client's dashboard or a separate public API key.
import crypto from "node:crypto";

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

export function mintVapiPublicJwt({
  orgId,
  privateKey,
  assistantId,
  allowedOrigins = ["http://localhost:3000", "http://127.0.0.1:3000"],
  expiresInSec = 3600,
}) {
  if (!orgId) throw new Error("orgId is required");
  if (!privateKey) throw new Error("privateKey is required");

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    orgId,
    token: {
      tag: "public",
      restrictions: {
        enabled: true,
        allowedOrigins,
        allowedAssistantIds: assistantId ? [assistantId] : undefined,
        allowTransientAssistant: false,
      },
    },
    iat: now,
    exp: now + expiresInSec,
  };

  const data = `${b64url(header)}.${b64url(payload)}`;
  const sig = crypto.createHmac("sha256", privateKey).update(data).digest("base64url");
  return `${data}.${sig}`;
}
