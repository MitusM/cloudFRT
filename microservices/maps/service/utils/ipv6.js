// ipv6 — детекция IPv6-transition адресов, внедряющих IPv4 (для SSRF-гарда).
// Портировано из TREK server/src/utils/ipv6.ts (без изменений логики).

/** Expand an IPv6 literal into its 8 numeric hextets, or null if not a valid IPv6. */
export function expandIpv6(ip) {
  let h = ip.toLowerCase().replace(/%.*$/, '')
  if (!h.includes(':')) return null
  const dotted = h.match(/^(.*:)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)
  if (dotted) {
    const v4 = dotted[2].split('.').map(Number)
    if (v4.some((n) => n > 255)) return null
    h =
      dotted[1] +
      (((v4[0] << 8) | v4[1]).toString(16)) +
      ':' +
      (((v4[2] << 8) | v4[3]).toString(16))
  }
  const halves = h.split('::')
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(':') : []
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  const groups =
    halves.length === 2
      ? [...head, ...Array(8 - head.length - tail.length).fill('0'), ...tail]
      : head
  if (groups.length !== 8) return null
  const nums = groups.map((x) => (x === '' ? NaN : parseInt(x, 16)))
  return nums.some((n) => !Number.isInteger(n) || n < 0 || n > 0xffff) ? null : nums
}

/**
 * If `ip` is an IPv6 transition address that embeds an IPv4 target, return the
 * embedded IPv4 in dotted form; otherwise null.
 */
export function embeddedTransitionIpv4(ip) {
  const g = expandIpv6(ip.replace(/^\[/, '').replace(/\]$/, ''))
  if (!g) return null
  const v4 = (hi, lo) => `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`
  // NAT64 well-known 64:ff9b::/96 — first 96 bits fixed, last 32 = IPv4.
  if (g[0] === 0x0064 && g[1] === 0xff9b && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0) {
    return v4(g[6], g[7])
  }
  // 6to4 2002::/16 — hextets 1,2 = IPv4.
  if (g[0] === 0x2002) return v4(g[1], g[2])
  // Teredo 2001:0000::/32 — last 32 bits = client IPv4 XOR 0xffffffff.
  if (g[0] === 0x2001 && g[1] === 0x0000) return v4(g[6] ^ 0xffff, g[7] ^ 0xffff)
  return null
}
