import { Component, createElement, type ReactNode } from 'react'
import { SessionFilterEntry } from './Entry.tsx'
import { styles } from './styles.ts'
import type { SessionFilterContext } from './types.ts'

export const name = 'dsh-session-filter'
export const inject = ['slots', 'sessions', 'workspaces', 'uiWorkspace', 'uiSession', 'remote', 'remote.schedule']

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }
  componentDidCatch(error: unknown): void {
    console.error('[dsh-session-filter] render failed', error)
  }
  render(): ReactNode {
    return this.state.failed ? createElement('div', { role: 'alert', style: { position: 'fixed', left: 8, top: 90, zIndex: 9999, padding: 8, background: 'Canvas', color: 'CanvasText' } }, '活动视图加载失败，请查看控制台') : this.props.children
  }
}

export function apply(ctx: SessionFilterContext): void {
  let disposeSlot: (() => void) | undefined
  let style: HTMLStyleElement | undefined
  try {
    style = document.createElement('style')
    style.dataset.dshSessionFilter = ''
    style.textContent = styles
    document.head.appendChild(style)

    const Entry = () => createElement(Boundary, null, createElement(SessionFilterEntry, { ctx }))
    disposeSlot = ctx.slots.inject('shell.overlay', () => ctx.slots.register({
      name: 'shell.overlay',
      id: 'dsh-session-filter:bell',
      order: 10,
      registrant: 'dsh-session-filter',
    }, Entry))

    ctx.effect(() => () => {
      disposeSlot?.()
      style?.remove()
    })
  } catch (error) {
    disposeSlot?.()
    style?.remove()
    console.error('[dsh-session-filter] failed to register', error)
  }
}
