// ssrfGuard — SSRF-защита исходящих HTTP-запросов (DNS-pin + безопасные редиректы).
// Портировано из TREK server/src/utils/ssrfGuard.ts (без изменений логики).
import dns from 'node:dns/promises'
import { Agent } from 'undici'
import { embeddedTransitionIpv4 } from './ipv6.js'

const ALLOW_INTERNAL_NETWORK = process.env.ALLOW_INTERNAL_NETWORK?.toLowerCase() === 'true'

// Always blocked — no override possible
function isAlwaysBlocked(ip) {
  const addr = ip.startsWith('[') ? ip.slice(1, -1) : ip

  if (addr.startsWith('127.') || addr === '::1') return true
  if (addr.startsWith('0.')) return true
  if (addr.startsWith('169.254.') || /^fe80:/i.test(addr)) return true
  if (/^::ffff:127\./i.test(addr) || /^::ffff:169\.254\./i.test(addr)) return true
  const embedded = embeddedTransitionIpv4(addr)
  if (embedded) return isAlwaysBlocked(embedded)

  return false
}

// Blocked unless ALLOW_INTERNAL_NETWORK=true
function isPrivateNetwork(ip) {
  const addr = ip.startsWith('[') ? ip.slice(1, -1) : ip

  if (addr.startsWith('10.')) return true
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(addr)) return true
  if (addr.startsWith('192.168.')) return true
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(addr)) return true
  if (/^f[cd]/i.test(addr)) return true
  if (/^::ffff:10\./i.test(addr)) return true
  if (/^::ffff:172\.(1[6-9]|2\d|3[01])\./i.test(addr)) return true
  if (/^::ffff:192\.168\./i.test(addr)) return true
  const embedded = embeddedTransitionIpv4(addr)
  if (embedded) return isPrivateNetwork(embedded)

  return false
}

function isInternalHostname(hostname) {
  const h = hostname.toLowerCase()
  return h.endsWith('.local') || h.endsWith('.internal') || h === 'localhost'
}

export async function checkSsrf(rawUrl, bypassInternalIpAllowed = false) {
  let url
  try {
    url = new URL(rawUrl)
  } catch {
    return { allowed: false, isPrivate: false, error: 'Invalid URL' }
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    return { allowed: false, isPrivate: false, error: 'Only HTTP and HTTPS URLs are allowed' }
  }

  const hostname = url.hostname.toLowerCase()

  let resolvedIp
  try {
    const result = await dns.lookup(hostname)
    resolvedIp = result.address
  } catch (error_) {
    const code = error_ instanceof Error && 'code' in error_ ? String(error_.code) : 'unknown'
    return { allowed: false, isPrivate: false, error: `Could not resolve hostname (${code})` }
  }

  if (isAlwaysBlocked(resolvedIp)) {
    return {
      allowed: false,
      isPrivate: true,
      resolvedIp,
      error: 'Requests to loopback and link-local addresses are not allowed',
    }
  }

  if (isPrivateNetwork(resolvedIp) || isInternalHostname(hostname)) {
    if (!ALLOW_INTERNAL_NETWORK || bypassInternalIpAllowed) {
      return {
        allowed: false,
        isPrivate: true,
        resolvedIp,
        error:
          'Requests to private/internal network addresses are not allowed. Set ALLOW_INTERNAL_NETWORK=true to permit this for self-hosted setups.',
      }
    }
    return { allowed: true, isPrivate: true, resolvedIp }
  }

  return { allowed: true, isPrivate: false, resolvedIp }
}

/** Link-local / cloud-metadata addresses — never a legitimate model host. */
function isLinkLocal(ip) {
  const addr = (ip.startsWith('[') ? ip.slice(1, -1) : ip).toLowerCase()
  if (addr.startsWith('169.254.')) return true
  if (/^::ffff:169\.254\./.test(addr) || /^::(ffff:)?a9fe:/.test(addr)) return true
  if (/^fe[89ab][0-9a-f]:/.test(addr)) return true
  if (addr === 'fd00:ec2::254' || addr.startsWith('fd00:ec2:')) return true
  if (addr === '100.100.100.200' || addr === '100.100.100.100') return true
  const embedded = embeddedTransitionIpv4(addr)
  if (embedded) return isLinkLocal(embedded)
  return false
}

export async function safeFetchLlm(url, init, maxRedirects = 5) {
  let currentUrl = url

  for (let hop = 0; ; hop++) {
    let parsed
    try {
      parsed = new URL(currentUrl)
    } catch {
      throw new SsrfBlockedError('Invalid URL')
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new SsrfBlockedError('Only HTTP and HTTPS URLs are allowed')
    }
    let resolvedIp
    try {
      resolvedIp = (await dns.lookup(parsed.hostname)).address
    } catch (error_) {
      const code = error_ instanceof Error && 'code' in error_ ? String(error_.code) : 'unknown'
      throw new SsrfBlockedError(`Could not resolve hostname (${code})`)
    }
    if (isLinkLocal(resolvedIp)) {
      throw new SsrfBlockedError('Requests to link-local / cloud-metadata addresses are not allowed')
    }

    const dispatcher = createPinnedDispatcher(resolvedIp, true)
    const response = await fetch(currentUrl, { ...init, redirect: 'manual', dispatcher })

    const status = typeof response.status === 'number' ? response.status : 0
    const location = status >= 300 && status < 400 ? (response.headers?.get('location') ?? null) : null
    if (!location) return response

    if (hop >= maxRedirects) {
      throw new SsrfBlockedError('Too many redirects')
    }

    let nextUrl
    try {
      nextUrl = new URL(location, currentUrl).toString()
    } catch {
      throw new SsrfBlockedError('Invalid redirect location')
    }
    void response.body?.cancel().catch(() => {})
    currentUrl = nextUrl
  }
}

export class SsrfBlockedError extends Error {
  constructor(message) {
    super(message)
    this.name = 'SsrfBlockedError'
  }
}

export async function safeFetch(url, init, options) {
  const ssrf = await checkSsrf(url)
  if (!ssrf.allowed) {
    throw new SsrfBlockedError(ssrf.error ?? 'Request blocked by SSRF guard')
  }
  const dispatcher = createPinnedDispatcher(ssrf.resolvedIp, options?.rejectUnauthorized ?? true)
  return fetch(url, { ...init, dispatcher })
}

export async function safeFetchFollow(url, init, options) {
  const maxRedirects = options?.maxRedirects ?? 5
  const rejectUnauthorized = options?.rejectUnauthorized ?? true
  const bypassInternalIpAllowed = options?.bypassInternalIpAllowed ?? false

  let currentUrl = url

  for (let hop = 0; ; hop++) {
    const ssrf = await checkSsrf(currentUrl, bypassInternalIpAllowed)
    if (!ssrf.allowed) {
      throw new SsrfBlockedError(ssrf.error ?? 'Request blocked by SSRF guard')
    }

    const dispatcher = createPinnedDispatcher(ssrf.resolvedIp, rejectUnauthorized)
    const response = await fetch(currentUrl, {
      ...init,
      redirect: 'manual',
      dispatcher,
    })

    const status = typeof response.status === 'number' ? response.status : 0
    const isRedirectStatus = status >= 300 && status < 400
    const location = isRedirectStatus ? (response.headers?.get('location') ?? null) : null
    if (!location) {
      return response
    }

    if (hop >= maxRedirects) {
      throw new SsrfBlockedError('Too many redirects')
    }

    let nextUrl
    try {
      nextUrl = new URL(location, currentUrl).toString()
    } catch {
      throw new SsrfBlockedError('Invalid redirect location')
    }
    void response.body?.cancel().catch(() => {})
    currentUrl = nextUrl
  }
}

export function createPinnedDispatcher(resolvedIp, rejectUnauthorized = true) {
  return new Agent({
    connect: {
      rejectUnauthorized,
      lookup: (_hostname, opts, callback) => {
        const family = resolvedIp.includes(':') ? 6 : 4
        if (opts?.all) {
          callback(null, [{ address: resolvedIp, family }])
        } else {
          callback(null, resolvedIp, family)
        }
      },
    },
  })
}
