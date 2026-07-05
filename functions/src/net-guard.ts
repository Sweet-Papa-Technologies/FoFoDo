/**
 * SSRF guard for user-supplied outbound URLs (reminder webhooks, REQ-REM-02).
 *
 * A reminder webhook URL is fully user-controlled and is fetched server-side by
 * the scheduler, so without validation it is a classic SSRF sink (cloud metadata
 * endpoint, internal services, localhost port scanning). We defend in two layers:
 *   • validateWebhookUrl() — synchronous, at write time: require https and reject
 *     obviously-internal hosts / literal private IPs. Fails fast with a clear error.
 *   • assertPublicUrl() — async, at dispatch time: additionally resolve DNS and
 *     reject if ANY resolved address is private/loopback/link-local. This closes
 *     the DNS-rebinding gap that a write-time check alone cannot.
 */
import { lookup } from "dns/promises";
import { isIP } from "net";

const BLOCKED_HOSTS = new Set([
  "localhost",
  "metadata",
  "metadata.google.internal",
]);

/** Lowercase and strip the []-brackets WHATWG URL puts around IPv6 literals so
 * isIP()/isPrivateIp() see a bare address. */
function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
}

/** True if an IP literal is loopback / private / link-local / otherwise not a
 * routable public address (IPv4 and IPv6, including IPv4-mapped IPv6). */
export function isPrivateIp(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return isPrivateV4(ip);
  if (kind === 6) {
    const lc = ip.toLowerCase();
    // IPv4-mapped (::ffff:a.b.c.d) — validate the embedded v4 address.
    const mapped = lc.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateV4(mapped[1]);
    if (lc === "::1" || lc === "::") return true; // loopback / unspecified
    if (lc.startsWith("fe80")) return true; // link-local
    if (lc.startsWith("fc") || lc.startsWith("fd")) return true; // unique-local
    return false;
  }
  // Not an IP literal → caller must resolve DNS first.
  return false;
}

function isPrivateV4(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true; // malformed → treat as unsafe
  return (
    p[0] === 0 || // "this" network
    p[0] === 10 || // private
    p[0] === 127 || // loopback
    (p[0] === 100 && p[1] >= 64 && p[1] <= 127) || // carrier-grade NAT
    (p[0] === 169 && p[1] === 254) || // link-local (incl. cloud metadata)
    (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || // private
    (p[0] === 192 && p[1] === 168) || // private
    p[0] >= 224 // multicast / reserved
  );
}

/** Synchronous, write-time validation. Returns the normalized URL string, or
 * throws Error with a user-facing message. */
export function validateWebhookUrl(raw: unknown): string {
  if (typeof raw !== "string" || !raw.trim()) throw new Error("webhookUrl must be a non-empty string");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("webhookUrl must be a valid URL");
  }
  if (url.protocol !== "https:") throw new Error("webhookUrl must use https");
  const host = normalizeHost(url.hostname);
  if (BLOCKED_HOSTS.has(host)) throw new Error("webhookUrl host is not allowed");
  if (isIP(host) && isPrivateIp(host)) throw new Error("webhookUrl may not target a private or loopback address");
  return url.toString();
}

/** Async, dispatch-time check: re-validate scheme/host AND resolve DNS, rejecting
 * if the host resolves to any private/loopback/link-local address. */
export async function assertPublicUrl(raw: string): Promise<void> {
  const url = new URL(validateWebhookUrl(raw));
  const host = normalizeHost(url.hostname);
  if (isIP(host)) {
    if (isPrivateIp(host)) throw new Error("webhookUrl resolves to a private address");
    return;
  }
  const results = await lookup(host, { all: true });
  if (!results.length) throw new Error("webhookUrl host could not be resolved");
  for (const r of results) {
    if (isPrivateIp(r.address)) throw new Error("webhookUrl resolves to a private address");
  }
}
