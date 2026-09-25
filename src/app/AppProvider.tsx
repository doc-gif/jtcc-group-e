import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { loadState, saveState } from '../domain/storage'
import type { AppState } from '../domain/types'
import { AppContext } from './appContext'

function browserStorage(): Storage | undefined {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

export function AppProvider({ children, storage = browserStorage() }: { children: ReactNode; storage?: Pick<Storage, 'getItem' | 'setItem'> }) {
  const [state, setState] = useState<AppState>(() => loadState(storage))
  // 保存できる端末かどうかは最初に一度だけ確かめる（プライベートモードなどでは保存できない）
  const [saveFailed] = useState(() => !saveState(storage, state))
  useEffect(() => { saveState(storage, state) }, [storage, state])
  const update = useCallback((next: (current: AppState) => AppState) => setState(next), [])
  const value = useMemo(() => ({ state, update, saveFailed }), [state, update, saveFailed])
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
