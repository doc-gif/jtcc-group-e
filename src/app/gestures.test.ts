// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { installGestureGuards } from './gestures'

describe('installGestureGuards', () => {
  let uninstall: (() => void) | undefined
  afterEach(() => { uninstall?.(); uninstall = undefined })

  it.each(['gesturestart', 'gesturechange', 'gestureend'])('iOS の %s の既定動作（画面の拡大）を止める', (type) => {
    uninstall = installGestureGuards()
    const event = new Event(type, { cancelable: true })
    document.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
  })

  it('解除したら止めない。ふつうのタッチやクリックは止めない', () => {
    uninstall = installGestureGuards()
    const click = new Event('click', { cancelable: true })
    const touch = new Event('touchmove', { cancelable: true })
    document.dispatchEvent(click)
    document.dispatchEvent(touch)
    expect(click.defaultPrevented).toBe(false)
    expect(touch.defaultPrevented).toBe(false)
    uninstall()
    uninstall = undefined
    const gesture = new Event('gesturestart', { cancelable: true })
    document.dispatchEvent(gesture)
    expect(gesture.defaultPrevented).toBe(false)
  })
})
