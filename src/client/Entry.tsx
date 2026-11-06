import React from 'react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { buildSessionRows, defaultPreferences, type ActivityPreferences, type SessionRow } from '../sessions.ts'
import { SessionFilterBell } from './Bell.tsx'
import { ActivityList } from './ActivityList.tsx'
import type { SessionFilterContext } from './types.ts'

const KEY = 'dsh-session-filter.activity.v1'
type Track = { running: boolean; unread: boolean; nativeUnread?: boolean; version: string; updatedAt: number }
type Saved = { active: boolean; preferences: ActivityPreferences; ack: Record<string, string>; tracks: Record<string, Track> }
function load(): Saved {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) || '{}')
    return { active: data.active === true, preferences: { priority: data.preferences?.priority !== false, pinned: data.preferences?.pinned === true, scheduled: data.preferences?.scheduled === true }, ack: data.ack && typeof data.ack === 'object' ? data.ack : {}, tracks: data.tracks && typeof data.tracks === 'object' ? data.tracks : {} }
  } catch { return { active: false, preferences: { ...defaultPreferences }, ack: {}, tracks: {} } }
}
function locate(): { header: HTMLElement; area: HTMLElement } | null {
  for (const header of document.querySelectorAll<HTMLElement>('[class*="_sectionHeader"]')) {
    const label = Array.from(header.querySelectorAll('span')).find((node) => ['工作区', '会话', 'Workspaces', 'Sessions'].includes((node.textContent || '').trim()))
    if (!label) continue
    const area = Array.from(header.parentElement?.children ?? []).find((node) => node !== header && Array.from(node.classList).some((name) => name.endsWith('_listArea')))
    if (area instanceof HTMLElement) return { header, area }
  }
  return null
}
export function SessionFilterEntry({ ctx }: { ctx: SessionFilterContext }) {
  const [saved, setSaved] = useState(load)
  const [target, setTarget] = useState<HTMLElement | null>(null)
  const [bounds, setBounds] = useState({ left: 0, top: 0, width: 0, height: 0 })
  const [diagnostic, setDiagnostic] = useState('')
  const [query, setQuery] = useState('')
  const [schedule, setSchedule] = useState<{ status: 'loading' | 'ready' | 'error'; deliveries: Map<string, number>; error?: string }>({ status: 'loading', deliveries: new Map() })
  const [scheduleRetry, setScheduleRetry] = useState(0)
  const [menu, setMenu] = useState(false)
  const [limit, setLimit] = useState(10)
  const [retained, setRetained] = useState<Set<string>>(() => new Set())
  const anchorRef = useRef<HTMLDivElement>(null)
  const tracker = useRef(new Map<string, Track>(Object.entries(saved.tracks)))
  const observedIds = useRef(new Set<string>())
  const sequence = useRef(0)
  const sessions = useSyncExternalStore((listener) => ctx.sessions.list.subscribe(listener), () => ctx.sessions.list.getSnapshot())
  const workspaces = useSyncExternalStore((listener) => ctx.workspaces.list.subscribe(listener), () => ctx.workspaces.list.getSnapshot())
  const statuses = useSyncExternalStore((listener) => ctx.uiSession.sessionStatus.subscribe(listener), () => ctx.uiSession.sessionStatus.getSnapshot())
  const rows = useMemo(() => buildSessionRows(sessions, workspaces, statuses).map((row) => {
    const old = tracker.current.get(row.id)
    const wasNativeUnread = old?.nativeUnread ?? old?.unread
    let version = old?.version ?? `initial:${row.updatedAt}`
    if (old && ((!old.running && row.running) || (!old.unread && row.unread) || (row.unread && old.updatedAt !== row.updatedAt))) version = `${Date.now()}:${++sequence.current}`
    // 宿主重建时未读集合会清空；只将本次挂载内观察到的已读变化视为确认。
    const readInHost = observedIds.current.has(row.id) && wasNativeUnread === true && !row.unread && !row.running
    const unread = !row.running && !readInHost && (row.unread || old?.unread === true || old?.running === true)
    tracker.current.set(row.id, { running: row.running, unread, nativeUnread: row.unread, version, updatedAt: row.updatedAt })
    observedIds.current.add(row.id)
    return { ...row, unread }
  }), [sessions, workspaces, statuses])
  const versions = new Map(rows.map((row) => [row.id, tracker.current.get(row.id)!.version]))
  const attention = new Set(rows.filter((row) => row.running || row.pendingInteraction || (row.unread && saved.ack[row.id] !== versions.get(row.id))).map((row) => row.id))
  useEffect(() => {
    const ids = new Set(rows.map((row) => row.id))
    if (sessions.phase === 'ready' && workspaces.phase === 'ready') for (const id of tracker.current.keys()) if (!ids.has(id)) tracker.current.delete(id)
    try { localStorage.setItem(KEY, JSON.stringify({ ...saved, tracks: Object.fromEntries(tracker.current) })) } catch { /* storage may be disabled */ }
  }, [saved, rows, sessions.phase, workspaces.phase])
  useEffect(() => {
    if (!saved.active) { setRetained(new Set()); return }
    setRetained((previous) => {
      const valid = new Set(rows.map((row) => row.id))
      const next = new Set([...previous].filter((id) => valid.has(id)))
      for (const id of attention) next.add(id)
      return next.size === previous.size && [...next].every((id) => previous.has(id)) ? previous : next
    })
  }, [saved.active, rows, saved.ack])
  useEffect(() => {
    if (!saved.preferences.scheduled) return
    let alive = true, request = 0
    const refresh = async () => {
      const current = ++request
      setSchedule((old) => ({ ...old, status: 'loading' }))
      try {
        if (!ctx.remote.schedule || typeof ctx.remote.schedule.catalog !== 'function') throw new Error('定时服务尚未注册')
        const result = await ctx.remote.schedule.catalog()
        if (!result.ok) throw new Error('目录请求失败')
        if (!Array.isArray(result.value)) throw new Error('目录返回格式异常')
        const deliveries = new Map<string, number>()
        for (const record of result.value) {
          const time = Date.parse(record.lastDelivery?.deliveredAt ?? '')
          if (typeof record.sessionId === 'string' && Number.isFinite(time)) deliveries.set(record.sessionId, Math.max(deliveries.get(record.sessionId) ?? 0, time))
        }
        if (alive && current === request) setSchedule({ status: 'ready', deliveries })
      } catch (error) { if (alive && current === request) setSchedule((old) => ({ ...old, status: 'error', error: error instanceof Error && ['定时服务尚未注册', '目录请求失败', '目录返回格式异常'].includes(error.message) ? error.message : '目录调用异常' })) }
    }
    let disposeChanged = () => {}, disposeReset = () => {}
    try {
      disposeChanged = ctx.remote.$on('schedule/changed', refresh)
      disposeReset = ctx.on('connection/reset', refresh)
      void refresh()
    } catch { setSchedule((old) => ({ ...old, status: 'error', error: '事件订阅失败' })) }
    return () => { alive = false; disposeChanged(); disposeReset() }
  }, [ctx, saved.preferences.scheduled, scheduleRetry])
  useLayoutEffect(() => {
    let frame = 0
    let observed: Element[] = []
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(place) }
    const resize = new ResizeObserver(schedule)
    const place = () => {
      const found = locate(), anchor = anchorRef.current
      const rail = document.querySelector('[class*="_root"][class*="_rail"] > [class*="_sectionHeader"]')
      const nextObserved = found ? [found.header, found.area, found.header.parentElement].filter((node): node is HTMLElement => Boolean(node)) : rail ? [rail, rail.parentElement].filter((node): node is Element => Boolean(node)) : []
      if (nextObserved.length !== observed.length || nextObserved.some((node, index) => node !== observed[index])) {
        observed.forEach((node) => resize.unobserve(node))
        observed = nextObserved
        observed.forEach((node) => resize.observe(node))
      }
      if (!anchor) return
      if (!found && rail) { anchor.style.display = 'none'; setDiagnostic(''); setTarget(null); return }
      if (!found) { anchor.style.display = 'inline-flex'; anchor.style.left = '8px'; anchor.style.top = '100px'; setDiagnostic('未找到工作区列表'); setTarget(null); return }
      const rect = (found.header.querySelector('button') ?? found.header).getBoundingClientRect()
      const areaRect = found.area.getBoundingClientRect()
      const visible = rect.width > 0 && areaRect.width > 0
      if (visible) setBounds((old) => old.left === areaRect.left && old.top === areaRect.top && old.width === areaRect.width && old.height === areaRect.height ? old : { left: areaRect.left, top: areaRect.top, width: areaRect.width, height: areaRect.height })
      anchor.style.display = visible ? 'inline-flex' : 'none'
      setDiagnostic('')
      if (visible) { anchor.style.left = `${Math.round(rect.left - 32)}px`; anchor.style.top = `${Math.round(rect.top + (rect.height - 28) / 2)}px` }
      setTarget(visible ? found.area : null)
    }
    place()
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true })
    window.addEventListener('resize', schedule)
    window.addEventListener('scroll', schedule, true)
    return () => { observer.disconnect(); resize.disconnect(); window.removeEventListener('resize', schedule); window.removeEventListener('scroll', schedule, true); cancelAnimationFrame(frame) }
  }, [])
  useLayoutEffect(() => {
    if (!saved.active || !target) return
    target.setAttribute('data-dsf-active', '')
    return () => target.removeAttribute('data-dsf-active')
  }, [saved.active, target])
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if ((event.code === 'KeyU' || event.key.toLowerCase() === 'u') && event.metaKey && event.altKey) { event.preventDefault(); setSaved((s) => ({ ...s, active: !s.active })) }
      else if (event.key === 'Escape') { if (menu) setMenu(false); else setSaved((s) => ({ ...s, active: false })) }
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [menu])
  function acknowledge(selected: SessionRow[]) {
    setSaved((state) => {
      const ack = { ...state.ack }
      for (const row of selected) if (row.unread) ack[row.id] = versions.get(row.id) ?? ''
      return { ...state, ack }
    })
  }
  return <>
    <div ref={anchorRef} className="dsh-session-filter" data-dsh-session-filter="">
      <button type="button" className="dsf-bell" aria-pressed={saved.active} aria-label={saved.active ? '关闭活动视图' : '打开活动视图'} title="活动视图（⌘⌥U）" onClick={() => setSaved((s) => ({ ...s, active: !s.active }))}>
        <SessionFilterBell />{diagnostic && <span className="dsf-diagnostic" role="status">{diagnostic}</span>}{attention.size > 0 && <span className="dsf-count">{attention.size}</span>}
      </button>
    </div>
    {saved.active && target && createPortal(<div className="dsf-portal" style={{ position: 'fixed', left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height, zIndex: 9 }}><ActivityList rows={rows} attention={attention} retained={retained} query={query} setQuery={(value) => { setQuery(value); setLimit(10) }} limit={limit} more={() => setLimit((n) => n + 10)} schedule={schedule} retrySchedule={() => setScheduleRetry((value) => value + 1)} archive={(row, stopActivity) => ctx.uiWorkspace.archiveSession(row.id, stopActivity ? { stopActivity: true } : {})} preferences={saved.preferences} setPreferences={(preferences) => setSaved((s) => ({ ...s, preferences }))} menu={menu} setMenu={setMenu} loading={sessions.phase === 'pending' || workspaces.phase === 'pending'} error={Boolean(sessions.error || workspaces.error)} acknowledge={() => acknowledge(rows.filter((row) => attention.has(row.id)))} clear={() => setRetained(new Set(attention))} open={(row) => { acknowledge([row]); ctx.uiWorkspace.openSession(row.id) }} /></div>, document.body)}
  </>
}
