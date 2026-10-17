// Prevents double-processing when Vapi/Make retry a webhook. In-memory for now;
// swap `store` for Redis/a DB table keyed by call_id in production (noted in README).
const store = new Map(); // call_id -> timestamp
const TTL_MS = 1000 * 60 * 60 * 6; // 6h

export function alreadyProcessed(callId) {
  if (!callId) return false;
  const t = store.get(callId);
  if (!t) return false;
  if (Date.now() - t > TTL_MS) {
    store.delete(callId);
    return false;
  }
  return true;
}

export function markProcessed(callId) {
  if (callId) store.set(callId, Date.now());
}
