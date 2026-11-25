/**
 * Single SSRF guard for outbound tool-executor HTTP calls.
 *
 * Replaces the two asymmetric inline guards in ToolDispatcher's openapi case,
 * which missed two evasion classes both:
 *
 *   - IPv6 loopback/link-local/ULA targets (`[::1]`, `[fe80::1]`, `[fc00::1]`)
 *   - inet_aton-style IPv4 spellings a DNS name is never allowed to use
 *     (`2130706433`, `0x7f000001`, `0177.0.0.1`, `127.1`)
 *
 * The guard is lexical: it inspects the URL string only and does not resolve
 * DNS, so a public hostname that resolves to a private address (DNS rebinding)
 * is out of scope here and must be handled at the resolver/firewall layer.
 *
 * Throws an Error with a user-safe message on rejection; returns the parsed
 * URL on success so callers can chain `targetUrl = assertPublicUrl(new URL(u))`.
 */

import { isIPv6 } from 'net';

export function assertPublicUrl(url: URL | string): URL {
  const parsed = typeof url === 'string' ? new URL(url) : url;
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`URL must use http or https, got ${parsed.protocol}`);
  }
  if (parsed.username || parsed.password) {
    throw new Error('URL must not embed credentials');
  }
  // URL brackets IPv6 hosts; the bare address is what net.isIPv6 wants.
  const hostname = parsed.hostname.toLowerCase().replace(/^\[/, '').replace(/\]$/, '');
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    throw new Error('Requests to localhost/internal hosts are not allowed');
  }

  // Any hostname built from inet_aton-style numeric segments IS an IPv4
  // address as far as every resolver stack is concerned, whatever it looks
  // like. A dotted DNS name cannot contain hex or leading-zero octal
  // segments, so accepting these here never misfires on a real hostname.
  const ipv4 = parseInetAton(hostname);
  if (ipv4 !== null) {
    if (!isPublicIpv4(ipv4)) {
      throw new Error('Requests to private or reserved IP ranges are not allowed');
    }
    return parsed;
  }

  if (isIPv6(hostname) && !isPublicIpv6(hostname)) {
    throw new Error('Requests to private or reserved IPv6 addresses are not allowed');
  }

  return parsed;
}

/**
 * Parses an IPv4 address in any inet_aton spelling into a uint32.
 *
 * Covers dotted quads, the shorthand forms (`127.1` = 127.0.0.1), and
 * decimal/hex/octal segment notations (`0x7f.0.0.1`, `0177.0.0.1`,
 * `2130706433`). Returns null for anything that is not one of those, which
 * includes every plausible DNS name.
 */
export function parseInetAton(hostname: string): number | null {
  if (!/^[0-9a-fA-FxX.]+$/.test(hostname) || hostname.includes('..')) return null;
  const parts = hostname.split('.');
  if (parts.length === 0 || parts.length > 4 || parts.some((p) => p === '')) return null;

  const values: number[] = [];
  for (const part of parts) {
    let value: number;
    if (/^0[xX]/.test(part)) {
      if (part.length === 2 || /[^0-9a-fA-F]/.test(part.slice(2))) return null;
      value = parseInt(part.slice(2), 16);
    } else if (/^0[0-7]*$/.test(part)) {
      value = parseInt(part, 8);
    } else if (/^\d+$/.test(part)) {
      value = parseInt(part, 10);
    } else {
      // Hex digits without a 0x prefix is a DNS name (e.g. `beef.cafe`).
      return null;
    }
    if (!Number.isSafeInteger(value) || value < 0) return null;
    values.push(value);
  }

  // inet_aton packing: with N parts the last one fills the remaining
  // 5-N bytes, so `127.1` puts 1 in the final octet of 127.0.0.x.
  const lastValue = values[values.length - 1];
  if (lastValue >= 2 ** (8 * (5 - values.length))) return null;

  let ip = lastValue;
  for (let i = 0; i < values.length - 1; i += 1) {
    if (values[i] > 255) return null;
    ip += values[i] * 2 ** (8 * (3 - i));
  }
  return ip >>> 0;
}

/** True when a uint32 IPv4 address is globally routable. */
export function isPublicIpv4(ip: number): boolean {
  const a = ip >>> 24;
  const b = (ip >>> 16) & 0xff;
  const c = (ip >>> 8) & 0xff;
  if (a === 0 || a === 10 || a === 127) return false; // unspecified, private, loopback
  if (a === 100 && b >= 64 && b <= 127) return false; // 100.64/10 CGNAT
  if (a === 169 && b === 254) return false; // link-local
  if (a === 172 && b >= 16 && b <= 31) return false; // 172.16/12 private
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false; // 192.0.0/24, TEST-NET-1
  if (a === 192 && b === 168) return false; // 192.168/16 private
  if (a === 198 && (b === 18 || b === 19)) return false; // 198.18/15 benchmarking
  if (a === 198 && b === 51 && c === 100) return false; // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return false; // TEST-NET-3
  if (a >= 224) return false; // multicast, reserved, broadcast
  return true;
}

/**
 * True when an IPv6 address is globally routable. Rejects loopback,
 * unspecified, link-local, unique-local, multicast, documentation,
 * discard-only, and — critically — every embed-an-IPv4 form, recursing the
 * embedded address through the IPv4 checks so `[::ffff:127.0.0.1]` and
 * `[::7f00:1]` are caught by the same rules as their plain spellings.
 */
export function isPublicIpv6(address: string): boolean {
  const hextets = ipv6Hextets(address);
  if (!hextets) return false;

  const isZero = (h: number[]) => h.every((v) => v === 0);
  if (isZero(hextets)) return false; // ::
  if (isZero(hextets.slice(0, 7)) && hextets[7] === 1) return false; // ::1

  const tail = ((hextets[6] << 16) | hextets[7]) >>> 0;
  const prefixZero = isZero(hextets.slice(0, 5)); // hextets 0-4; 5 is checked per form
  if (prefixZero && hextets[5] === 0xffff) return isPublicIpv4(tail); // ::ffff:0:0/96 mapped
  if (prefixZero && hextets[5] === 0) return isPublicIpv4(tail); // deprecated ::/96 compatible
  if (hextets[0] === 0x2002) return isPublicIpv4(((hextets[1] << 16) | hextets[2]) >>> 0); // 6to4
  if (hextets[0] === 0x64 && hextets[1] === 0xff9b && isZero(hextets.slice(2, 6))) {
    return isPublicIpv4(tail); // well-known NAT64
  }
  if (hextets[0] === 0x2001 && hextets[1] === 0x0db8) return false; // documentation
  if (hextets[0] === 0x0100 && isZero(hextets.slice(1, 4))) return false; // 100::/64 discard
  if ((hextets[0] & 0xfe00) === 0xfc00) return false; // fc00::/7 unique-local
  if ((hextets[0] & 0xffc0) === 0xfe80) return false; // fe80::/10 link-local
  if ((hextets[0] & 0xff00) === 0xff00) return false; // ff00::/8 multicast
  return true;
}

/** Expands an IPv6 literal (with :: compression, optional IPv4 tail and zone) into 8 hextets. */
function ipv6Hextets(address: string): number[] | null {
  let addr = address;
  const zone = addr.indexOf('%');
  if (zone !== -1) addr = addr.slice(0, zone);

  const halves = addr.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const groups = [...head, ...tail];

  // A trailing dotted-quad (::ffff:1.2.3.4) folds into the final two hextets.
  const v4 =
    groups.length >= 1 && groups[groups.length - 1].includes('.')
      ? parseInetAton(groups.pop() as string)
      : null;
  const hextetCount = groups.length + (v4 !== null ? 2 : 0);
  if (halves.length === 1 ? hextetCount !== 8 : hextetCount > 8) return null;
  if (halves.length === 2) {
    // :: compression fills the remainder only when a compressed form is used.
    // Fill before appending the v4 tail: the tail always sits at the far end.
    while (groups.length < 8 - (v4 !== null ? 2 : 0)) groups.splice(head.length, 0, '0');
  }

  const hextets: number[] = groups.map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN));
  if (hextets.some(Number.isNaN)) return null;
  if (v4 !== null) {
    hextets.push(v4 >>> 16, v4 & 0xffff);
  }
  if (hextets.length !== 8) return null;
  return hextets;
}
