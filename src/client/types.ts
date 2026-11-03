import type { SessionListSnapshot, SessionStatus, WorkspaceListSnapshot } from '../sessions.ts'
export interface ObservableSnapshot<T> { getSnapshot(): T; subscribe(listener: () => void): () => void }
export interface SessionFilterContext {
  effect(callback: () => void | (() => void)): void
  slots: { inject(key: string, callback: () => () => void): () => void; register(options: Record<string, unknown>, component: unknown): () => void }
  sessions: { readonly list: ObservableSnapshot<SessionListSnapshot> }
  workspaces: { readonly list: ObservableSnapshot<WorkspaceListSnapshot> }
  uiSession: { readonly sessionStatus: ObservableSnapshot<ReadonlyMap<string, SessionStatus>> }
  uiWorkspace: { openSession(sessionId: string): void; archiveSession(sessionId: string, options?: { stopActivity?: boolean }): Promise<void> }
  remote: { schedule?: { catalog(): Promise<{ ok: boolean; value?: { sessionId: string; lastDelivery?: { deliveredAt: string } }[] }> }; $on(event: string, callback: () => void): () => void }
  on(event: string, callback: () => void): () => void
}
