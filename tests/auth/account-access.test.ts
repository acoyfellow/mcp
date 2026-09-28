import { describe, expect, it } from 'vitest'
import {
  autoResolvedAccountId,
  missingAccountMessage,
  unknownAccountHint
} from '../../src/auth/account-access'
import { AUTH_PROPS_VERSION, LEGACY_ACCOUNTS_PAGE_SIZE, type AuthProps } from '../../src/auth/types'

const accountToken: AuthProps = {
  type: 'account_token',
  accessToken: 't',
  account: { id: 'acct-pinned', name: 'Pinned' }
}

function userToken(overrides: Partial<Extract<AuthProps, { type: 'user_token' }>>): AuthProps {
  return {
    type: 'user_token',
    accessToken: 't',
    user: { id: 'u1', email: 'u@example.com' },
    accounts: [],
    ...overrides
  }
}

function accountList(n: number) {
  return Array.from({ length: n }, (_, i) => ({ id: `acct-${i + 1}`, name: `Account ${i + 1}` }))
}

describe('autoResolvedAccountId', () => {
  it('resolves an account token to its pinned account', () => {
    expect(autoResolvedAccountId(accountToken)).toBe('acct-pinned')
  })

  it('resolves a single-account user token to its only account', () => {
    expect(autoResolvedAccountId(userToken({ accounts: accountList(1) }))).toBe('acct-1')
  })

  it('does not resolve a multi-account user token', () => {
    expect(autoResolvedAccountId(userToken({ accounts: accountList(2) }))).toBeUndefined()
  })

  it('does not resolve a user token whose account list was omitted', () => {
    expect(autoResolvedAccountId(userToken({ accounts: [], accountCount: 137 }))).toBeUndefined()
  })

  it('does not resolve missing props', () => {
    expect(autoResolvedAccountId(undefined)).toBeUndefined()
  })
})

describe('missingAccountMessage', () => {
  const guidance = 'Call GET /accounts to discover available accounts.'

  it('lists a complete account list so the model can pick one', () => {
    const message = missingAccountMessage(
      userToken({ accounts: accountList(2), version: AUTH_PROPS_VERSION }),
      guidance
    )
    expect(message).toBe(
      "No account selected. Pass account_id with one of this session's accounts:\n- acct-1 (Account 1)\n- acct-2 (Account 2)"
    )
  })

  it('reports the count and discovery guidance when the list was omitted', () => {
    expect(missingAccountMessage(userToken({ accounts: [], accountCount: 137 }), guidance)).toBe(
      `No account selected: this token has access to 137 accounts. ${guidance}`
    )
  })

  it('does not list a legacy list that was probably truncated', () => {
    const message = missingAccountMessage(
      userToken({ accounts: accountList(LEGACY_ACCOUNTS_PAGE_SIZE) }),
      guidance
    )
    expect(message).toBe(
      `No account selected: this token has access to multiple accounts. ${guidance}`
    )
  })

  it('says so when the session has no accounts', () => {
    expect(missingAccountMessage(userToken({ accounts: [] }), guidance)).toBe(
      'No account selected: no Cloudflare accounts are authorized for this session.'
    )
  })
})

describe('unknownAccountHint', () => {
  const multiAccount = userToken({ accounts: accountList(2), version: AUTH_PROPS_VERSION })

  it("lists the session's accounts when account_id isn't one of them", () => {
    expect(unknownAccountHint(multiAccount, 'acct-typo')).toBe(
      "account_id acct-typo is not one of this session's accounts:\n- acct-1 (Account 1)\n- acct-2 (Account 2)"
    )
  })

  it("is empty when account_id is one of the session's accounts", () => {
    expect(unknownAccountHint(multiAccount, 'acct-2')).toBe('')
  })

  it("names an account token's own account when given another", () => {
    expect(unknownAccountHint(accountToken, 'acct-other')).toBe(
      "account_id acct-other is not this token's account. This token is scoped to acct-pinned (Pinned); omit account_id to use it."
    )
    expect(unknownAccountHint(accountToken, 'acct-pinned')).toBe('')
  })

  it('is empty when the account list is not known', () => {
    expect(unknownAccountHint(userToken({ accounts: [], accountCount: 137 }), 'acct-x')).toBe('')
    expect(
      unknownAccountHint(userToken({ accounts: accountList(LEGACY_ACCOUNTS_PAGE_SIZE) }), 'acct-x')
    ).toBe('')
  })
})
