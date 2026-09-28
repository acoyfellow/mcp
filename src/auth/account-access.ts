import type { AuthProps } from './types'

/** Concise Code-Mode guidance for unresolved multi-account execution errors. */
export const ACCOUNT_DISCOVERY_GUIDANCE = 'Call GET /accounts to discover available accounts.'

/** Detailed Code-Mode guidance for tool descriptions. */
export const ACCOUNT_DISCOVERY_DESCRIPTION = `${ACCOUNT_DISCOVERY_GUIDANCE} Paginate as needed, or filter by exact name with GET /accounts?name=<exact account name>.`

/** Non-Code-Mode guidance using the generated endpoint tool name. */
export const NON_CODEMODE_ACCOUNT_DISCOVERY_GUIDANCE =
  'Call the get_accounts tool to discover available accounts.'

/**
 * Account selection helpers — the single source of truth for how a session's
 * `props` map onto "which Cloudflare account does an API call target". Keep all
 * `props.type` / `accounts.length` reasoning here so callers read intent, not
 * shape.
 */

/**
 * The account id usable without asking the user: an account token's fixed
 * account, or a single-account user token's only account. `undefined` when the
 * caller must choose (or there is no account context).
 */
export function autoResolvedAccountId(props?: AuthProps): string | undefined {
  if (props?.type === 'account_token') return props.account.id
  if (props?.type === 'user_token' && props.accounts.length === 1) return props.accounts[0].id
  return undefined
}
