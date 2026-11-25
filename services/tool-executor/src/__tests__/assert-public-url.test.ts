import { assertPublicUrl, parseInetAton } from '../utils/assertPublicUrl';
import { extractJsonObject } from '../adk/resilience';
import { createDeclarativeCodeSkill } from '../adk/code-skill-factory';

const ok = (url: string) => expect(() => assertPublicUrl(new URL(url))).not.toThrow();
const blocked = (url: string) => expect(() => assertPublicUrl(new URL(url))).toThrow();

describe('assertPublicUrl — accepted targets', () => {
  it('accepts public http/https URLs', () => {
    ok('https://api.example.com/v1/things?q=1');
    ok('http://example.org');
  });

  it('accepts public IPv4 literals', () => {
    ok('https://8.8.8.8/dns-query');
    ok('http://1.1.1.1/');
  });

  it('accepts public IPv6 literals', () => {
    ok('https://[2606:4700:4700::1111]/');
    ok('https://[2620:fe::fe]/');
  });

  it('accepts public IPv4 embedded in IPv6 forms', () => {
    ok('https://[::ffff:8.8.8.8]/');
    ok('https://[0:0:0:0:0:ffff:1.2.3.4]/');
  });
});

describe('assertPublicUrl — structural rejections', () => {
  it('rejects non-http protocols', () => {
    blocked('ftp://example.com/file');
    blocked('file:///etc/passwd');
  });

  it('rejects embedded credentials', () => {
    blocked('https://user:pass@example.com/');
    blocked('https://apikey@example.com/');
  });
});

describe('assertPublicUrl — named-host rejections', () => {
  it('rejects localhost and internal-suffix hosts', () => {
    blocked('http://localhost:3000/');
    blocked('http://sub.localhost/');
    blocked('http://printer.local/');
    blocked('http://mongo.internal/');
  });
});

describe('assertPublicUrl — IPv4 rejections', () => {
  it('rejects dotted-quad private and reserved ranges', () => {
    blocked('http://127.0.0.1/'); // loopback
    blocked('http://10.1.2.3/'); // private
    blocked('http://172.16.0.1/'); // 172.16/12
    blocked('http://172.31.255.255/'); // 172.16/12 upper
    blocked('http://192.168.1.1/'); // private
    blocked('http://169.254.169.254/'); // link-local metadata
    blocked('http://0.0.0.0/'); // unspecified
    blocked('http://100.64.0.1/'); // CGNAT
    blocked('http://224.0.0.1/'); // multicast
    blocked('http://255.255.255.255/'); // broadcast
    blocked('http://192.0.2.1/'); // TEST-NET-1
  });

  it('rejects inet_aton evasion spellings the old guard missed', () => {
    blocked('http://2130706433/'); // decimal = 127.0.0.1
    blocked('http://0x7f000001/'); // hex = 127.0.0.1
    blocked('http://0x7f.0.0.1/'); // mixed hex
    blocked('http://0177.0.0.1/'); // octal = 127.0.0.1
    blocked('http://127.1/'); // shorthand = 127.0.0.1
    blocked('http://127.0.1/'); // shorthand = 127.0.0.1
    blocked('http://0/'); // = 0.0.0.0
    blocked('http://0x0a000001/'); // hex = 10.0.0.1
  });

  it('treats hex-looking DNS names as DNS names, not IPs', () => {
    ok('https://beef.example.com/');
    ok('http://beefcafe.io/');
  });
});

describe('assertPublicUrl — IPv6 rejections (gap closed)', () => {
  it('rejects loopback, unspecified, link-local, ULA, multicast', () => {
    blocked('http://[::1]/');
    blocked('http://[::]/');
    blocked('http://[fe80::1]/');
    blocked('http://[fc00::1]/');
    blocked('http://[fd12:3456:789a::1]/');
    blocked('http://[ff02::1]/');
    blocked('http://[2001:db8::1]/'); // documentation range
  });

  it('rejects IPv4 embedded in IPv6 through the same IPv4 rules', () => {
    blocked('http://[::ffff:127.0.0.1]/'); // mapped, dotted
    blocked('http://[::ffff:7f00:1]/'); // mapped, hex hextets
    blocked('http://[::127.0.0.1]/'); // deprecated compatible form
    blocked('http://[2002:7f00:1::]/'); // 6to4 wrapping 127.0.0.1
    blocked('http://[64:ff9b::7f00:1]/'); // NAT64 wrapping 127.0.0.1
    blocked('http://[::ffff:0a00:0001]/'); // mapped 10.0.0.1
  });

  it('rejects zone-index forms of local addresses', () => {
    expect(() => assertPublicUrl(new URL('http://[fe80::1%25eth0]/'))).toThrow();
  });
});

describe('assertPublicUrl — parseInetAton', () => {
  it('packs shorthand forms like inet_aton', () => {
    expect(parseInetAton('127.0.0.1')).toBe(0x7f000001);
    expect(parseInetAton('127.1')).toBe(0x7f000001);
    expect(parseInetAton('2130706433')).toBe(0x7f000001);
    expect(parseInetAton('0x7f000001')).toBe(0x7f000001);
    expect(parseInetAton('0177.0.0.1')).toBe(0x7f000001);
  });

  it('returns null for anything that is a plausible DNS name', () => {
    expect(parseInetAton('example.com')).toBeNull();
    expect(parseInetAton('beef.cafe')).toBeNull();
    expect(parseInetAton('300.1.1.1')).toBeNull(); // out-of-range octet is not a quad
    expect(parseInetAton('')).toBeNull();
  });
});

describe('assertPublicUrl — sandbox parity of extractJsonObject', () => {
  // The skill preamble embeds extractJsonObject via Function.prototype.toString.
  // Compile that serialization back to a function and require identical
  // behavior on the cases the skill handlers rely on.
  const tool = createDeclarativeCodeSkill({
    id: 'parity-probe',
    name: 'Parity Probe',
    description: 'test',
    manifest: { sourceCode: 'unused', language: 'javascript', entrypoint: 'index.js' },
    handler: async function handler() {
      return { ok: true };
    },
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
  });
  const embedded = (tool.manifest as Record<string, unknown>).sourceCode as string;
  const match = embedded.match(/const extractJsonObject = ([\s\S]*?);\n {4}const handler/);
  if (!match) throw new Error('preamble no longer serializes extractJsonObject');
  const sandboxed = new Function(`return ${match[1]};`)() as typeof extractJsonObject;

  it('behaves identically to the host-side helper', () => {
    const cases: Array<[string, Record<string, unknown> | null]> = [
      ['{"a":1}', { a: 1 }],
      ['prose {"a":{"b":"c { d }"}} more', { a: { b: 'c { d }' } }],
      ['first {"a":1} second {"b":2}', { a: 1 }],
      ['no object here', null],
      ['{"broken":', null],
    ];
    for (const [text, expected] of cases) {
      expect(sandboxed(text)).toEqual(expected);
      expect(sandboxed(text)).toEqual(extractJsonObject(text));
    }
  });
});
