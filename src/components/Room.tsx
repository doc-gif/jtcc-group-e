import { useState } from 'react'
import { useApp } from '../app/appContext'
import { inviteUrl, useSimulatedRoom } from '../app/room'
import { navigate, paths } from '../app/router'
import { ROOM_CAPACITY } from '../domain/game'
import type { Gacha } from '../domain/types'

/** ルームを作ったあとの招待（LINE で送る／リンクをコピー）。 */
export function InviteActions({ gacha }: { gacha: Gacha }) {
  const [copied, setCopied] = useState<'idle' | 'done' | 'failed'>('idle')
  const url = inviteUrl(gacha.id)
  const text = `いっしょに回そう♡ ${gacha.title}\n${url}`
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied('done')
    } catch {
      setCopied('failed')
    }
  }
  return (
    <>
      <div className="share-row">
        <a className="btn btn-line" href={`https://line.me/R/msg/text/?${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer">LINEで送る</a>
        <button type="button" className="btn btn-outline" onClick={copy}>リンクをコピー</button>
      </div>
      <p className="fine" role="status">
        {copied === 'done' ? 'コピーしました。' : copied === 'failed' ? 'コピーできませんでした。下のリンクを長押ししてコピーしてください。' : ''}
      </p>
      <p className="invite-url">{url}</p>
      <p className="fine">デモ版では、友達の入室と結果をこの画面の中で再現しています（別のスマホとはまだつながりません）。QRを見せる機能は次のフェーズで作ります。</p>
    </>
  )
}

/** 待ち合わせ。全員が準備OKになると「みんなで回す」が押せる。 */
export function WaitingRoom({ gacha }: { gacha: Gacha }) {
  const { state } = useApp()
  const members = useSimulatedRoom()
  const readyCount = 1 + members.filter((member) => member.status === 'ready').length
  const expected = 1 + members.length
  const empty = ROOM_CAPACITY - expected
  return (
    <>
      <ul className="members" aria-label="ルームのメンバー">
        <li><span className="avatar a1" aria-hidden="true">{state.nickname.slice(0, 1)}</span><span>{state.nickname === 'あなた' ? 'あなた' : `${state.nickname}（あなた）`}</span><em>準備OK</em></li>
        {members.map((member, index) => (
          <li key={member.name} className={member.status === 'waiting' ? 'ghost' : undefined}>
            <span className={`avatar a${index + 2}`} aria-hidden="true">{member.status === 'waiting' ? '＋' : member.name.slice(0, 1)}</span>
            <span>{member.status === 'waiting' ? '招待中…' : `${member.name}（デモ）`}</span>
            <em>{member.status === 'ready' ? '準備OK' : member.status === 'joined' ? '入室しました' : ''}</em>
          </li>
        ))}
        {empty > 0 && <li className="ghost"><span className="avatar" aria-hidden="true">＋</span><span>あと{empty}人 入れます</span></li>}
      </ul>
      <button type="button" className="btn btn-lux btn-block" disabled={readyCount < expected} onClick={() => navigate(paths.roomSpin(gacha.id))}>
        みんなで回す（{readyCount}/{expected}人が準備OK）
      </button>
    </>
  )
}
