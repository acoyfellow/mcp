import { describe, expect, it } from 'vitest'
import { autoResolvedAccountId } from '../../src/auth/account-access'
import type { AuthProps } from '../../src/auth/types'

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
