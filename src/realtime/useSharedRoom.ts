import { useEffect, useState, useSyncExternalStore } from 'react'
import type { RoomTransport } from './protocol'
import { createRoomController, type RoomController, type RoomControllerOptions, type RoomState } from './roomController'

/**
 * 40 人ルームの状態と操作。transport と options は最初の描画の値だけを使う。
 * アンマウントでタイマー・起床通知・購読を止める。
 */
export function useSharedRoom(transport: RoomTransport, options?: RoomControllerOptions): { state: RoomState; controller: RoomController } {
  const [controller] = useState(() => createRoomController(transport, options))
  useEffect(() => {
    controller.attach()
    return () => controller.detach()
  }, [controller])
  const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState)
  return { state, controller }
}
