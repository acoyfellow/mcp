import {
  ExternalTokenError,
  type ResolveExternalTokenInput,
  type ResolveExternalTokenResult
} from '@cloudflare/workers-oauth-provider'
import { z } from 'zod'

import {
  resolveCloudflareCredential,
  type CloudflareIdentity,
  type CloudflareTokenOwner
} from './cloudflare-identity'
import { AUTH_PROPS_VERSION, type AuthProps } from './types'
import { OAuthError } from './workers-oauth-utils'

const API_TOKEN_IDENTITY_CACHE_TTL_SECONDS = 2_592_000
const API_TOKEN_IDENTITY_CACHE_VERSION = 'v5'

const CachedIdentitySchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('account'),
    account: z.object({ id: z.string() })
  }),
  z.object({
    type: z.literal('user'),
    user: z.object({ id: z.string() }),
    accounts: z.array(z.object({ id: z.string() })),
    accountCount: z.number().optional()
  })
])

type CachedIdentity = z.infer<typeof CachedIdentitySchema>

/** Prefixes are ownership hints; unprefixed legacy credentials remain supported. */
export function cloudflareTokenOwner(token: string): CloudflareTokenOwner {
  if (token.startsWith('cfat_')) return 'account'
  if (token.startsWith('cfut_') || token.startsWith('cfoat_')) return 'user'
  return 'unknown'
}

async function hashApiToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function getCachedIdentity(
  token: string,
  tokenOwner: CloudflareTokenOwner,
  kv: KVNamespace
): Promise<CachedIdentity> {
  const cacheKey = `api-token-identity:${API_TOKEN_IDENTITY_CACHE_VERSION}:${await hashApiToken(token)}`

  try {
    const cachedValue = await kv.get(cacheKey, 'json')
    if (cachedValue !== null) {
      const cached = CachedIdentitySchema.safeParse(cachedValue)
      if (cached.success) return cached.data
      console.warn('api_token_identity_probe ignored invalid cache entry')
    }
  } catch (error) {
    console.warn('api_token_identity_probe kv-cache read failed', error)
  }

  const identity = minimizeIdentity(await resolveCloudflareCredential(token, tokenOwner))

  try {
    await kv.put(cacheKey, JSON.stringify(identity), {
      expirationTtl: API_TOKEN_IDENTITY_CACHE_TTL_SECONDS
    })
  } catch (error) {
    console.warn('api_token_identity_probe kv-cache write failed', error)
  }

  return identity
}

function minimizeIdentity(identity: CloudflareIdentity): CachedIdentity {
  if (identity.type === 'account') {
    return { type: 'account', account: { id: identity.account.id } }
  }
  return {
    type: 'user',
    user: { id: identity.user.id },
    accounts: identity.accounts.map(({ id }) => ({ id })),
    accountCount: identity.accountCount
  }
}

function externalTokenError(
  error: OAuthError,
  tokenOwner: CloudflareTokenOwner
): ExternalTokenError {
  const common = { description: error.description, headers: error.headers }

  switch (error.code) {
    case 'invalid_token':
      return new ExternalTokenError('invalid_token', { ...common, statusCode: 401 })
    case 'insufficient_scope':
      return new ExternalTokenError('insufficient_scope', {
        ...common,
        statusCode: 403,
        requiredScopes: tokenOwner === 'account' ? ['account:read'] : ['user:read', 'account:read']
      })
    case 'temporarily_unavailable':
      return new ExternalTokenError('temporarily_unavailable', {
        ...common,
        statusCode: error.statusCode
      })
    case 'server_error':
      return new ExternalTokenError('server_error', {
        ...common,
        statusCode: error.statusCode
      })
    default:
      return new ExternalTokenError(error.statusCode >= 500 ? 'server_error' : 'invalid_token', {
        ...common,
        statusCode: error.statusCode >= 500 ? 502 : 401
      })
  }
}

/** Convert a verified Cloudflare identity into request-local tool props. */
export function buildAuthProps(token: string, identity: CachedIdentity): AuthProps {
  switch (identity.type) {
    case 'account':
      return {
        type: 'account_token',
        accessToken: token,
        account: { id: identity.account.id }
      }
    case 'user':
      return {
        type: 'user_token',
        accessToken: token,
        user: { id: identity.user.id },
        accounts: identity.accounts.map(({ id }) => ({ id })),
        accountCount: identity.accountCount,
        version: AUTH_PROPS_VERSION
      }
  }
}

/** Resolve direct Cloudflare credentials after the provider's internal token lookup misses. */
export async function resolveExternalToken({
  token,
  env
}: ResolveExternalTokenInput<Env>): Promise<ResolveExternalTokenResult> {
  const tokenOwner = cloudflareTokenOwner(token)
  try {
    const identity = await getCachedIdentity(token, tokenOwner, env.OAUTH_KV)
    return {
      props: buildAuthProps(token, identity),
      // Cloudflare API tokens are opaque credentials, so successful identity
      // validation establishes their local protected-resource audience.
      audience: env.MCP_RESOURCE
    }
  } catch (error) {
    if (error instanceof OAuthError) throw externalTokenError(error, tokenOwner)
    throw error
  }
}
