import { useState, type FormEvent } from 'react'
import { useApp } from '../app/appContext'
import { paths } from '../app/router'
import { findGacha } from '../domain/catalog'
import { DEMO_FRIENDS, NICKNAME_MAX, ROOM_CAPACITY, setNickname, spinCheck } from '../domain/game'
import { coinText } from '../domain/odds'
import { MockNotice } from '../components/Chrome'
import { WaitingRoom } from '../components/Room'
import { NotFound } from './NotFound'

/**
 * 招待リンクの行き先。インストールもログインも不要で、ニックネームだけ入れて参加する。
 * 参加したら待ち合わせ → 回す画面へ進む。
 */
export function Room({ code }: { code: string }) {
  const { state, update } = useApp()
  const gacha = findGacha(code)
  const [name, setName] = useState(state.nickname === 'あなた' ? '' : state.nickname)
  const [error, setError] = useState('')
  const [joined, setJoined] = useState(false)
  if (!gacha) return <NotFound />
  const problem = spinCheck(state, gacha.id)
  const join = (event: FormEvent) => {
    event.preventDefault()
    const result = setNickname(state, name)
    if (!result.ok) { setError(result.message); return }
    update((current) => ({ ...current, nickname: result.state.nickname, welcomed: true }))
    setJoined(true)
  }
  return (
    <div className="screen invite-screen">
      <main className="content">
        <div className="invitation">
          <p className="invite-from" lang="en">LAST PIECE</p>
          <p className="invite-from">{DEMO_FRIENDS[0]}さんから（デモ）</p>
          <h1 id="page-title" tabIndex={-1}>{joined ? 'みんなを待っています' : 'いっしょに回そう♡'}</h1>
          <p className="lead room-lead">{gacha.title}<br />1回 {coinText(gacha.price)}コイン・中身は全{gacha.prizes.length}種・最大{ROOM_CAPACITY}人</p>
        </div>
        {!joined ? (
          <>
            <form className="name-form" onSubmit={join} noValidate>
              <label htmlFor="invite-name">ニックネーム（ルームで友達に見えます・{NICKNAME_MAX}文字まで）</label>
              <input id="invite-name" value={name} onChange={(event) => setName(event.target.value)} aria-invalid={error ? true : undefined} aria-describedby={error ? 'invite-error' : undefined} autoComplete="nickname" />
              {error && <p id="invite-error" className="field-error">{error}</p>}
              <button type="submit" className="btn btn-lux btn-block">ルームに入る</button>
            </form>
            <p className="fine">インストールもログインも不要です。はじめての方には体験用のコインが入っています（デモ）。</p>
          </>
        ) : problem ? (
          <p className="field-error" role="status">{problem === 'insufficient-coins' ? 'コインが足りません。マイページで追加してから参加してください。' : 'このガチャは売り切れました。'}</p>
        ) : (
          <WaitingRoom gacha={gacha} />
        )}
        <a className="btn btn-text btn-block" href={paths.gacha(gacha.id)}>ガチャの中身と確率を見る</a>
        <MockNotice />
      </main>
    </div>
  )
}
