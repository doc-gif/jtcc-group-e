import { createContext, useContext } from 'react'
import type { AppState } from '../domain/types'

export interface AppContextValue {
  state: AppState
  update: (next: (current: AppState) => AppState) => void
  /** 保存に失敗したとき（プライベートモード等）に true。遊べるが記録は残らない。 */
  saveFailed: boolean
}

export const AppContext = createContext<AppContextValue | null>(null)

export function useApp(): AppContextValue {
  const value = useContext(AppContext)
  if (!value) throw new Error('AppProvider の外では使えません')
  return value
}

export const asset = (path: string) => `${import.meta.env.BASE_URL}${path}`

export function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
