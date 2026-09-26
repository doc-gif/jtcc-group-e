import type { ReactNode } from 'react'
import { paths } from '../app/router'
import type { SpinError } from '../domain/game'

/** 回せないとき（売り切れ・コイン不足）の理由。回せるときは何も出さない。 */
export function SpinUnavailable({ problem }: { problem: SpinError | null }) {
  if (problem === null) return null
  return problem === 'insufficient-coins' ? (
    <p className="detail-note" role="status">コインが足りません。今回は引けません。<a href={paths.me}>マイページでコインを追加</a></p>
  ) : (
    <p className="detail-note" role="status">このガチャは売り切れました。抽選はできません。<a href={paths.gachaList}>ガチャ一覧に戻る</a></p>
  )
}

/** 回す前の確認へ進む主ボタン。回せないときは押せない状態にして、回す操作を出さない。 */
export function SpinLink({ gachaId, problem, children }: { gachaId: string; problem: SpinError | null; children: ReactNode }) {
  if (problem !== null) return <a className="btn btn-main btn-block is-disabled" role="link" aria-disabled="true">{children}</a>
  return <a className="btn btn-main btn-block" href={paths.soloSpin(gachaId)}>{children}</a>
}
