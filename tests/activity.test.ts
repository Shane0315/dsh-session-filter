import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { Simulate } from 'react-dom/test-utils'
import { SessionFilterEntry } from '../src/client/Entry.tsx'
import type { SessionFilterContext } from '../src/client/types.ts'
import type { SessionStatus } from '../src/sessions.ts'

function observable<T>(initial: T) {
 return { value: initial, listeners: new Set<() => void>(), getSnapshot() { return this.value }, subscribe(listener: () => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }, set(next: T) { this.value = next; this.listeners.forEach((listener) => listener()) } }
}
test('真实 React 接线：状态订阅、已读与清理、搜索、选项、导航和卸载恢复', async () => {
 const dom = new JSDOM('<!doctype html><html><head></head><body><div class="outer_root"><div class="nested_root"><div class="x_sectionHeader"><span>工作区</span><button>搜索</button></div><div class="x_listArea"><div role="tree">原生列表</div></div></div></div><div id="mount"></div></body></html>', { url: 'https://test.local' })
 let width = 240
 let notifyResize = () => {}
 Object.assign(globalThis, { window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true, requestAnimationFrame: (fn: FrameRequestCallback) => setTimeout(fn, 0), cancelAnimationFrame: clearTimeout, ResizeObserver: class { constructor(callback: () => void) { notifyResize = callback } observe() {} unobserve() {} disconnect() {} } })
 Object.defineProperty(dom.window.HTMLElement.prototype, 'getBoundingClientRect', { value: () => ({ width, height: 28, left: 50, top: 10 }) })
 const now = Date.now()
 const sessionStore = observable({ phase: 'ready', ids: ['a', 'b'], byId: { a: { id: 'a', title: '第一项', updatedAt: now, running: false, blank: false }, b: { id: 'b', title: '第二项', updatedAt: now - 9 * 86400000, running: false, blank: false } } })
 const workspaceStore = observable({ phase: 'ready', items: [{ workspaceId: 'one', title: '工作区甲', path: '/one', sessionIds: ['a'] }, { workspaceId: 'two', title: '工作区乙', path: '/two', sessionIds: ['b'] }], pinnedSessionIds: ['b', 'a'] })
 const statusStore = observable<ReadonlyMap<string, SessionStatus>>(new Map([['a', { completionUnread: true }]]))
 const opened: string[] = []
 const archived: Array<{ id: string; stop: boolean }> = []
 let rejectNewlyActive = true
 let scheduleFails = false
 let scheduleChanged = () => {}
 const ctx = { sessions: { list: sessionStore }, workspaces: { list: workspaceStore }, uiSession: { sessionStatus: statusStore }, uiWorkspace: { openSession: (id: string) => opened.push(id), archiveSession: async (id: string, options: { stopActivity?: boolean }) => { archived.push({ id, stop: options.stopActivity === true }); if (id === 'a' && rejectNewlyActive) throw new Error('activity appeared') } }, remote: { schedule: { catalog: async () => scheduleFails ? { ok: false } : { ok: true, value: [{ sessionId: 'b', lastDelivery: { deliveredAt: new Date(now).toISOString() } }] } }, $on: (_event: string, callback: () => void) => { scheduleChanged = callback; return () => {} } }, on: () => () => {} } as unknown as SessionFilterContext
 let root = createRoot(document.querySelector('#mount')!)
 const click = async (selector: string) => { const element = document.querySelector<HTMLElement>(selector); assert.ok(element, selector); await act(async () => { element.click() }) }
 const textButton = async (text: string) => { const element = [...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === text); assert.ok(element, text); await act(async () => { element.click() }) }
 await act(async () => { root.render(React.createElement(SessionFilterEntry, { ctx })) })
 await click('[aria-label="打开活动视图"]')
 assert.ok(document.querySelector('[data-dsf-active]')); assert.match(document.body.textContent!, /未读完成/)
 await act(async () => { root.unmount() }); statusStore.set(new Map()); root = createRoot(document.querySelector('#mount')!); await act(async () => { root.render(React.createElement(SessionFilterEntry, { ctx })) }); assert.match(document.body.textContent!, /未读完成/)
 await click('[aria-label="活动选项"]'); await textButton('全部标为已读'); assert.doesNotMatch(document.querySelector('.dsf-status')!.textContent!, /未读/); assert.match(document.body.textContent!, /需关注/)
 await act(async () => { root.unmount() }); root = createRoot(document.querySelector('#mount')!); await act(async () => { root.render(React.createElement(SessionFilterEntry, { ctx })) }); assert.doesNotMatch(document.body.textContent!, /未读完成/)
 await click('[aria-label="活动选项"]'); await textButton('清理已读'); assert.doesNotMatch(document.body.textContent!, /需关注/)
 await act(async () => { statusStore.set(new Map([['a', { running: true, completionUnread: false }]])) }); assert.match(document.body.textContent!, /运行中/)
 await act(async () => { statusStore.set(new Map([['a', { running: false, completionUnread: true }], ['b', { pendingInteraction: { kind: 'question' } }]])) }); assert.match(document.body.textContent!, /未读完成/); assert.match(document.body.textContent!, /等待回复/)
 await click('[aria-label="活动选项"]'); const priorityToggle = [...document.querySelectorAll('label')].find((x) => x.textContent?.includes('需关注'))!.querySelector('input')!; await act(async () => { priorityToggle.click() }); assert.match(document.body.textContent!, /更早/); assert.match(document.body.textContent!, /第二项/); await act(async () => { priorityToggle.click() }); await click('[aria-label="活动选项"]')
 await click('[aria-label="活动选项"]'); const pinned = [...document.querySelectorAll('label')].find((x) => x.textContent?.includes('置顶'))!.querySelector('input')!; await act(async () => { pinned.click() }); const pinnedSection = [...document.querySelectorAll('section')].find((section) => section.querySelector('h3')?.textContent === '置顶'); assert.match(pinnedSection?.textContent ?? '', /第二项/); assert.deepEqual([...pinnedSection!.querySelectorAll('.dsf-title')].map((item) => item.textContent), ['第二项', '第一项']); assert.equal(document.querySelectorAll('.dsf-row').length, 2); await textButton('恢复默认'); assert.equal(pinned.checked, false)
 await textButton('归档需关注会话'); assert.match(document.querySelector('[role=dialog]')!.textContent!, /停止并归档/); await textButton('取消'); assert.deepEqual(archived, []); await click('[aria-label="活动选项"]'); await textButton('归档需关注会话'); await textButton('停止并归档'); assert.deepEqual(archived, [{ id: 'a', stop: false }, { id: 'b', stop: true }]); assert.match(document.querySelector('[role=alert]')!.textContent!, /确认后产生新活动/); assert.match(document.querySelector('[role=dialog]')!.textContent!, /第一项/); assert.doesNotMatch(document.querySelector('[role=dialog]')!.textContent!, /第二项/); rejectNewlyActive = false; await textButton('重试失败项'); assert.deepEqual(archived, [{ id: 'a', stop: false }, { id: 'b', stop: true }, { id: 'a', stop: false }])
 const row = [...document.querySelectorAll<HTMLButtonElement>('.dsf-row')].find((x) => x.textContent?.includes('第二项'))!; await act(async () => { row.click() }); assert.deepEqual(opened, ['b'])
 await act(async () => { statusStore.set(new Map()) }); await click('[aria-label="活动选项"]'); await textButton('清理已读')
 await click('[aria-label="活动选项"]'); const scheduled = [...document.querySelectorAll('label')].find((x) => x.textContent?.includes('定时任务'))!.querySelector('input')!; await act(async () => { scheduled.click() }); assert.match([...document.querySelectorAll('section')].find((x) => x.querySelector('h3')?.textContent === '定时任务')?.textContent ?? '', /第二项/)
 scheduleFails = true; await act(async () => { scheduleChanged(); await Promise.resolve() }); assert.match(document.body.textContent!, /定时任务不可用/)
 scheduleFails = false; await textButton('重试'); assert.doesNotMatch(document.body.textContent!, /定时任务不可用/); await click('[aria-label="活动选项"]')

 const search = document.querySelector<HTMLInputElement>('[aria-label="搜索活动"]')!; await act(async () => { const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!; setter.call(search, '不存在'); Simulate.change(search) }); assert.match(document.body.textContent!, /没有搜索结果/)
 await act(async () => { window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) }); assert.equal(document.querySelector('[data-dsf-active]'), null)
 await act(async () => { window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Dead', code: 'KeyU', metaKey: true, altKey: true, bubbles: true })) }); assert.ok(document.querySelector('[data-dsf-active]')); await act(async () => { window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Dead', code: 'KeyU', metaKey: true, altKey: true, bubbles: true })) }); assert.equal(document.querySelector('[data-dsf-active]'), null)
 const bellAnchor = document.querySelector<HTMLElement>('[data-dsh-session-filter]')!
 width = 0; await act(async () => { notifyResize(); await new Promise((resolve) => setTimeout(resolve, 5)) }); assert.equal(bellAnchor.style.display, 'none')
 width = 240; await act(async () => { notifyResize(); await new Promise((resolve) => setTimeout(resolve, 5)) }); assert.equal(bellAnchor.style.display, 'inline-flex')
 await act(async () => { root.unmount() }); assert.equal(document.querySelector('[data-dsf-active]'), null); dom.window.close()
})
