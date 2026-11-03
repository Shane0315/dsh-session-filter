import React from 'react'
import { useEffect, useRef, useState } from 'react'
import { defaultPreferences, formatActivityTime, matchesQuery, recentDayLabel, recentSince, type ActivityPreferences, type SessionRow } from '../sessions.ts'
type Props = {
  rows: SessionRow[]; attention: Set<string>; retained: Set<string>; query: string; setQuery(value: string): void
  limit: number; more(): void; preferences: ActivityPreferences; setPreferences(value: ActivityPreferences): void
  schedule: { status: 'loading' | 'ready' | 'error'; deliveries: Map<string, number>; error?: string }; retrySchedule(): void
  menu: boolean; setMenu(value: boolean): void; loading: boolean; error: boolean
  acknowledge(): void; clear(): void; open(row: SessionRow): void; archive(row: SessionRow, stopActivity: boolean): Promise<void>
}
export function ActivityList(props: Props) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [archiveRows, setArchiveRows] = useState<SessionRow[] | null>(null)
  const [archiving, setArchiving] = useState(false)
  const [archiveError, setArchiveError] = useState('')
  useEffect(() => {
    if (!props.menu) return
    const close = (event: MouseEvent) => { if (!menuRef.current?.contains(event.target as Node)) props.setMenu(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [props.menu, props.setMenu])
  useEffect(() => {
    if (!archiveRows) return
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || ((event.code === 'KeyU' || event.key.toLowerCase() === 'u') && event.metaKey && event.altKey)) {
        event.preventDefault(); event.stopImmediatePropagation()
        if (event.key === 'Escape' && !archiving) setArchiveRows(null)
      }
    }
    window.addEventListener('keydown', keydown, true)
    return () => window.removeEventListener('keydown', keydown, true)
  }, [archiveRows, archiving])
  const matching = props.rows.filter((row) => matchesQuery(row, props.query))
  const pinned = props.preferences.pinned ? matching.filter((row) => row.pinned).sort((a, b) => a.pinOrder - b.pinOrder) : []
  const used = new Set(pinned.map((row) => row.id))
  const priority = props.preferences.priority ? matching.filter((row) => !used.has(row.id) && (props.attention.has(row.id) || props.retained.has(row.id))) : []
  priority.forEach((row) => used.add(row.id))
  const scheduled = props.preferences.scheduled ? matching.filter((row) => !used.has(row.id) && props.schedule.deliveries.has(row.id)).map((row) => ({ ...row, updatedAt: props.schedule.deliveries.get(row.id)! })).sort((a, b) => b.updatedAt - a.updatedAt) : []
  scheduled.forEach((row) => used.add(row.id))
  const recent = matching.filter((row) => !used.has(row.id) && (row.updatedAt >= recentSince() || (!props.preferences.priority && (props.attention.has(row.id) || props.retained.has(row.id)))))
  const days = new Map<string, SessionRow[]>()
  for (const row of recent.slice(0, props.limit)) { const label = row.updatedAt < recentSince() ? '更早' : recentDayLabel(row.updatedAt); days.set(label, [...(days.get(label) ?? []), row]) }
  async function confirmArchive() {
    if (!archiveRows || archiving) return
    setArchiving(true); setArchiveError('')
    const failed: SessionRow[] = []
    for (const row of archiveRows) {
      try { await props.archive(row, Boolean(row.running || row.pendingInteraction)) } catch { failed.push(row) }
    }
    setArchiving(false); setArchiveRows(failed.length ? failed : null)
    if (failed.length) setArchiveError('以下会话归档失败，可能在确认后产生新活动。重试只处理这些会话；请检查其状态。')
  }
  function group(title: string, rows: SessionRow[]) {
    if (!rows.length) return null
    return <section><h3>{title}</h3>{rows.map((row) => <button className="dsf-row" key={row.id} onClick={() => props.open(row)}><span className="dsf-title">{row.title}</span><span className="dsf-meta">{row.workspaceTitle} · {formatActivityTime(row.updatedAt)}</span><span className="dsf-status">{row.pendingInteraction ? ({ approval: '等待批准', question: '等待回复', 'plan-review': '等待审核' } as Record<string, string>)[row.pendingInteraction] : row.running ? '运行中' : props.attention.has(row.id) ? '未读完成' : ''}</span></button>)}</section>
  }
  return <div className="dsf-list" aria-label="活动列表">
    <div className="dsf-toolbar"><input aria-label="搜索活动" placeholder="搜索活动" value={props.query} onChange={(event) => props.setQuery(event.target.value)} /><div ref={menuRef}><button className="dsf-option" aria-label="活动选项" aria-expanded={props.menu} onClick={() => props.setMenu(!props.menu)}>⋯</button>{props.menu && <div className="dsf-menu" role="menu"><label><input type="checkbox" checked={props.preferences.priority} onChange={(e) => props.setPreferences({ ...props.preferences, priority: e.target.checked })} /> 需关注</label><label><input type="checkbox" checked={props.preferences.pinned} onChange={(e) => props.setPreferences({ ...props.preferences, pinned: e.target.checked })} /> 置顶</label><label><input type="checkbox" checked={props.preferences.scheduled} onChange={(e) => props.setPreferences({ ...props.preferences, scheduled: e.target.checked })} /> 定时任务</label><button onClick={() => props.setPreferences({ ...defaultPreferences })}>恢复默认</button><button onClick={() => { props.acknowledge(); props.setMenu(false) }}>全部标为已读</button><button onClick={() => { props.clear(); props.setMenu(false) }}>清理已读</button><button disabled={!priority.length} onClick={() => { setArchiveRows(priority); setArchiveError(''); props.setMenu(false) }}>归档需关注会话</button><small>已读仅影响此插件</small></div>}</div></div>
    {archiveRows && <div className="dsf-dialog-backdrop"><div className="dsf-dialog" role="dialog" aria-modal="true" aria-labelledby="dsf-archive-title" onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); if (!archiving) setArchiveRows(null) } }}><h2 id="dsf-archive-title">归档需关注会话？</h2>{archiveError ? <p role="alert">{archiveError}</p> : <p>将归档以下 {archiveRows.length} 个会话。运行中或等待操作的会话会停止其活动后归档，可能包括关联的定时任务。</p>}<ul>{archiveRows.map((row) => <li key={row.id}>{row.title}{row.running || row.pendingInteraction ? '（停止并归档）' : ''}</li>)}</ul><div><button autoFocus disabled={archiving} onClick={() => setArchiveRows(null)}>取消</button><button disabled={archiving} onClick={() => void confirmArchive()}>{archiving ? '正在归档…' : archiveError ? '重试失败项' : archiveRows.some((row) => row.running || row.pendingInteraction) ? '停止并归档' : '确认归档'}</button></div></div></div>}
    {props.error ? <p className="dsf-empty">宿主数据不可用</p> : props.loading ? <p className="dsf-empty">正在加载活动…</p> : <>
      {group('需关注', priority)}{group('置顶', pinned)}{group('定时任务', scheduled)}
      {props.preferences.scheduled && props.schedule.status === 'loading' && <p className="dsf-empty">正在加载定时任务…</p>}
      {props.preferences.scheduled && props.schedule.status === 'error' && <p className="dsf-empty">定时任务不可用（{props.schedule.error}） <button className="dsf-more" onClick={props.retrySchedule}>重试</button></p>}
      {recent.length > 0 && <h3>最近活动</h3>}{[...days].map(([label, entries]) => <div key={label}>{group(label, entries)}</div>)}
      {recent.length > props.limit && <button className="dsf-more" onClick={props.more}>加载更多</button>}
      {!priority.length && !pinned.length && !scheduled.length && !recent.length && <p className="dsf-empty">{props.query.trim() ? '没有搜索结果' : '暂无活动'}</p>}
    </>}
  </div>
}
