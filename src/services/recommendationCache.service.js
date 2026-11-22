function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const ttlMs = positiveInteger(process.env.RECOMMENDATION_CACHE_TTL_MS, 30000);
const staleTtlMs = positiveInteger(process.env.RECOMMENDATION_CACHE_STALE_TTL_MS, 300000);
const maxEntries = positiveInteger(process.env.RECOMMENDATION_CACHE_MAX_ENTRIES, 1000);
const entries = new Map();

function getFresh(key, now = Date.now()) {
  const entry = entries.get(key);
  if (!entry || now >= entry.expiresAt) return null;
  return { value: entry.value, ageMs: now - entry.createdAt };
}

function getStale(key, now = Date.now()) {
  const entry = entries.get(key);
  if (!entry || now < entry.expiresAt || now >= entry.staleUntil) return null;
  return { value: entry.value, ageMs: now - entry.createdAt };
}

function set(key, value, now = Date.now()) {
  entries.delete(key);
  entries.set(key, {
    value,
    createdAt: now,
    expiresAt: now + ttlMs,
    staleUntil: now + ttlMs + staleTtlMs
  });

  while (entries.size > maxEntries) {
    entries.delete(entries.keys().next().value);
  }
}

function clear() {
  entries.clear();
}

module.exports = { getFresh, getStale, set, clear };
