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

  it('ボタンと絵の長押しメニューは止め、リンク・入力欄・本文は出せるまま', () => {
    uninstall = installGestureGuards()
    document.body.innerHTML = '<button><svg><circle /></svg><span>回す</span></button><img alt="" /><a href="#/"><img alt="" /></a><input /><p>本文</p>'
    const menu = (selector: string) => {
      const event = new Event('contextmenu', { bubbles: true, cancelable: true })
      document.querySelector(selector)!.dispatchEvent(event)
      return event.defaultPrevented
    }
    expect(menu('button span')).toBe(true)
    expect(menu('circle')).toBe(true)
    expect(menu('body > img')).toBe(true)
    expect(menu('a img')).toBe(false)
    expect(menu('input')).toBe(false)
    expect(menu('p')).toBe(false)
    const text = new Event('contextmenu', { cancelable: true })
    document.dispatchEvent(text)
    expect(text.defaultPrevented).toBe(false)
    document.body.innerHTML = ''
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
