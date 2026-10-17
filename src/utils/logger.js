// Tiny leveled logger. Structured-ish, dependency-free.
const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const current = LEVELS[process.env.LOG_LEVEL ?? "info"] ?? LEVELS.info;

function emit(level, msg, meta) {
  if (LEVELS[level] > current) return;
  const line = { t: new Date().toISOString(), level, msg };
  if (meta !== undefined) line.meta = meta;
  const out = level === "error" ? console.error : console.log;
  out(JSON.stringify(line));
}

export const logger = {
  error: (msg, meta) => emit("error", msg, meta),
  warn: (msg, meta) => emit("warn", msg, meta),
  info: (msg, meta) => emit("info", msg, meta),
  debug: (msg, meta) => emit("debug", msg, meta),
};
