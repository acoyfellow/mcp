import { z } from 'zod'
import type { AttentionItem } from '../apps/attention/report'
import { workersItemId, workersItemTitle } from '../apps/attention/sources'

export const ATTENTION_ITEM_META_KEY = 'com.cloudflare/attentionItem'

const WorkersIssueAlertData = z.looseObject({
  issue: z.looseObject({
    id: z.string().min(1),
    title: z.string().optional(),
    services: z.array(z.looseObject({ name: z.string().min(1) })).min(1)
  })
})

interface IssueAlert {
  text: string
  ts: number
  data?: Record<string, unknown>
}

export function workersIssueAttentionItem(alert: IssueAlert): AttentionItem | undefined {
  const parsed = WorkersIssueAlertData.safeParse(alert.data)
  if (!parsed.success) return undefined
  const { issue } = parsed.data
  const service = issue.services[0].name
  const issueTitle = issue.title || alert.text
  const observedAt = new Date(alert.ts * 1000).toISOString()
  return {
    id: workersItemId(issue.id),
    source: 'workers',
    severity: 'warning',
    title: workersItemTitle(service, issueTitle),
    detail: `New occurrence at ${observedAt}.`,
    observedAt,
    followUp: `Workers Observability detected an issue in the Worker "${service}": "${issueTitle}", last at ${observedAt}. Find the cause and suggest a fix.`
  }
}
