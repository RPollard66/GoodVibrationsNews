// Ollama embedding client.
//
// Talks to a remote Ollama server over HTTP to embed short text into a
// fixed-length float vector. Used for semantic search over articles.
//
// Configured via environment:
//   OLLAMA_API_URL    e.g. http://100.125.234.28:11434  (required)
//   OLLAMA_EMBED_MODEL  default "nomic-embed-text"
//
// Design goals:
//   - Non-fatal when Ollama is unreachable: embed(text) resolves to null
//     rather than throwing, so callers can degrade to keyword search.
//   - Short timeout (default 8s) so a stalled desktop can't wedge the
//     hourly refresh loop.
//   - No dependency on any HTTP library — uses the Node 18+ global fetch.

const OLLAMA_API_URL = String(process.env.OLLAMA_API_URL || "").trim();
const OLLAMA_EMBED_MODEL = String(process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text").trim();
const OLLAMA_TIMEOUT_MS = Math.max(1000, Number(process.env.OLLAMA_TIMEOUT_MS) || 8000);

function isConfigured() {
  return OLLAMA_API_URL.length > 0;
}

async function embed(text) {
  if (!isConfigured()) return null;
  const input = String(text || "").trim();
  if (!input) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);

  try {
    const url = new URL("/api/embeddings", OLLAMA_API_URL).toString();
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: OLLAMA_EMBED_MODEL, prompt: input }),
      signal: controller.signal
    });

    if (!resp.ok) return null;

    const data = await resp.json();
    if (!Array.isArray(data.embedding) || data.embedding.length === 0) return null;

    return Float32Array.from(data.embedding);
  } catch (_) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Convert a Float32Array to a Node Buffer suitable for SQLite BLOB storage.
function floatsToBlob(vec) {
  if (!vec || vec.length === 0) return null;
  return Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength);
}

// Convert a SQLite BLOB (Node Buffer) back into a Float32Array. Copies
// bytes into a fresh, correctly-aligned ArrayBuffer.
function blobToFloats(buf) {
  if (!buf || buf.length === 0) return null;
  if (buf.length % 4 !== 0) return null;
  const ab = new ArrayBuffer(buf.length);
  new Uint8Array(ab).set(buf);
  return new Float32Array(ab);
}

module.exports = {
  embed,
  floatsToBlob,
  blobToFloats,
  isConfigured,
  OLLAMA_EMBED_MODEL,
  OLLAMA_API_URL
};
