export interface SessionSummary {
  readonly id: string
  readonly displayTitle?: string
  readonly title?: string
  readonly updatedAt: number
  readonly running: boolean
  readonly blank: boolean
  readonly origin?: string
  readonly cwd?: string
  readonly parentId?: string
}
export interface SessionListSnapshot {
  readonly ids: readonly string[]
  readonly byId: Readonly<Record<string, SessionSummary | undefined>>
  readonly phase?: string
  readonly error?: unknown
}
export interface WorkspaceView {
  readonly workspaceId: string
  readonly title: string
  readonly path: string
  readonly sessionIds: readonly string[]
}
export interface WorkspaceListSnapshot {
  readonly items: readonly WorkspaceView[]
  readonly archivedSessionIds?: readonly string[]
  readonly pinnedSessionIds?: readonly string[]
  readonly phase?: string
  readonly error?: unknown
}
export interface SessionStatus {
  readonly running?: boolean
  readonly pendingInteraction?: { readonly kind: string }
  readonly completionUnread?: boolean
}
export interface SessionRow {
  readonly id: string
  readonly title: string
  readonly workspaceId: string
  readonly workspaceTitle: string
  readonly workspacePath: string
  readonly updatedAt: number
  readonly running: boolean
  readonly pendingInteraction?: string
  readonly unread: boolean
  readonly pinned: boolean
  readonly pinOrder: number
}
export interface ActivityPreferences { priority: boolean; pinned: boolean; scheduled: boolean }
export const defaultPreferences: ActivityPreferences = { priority: true, pinned: false, scheduled: false }

export function buildSessionRows(sessions: SessionListSnapshot, workspaces: WorkspaceListSnapshot, statuses: ReadonlyMap<string, SessionStatus> = new Map()): SessionRow[] {
  const owners = new Map<string, WorkspaceView>()
  for (const workspace of workspaces.items) for (const id of workspace.sessionIds) if (!owners.has(id)) owners.set(id, workspace)
  const archived = new Set(workspaces.archivedSessionIds ?? [])
  const pinned = new Set(workspaces.pinnedSessionIds ?? [])
  const seen = new Set<string>()
  const rows: SessionRow[] = []
  for (const id of sessions.ids.length ? sessions.ids : Object.keys(sessions.byId)) {
    if (seen.has(id)) continue
    seen.add(id)
    const session = sessions.byId[id], workspace = owners.get(id), status = statuses.get(id)
    if (!session || !workspace || archived.has(id) || session.origin === 'subagent' || session.parentId) continue
    const running = status?.running ?? session.running === true
    const pendingInteraction = ['approval', 'question', 'plan-review'].includes(status?.pendingInteraction?.kind ?? '') ? status?.pendingInteraction?.kind : undefined
    if (session.blank && !running && !pendingInteraction && !status?.completionUnread) continue
    rows.push({ id, title: session.displayTitle?.trim() || session.title?.trim() || '未命名会话', workspaceId: workspace.workspaceId,
      workspaceTitle: workspace.title.trim() || workspace.path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || '未命名工作区', workspacePath: workspace.path,
      updatedAt: Number.isFinite(session.updatedAt) ? session.updatedAt : 0, running, pendingInteraction, unread: status?.completionUnread === true, pinned: pinned.has(id), pinOrder: (workspaces.pinnedSessionIds ?? []).indexOf(id) })
  }
  return rows.sort((a, b) => b.updatedAt - a.updatedAt || a.title.localeCompare(b.title, 'zh-CN'))
}
export function matchesQuery(row: SessionRow, query: string): boolean {
  return `${row.title}\n${row.workspaceTitle}\n${row.workspacePath}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
}
export function recentSince(now = Date.now()): number {
  const date = new Date(now); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() - 6); return date.getTime()
}
export function formatActivityTime(updatedAt: number, now = Date.now()): string {
  if (!updatedAt) return '时间未知'
  const elapsed = Math.max(0, now - updatedAt)
  if (elapsed < 60_000) return '刚刚'
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)} 分钟前`
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)} 小时前`
  if (elapsed < 7 * 86_400_000) return `${Math.floor(elapsed / 86_400_000)} 天前`
  return new Date(updatedAt).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

export function recentDayLabel(timestamp: number, now = Date.now()): string {
  const today = new Date(now); today.setHours(0, 0, 0, 0)
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1)
  if (timestamp >= today.getTime()) return '今天'
  if (timestamp >= yesterday.getTime()) return '昨天'
  return new Date(timestamp).toLocaleDateString('zh-CN', { weekday: 'long' })
}
