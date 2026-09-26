import { z } from 'zod'
import type { McpServer, Tool } from '@modelcontextprotocol/server'
import { autoResolvedAccountId } from '../auth/account-access'
import type { AuthProps } from '../auth/types'

const profileToolDescription =
  'Return the identity and account context authorized for this MCP session.'

const profileOutputSchema = z.object({
  id: z.string().describe('Stable identifier for the authorized principal'),
  principal_type: z.enum(['user', 'account']),
  account_id: z.string().optional().describe('Account selected automatically for this session'),
  account_count: z.number().int().nonnegative()
})

const profileJsonSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object' as const,
  properties: {
    id: { type: 'string' as const, description: 'Stable identifier for the authorized principal' },
    principal_type: { type: 'string' as const, enum: ['user', 'account'] },
    account_id: {
      type: 'string' as const,
      description: 'Account selected automatically for this session'
    },
    account_count: { type: 'number' as const }
  },
  required: ['id', 'principal_type', 'account_count'],
  additionalProperties: false
}

const profileAnnotations = {
  title: 'Cloudflare Session Profile',
  readOnlyHint: true,
  openWorldHint: false,
  destructiveHint: false
}

export const PROFILE_TOOL: Tool = {
  name: 'profile',
  title: 'Cloudflare Session Profile',
  description: profileToolDescription,
  inputSchema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    properties: {},
    additionalProperties: false
  },
  outputSchema: profileJsonSchema,
  annotations: profileAnnotations,
  _meta: { 'openai/profile': true }
}

function profileFor(props: AuthProps) {
  if (props.type === 'account_token') {
    return {
      id: props.account.id,
      principal_type: 'account' as const,
      account_id: props.account.id,
      account_count: 1
    }
  }

  const accountId = autoResolvedAccountId(props)
  return {
    id: props.user.id,
    principal_type: 'user' as const,
    ...(accountId && { account_id: accountId }),
    account_count: props.accountCount ?? props.accounts.length
  }
}

export function runProfileTool(props: AuthProps) {
  const structuredContent = profileFor(props)
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(structuredContent) }],
    structuredContent
  }
}

export function registerProfileTool(server: McpServer, props: AuthProps): void {
  server.registerTool(
    'profile',
    {
      title: PROFILE_TOOL.title,
      description: PROFILE_TOOL.description,
      inputSchema: z.object({}),
      outputSchema: profileOutputSchema,
      annotations: profileAnnotations,
      _meta: PROFILE_TOOL._meta
    },
    () => runProfileTool(props)
  )
}
