import { useEffect, useState } from 'react'
import { DEMO_FRIENDS } from '../domain/game'
import { TIMING } from '../domain/spinScript'
import { paths } from './router'

type Status = 'waiting' | 'joined' | 'ready'

/** 友達（デモ）の入室を順番に再現する。通信はまだ行わない（次のフェーズで Supabase Realtime に置き換える）。 */
export function useSimulatedRoom(stepMs = TIMING.roomStep) {
  const [step, setStep] = useState(0)
  useEffect(() => {
    if (step >= 4) return
    const timer = window.setTimeout(() => setStep((value) => value + 1), stepMs)
    return () => window.clearTimeout(timer)
  }, [step, stepMs])
  const statuses: Status[] = [step >= 2 ? 'ready' : step >= 1 ? 'joined' : 'waiting', step >= 4 ? 'ready' : step >= 3 ? 'joined' : 'waiting']
  return DEMO_FRIENDS.map((name, index) => ({ name, status: statuses[index] }))
}

export function inviteUrl(code: string): string {
  return `${window.location.href.split('#')[0]}${paths.room(code)}`
}

