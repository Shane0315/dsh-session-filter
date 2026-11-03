import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSessionRows, recentSince, recentDayLabel, matchesQuery } from '../src/sessions.ts'
import type { SessionListSnapshot, WorkspaceListSnapshot } from '../src/sessions.ts'
const sessions: SessionListSnapshot = { phase: 'ready', ids: ['a', 'a', 'b', 'c', 'sub', 'blank'], byId: {
  a: { id: 'a', title: '同名', updatedAt: 300, running: true, blank: false }, b: { id: 'b', title: '同名', updatedAt: 200, running: false, blank: false }, c: { id: 'c', updatedAt: 100, running: true, blank: false }, sub: { id: 'sub', updatedAt: 400, running: true, blank: false, parentId: 'a' }, blank: { id: 'blank', updatedAt: 500, running: false, blank: true },
} }
const workspaces: WorkspaceListSnapshot = { phase: 'ready', items: [{ workspaceId: 'w', title: '项目', path: '/work/test', sessionIds: ['a', 'b', 'c', 'sub', 'blank'] }], archivedSessionIds: ['c'], pinnedSessionIds: ['b'] }
test('名册去重并排除归档、子会话及空白，状态覆盖 summary', () => {
 const rows = buildSessionRows(sessions, workspaces, new Map([['a', { running: false, pendingInteraction: { kind: 'approval' } }], ['b', { running: true, completionUnread: true }]]))
 assert.deepEqual(rows.map((x) => x.id), ['a', 'b']); assert.equal(rows[0].running, false); assert.equal(rows[0].pendingInteraction, 'approval'); assert.equal(rows[1].unread, true); assert.equal(rows[1].pinned, true); assert.equal(matchesQuery(rows[1], '/work/test'), true)
})
test('近七天按本地日历边界', () => {
 const now = new Date(2026, 10, 3, 13).getTime(); assert.equal(recentSince(now), new Date(2026, 9, 28).getTime())
})

test('日期标题按本地日历展示今天、昨天和星期', () => { const now = new Date(2026, 10, 3, 12).getTime(); assert.equal(recentDayLabel(now, now), '今天'); assert.equal(recentDayLabel(new Date(2026, 10, 2, 23).getTime(), now), '昨天'); assert.equal(recentDayLabel(new Date(2026, 10, 1, 12).getTime(), now), '星期日') })
