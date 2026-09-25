/**
 * チャイム（WebAudio）・ピピの読み上げ（speechSynthesis）・振動。
 * どれも利用者が ON にしたときだけ、操作のあとに鳴らす（自動再生しない）。使えない端末では何もしない。
 */
let context: AudioContext | null = null

function audio(): AudioContext | null {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    context ??= new Ctor()
    if (context.state === 'suspended') void context.resume()
    return context
  } catch {
    return null
  }
}

function tone(ctx: AudioContext, frequency: number, start: number, duration: number, volume: number) {
  const oscillator = ctx.createOscillator()
  const gain = ctx.createGain()
  oscillator.frequency.value = frequency
  const t = ctx.currentTime + start
  gain.gain.setValueAtTime(0, t)
  gain.gain.linearRampToValueAtTime(volume, t + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration)
  oscillator.connect(gain).connect(ctx.destination)
  oscillator.start(t)
  oscillator.stop(t + duration + 0.05)
}

export function chime(notes: number[], gap = 0.09) {
  const ctx = audio()
  if (!ctx) return
  notes.forEach((frequency, index) => tone(ctx, frequency, index * gap, 0.6, 0.12))
}

export const CHIMES = {
  turn: [659, 880],
  big: [523, 659, 784, 1047, 1319],
  tap: [988],
}

export function speak(text: string) {
  try {
    if (!('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text.replace(/[♡✦✧…！!]/g, '').replace(/〜/g, 'ー'))
    utterance.lang = 'ja-JP'
    utterance.pitch = 1.7
    utterance.rate = 1.15
    window.speechSynthesis.speak(utterance)
  } catch {
    // 読み上げできない端末では吹き出しだけにする
  }
}

export function buzz(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    // 振動に対応しない端末（iPhone など）では何もしない
  }
}
