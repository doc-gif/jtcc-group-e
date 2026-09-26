// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { MockRoomServer } from './mock'
import type { RoomTransport } from './protocol'
import { ROOM_POLL_MS } from './roomController'
import { useSharedRoom } from './useSharedRoom'

afterEach(() => { vi.useRealTimers() })

test('アンマウントでポーリング・起床通知・購読を止める', async () => {
  vi.useFakeTimers({ now: Date.parse('2026-01-01T00:00:00Z') })
  const server = new MockRoomServer(() => Date.now(), () => 'invite', () => 0)
  const key = 'hook_host_key_for_tests_only_000000000001'
  server.addHostKey(key)
  const base = server.asUser('host')
  const snapshot = vi.fn(base.snapshot)
  const unsubscribed = vi.fn()
  const transport: RoomTransport = {
    ...base,
    snapshot,
    subscribe: (room, refresh) => {
      const off = base.subscribe(room, refresh)
      return () => { unsubscribed(); off() }
    },
  }
  const { result, unmount } = renderHook(() => useSharedRoom(transport, { requestId: () => 'room-1', hostKeys: { get: () => null, set: () => {} } }))
  expect(result.current.state.phase).toBe('idle')
  await act(async () => { await result.current.controller.createAsHost(key, 'ホスト') })
  expect(result.current.state).toMatchObject({ phase: 'lobby', isHost: true })

  await act(() => vi.advanceTimersByTimeAsync(ROOM_POLL_MS))
  const polled = snapshot.mock.calls.length
  expect(polled).toBeGreaterThan(0)
  await act(async () => { window.dispatchEvent(new Event('online')); await vi.advanceTimersByTimeAsync(0) })
  expect(snapshot).toHaveBeenCalledTimes(polled + 1)

  unmount()
  expect(unsubscribed).toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
  window.dispatchEvent(new Event('online'))
  await vi.advanceTimersByTimeAsync(60_000)
  expect(snapshot).toHaveBeenCalledTimes(polled + 1)
})
