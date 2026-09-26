import { cleanName, SHARED_NAME_MAX, SHARED_PRIZES, SHARED_TOP_PRIZE, type RoomErrorCode, type SharedPrize } from '../realtime/protocol'
import type { RoomState } from '../realtime/roomController'
import type { GoodsArt, Glow } from '../domain/types'

/**
 * 共有ルームの画面（デザインマスター T10、21 画面）。1 つの値が 1 つの画面・状態に対応する。
 * マスター node は docs/ADOPTED_DESIGN.md の T10 の行。
 */
export type RoomView =
  | 'invite' // 267:8917 招待
  | 'lobby' // 267:8993 待機ロビー（抽選か見守りかを選ぶ。人数待ちは 312:6486）
  | 'ready' // 267:9069 準備完了
  | 'full' // 267:9144 満席
  | 'countdown' // 267:9220 カウントダウン
  | 'opening' // 267:9299 同時開封
  | 'myResult' // 267:9379 自分の結果（ピッチ用は 292:3118）
  | 'reconnecting' // 267:9455 再接続中
  | 'recover' // 267:9530 復帰・結果回収
  | 'hostAway' // 267:9603 ホスト不在
  | 'hostResume' // 267:9678 ホストの再開
  | 'expired' // 267:9754 ルーム終了
  | 'watching' // 267:9830 見守り中
  | 'allResults' // 267:9906 みんなの結果
  | 'hostStart' // 267:9987 ホストの開始（人数待ちは 312:6410）
  | 'hostSchedule' // 292:2780 ホストの予約設定
  | 'hostScheduled' // 292:2871 予約済み（ホスト。時刻を過ぎて人数待ちは 312:6562）
  | 'guestScheduled' // 292:2957 予約済み（参加者。時刻を過ぎて人数待ちは 312:6648）
  | 'scheduleFailed' // 292:3034 予約開始できず（ホスト）
  | 'nameChoose' // 298:2709 招待・名前を選ぶ（入室後の名前の変更にも使う）
  | 'nameAuto' // 298:2790 招待・名前を決めずに入る
  | 'nameTaken' // 298:2867 招待・名前が使われている
  | 'history' // 自分の履歴（このルームで開けた結果）。マスターは棚へ遷移（Figma 修正待ち）

/** 画面の中だけの選択（サーバーには送らない）。 */
export interface RoomUi {
  /** このルームに入っているか（controller がこのルームを開いている）。 */
  inRoom: boolean
  /** 入る前の失敗（満席・無効な招待）。 */
  joinError: RoomErrorCode | null
  /** 名前の画面。choose は名前を選ぶ、taken は名前が使われている。入室後は名前の変更に使う。 */
  nameStep: 'choose' | 'taken' | null
  /** 名前を決めずに入り、自動の名前をまだ確かめていない。 */
  autoNamed: boolean
  /** 見守りを選んだ（サーバーでは「準備していない」人）。 */
  watching: boolean
  /** 結果の画面で開いている詳細。null は同時開封の画面。 */
  detail: 'mine' | 'all' | 'history' | null
  /** ホストが予約の設定を開いている。 */
  scheduleSetup: boolean
  /** 再読み込み・再接続でルームへ戻ってきた。 */
  resumed: boolean
  /** この画面で秒読みから見ていたラウンド（ここにない公開済みの結果は「復帰・結果回収」で知らせる）。 */
  watchedRounds: ReadonlySet<number>
  /** 「ロビーで待つ」を選んだ（ホスト不在の画面を閉じた）。 */
  hostAwayAck: boolean
  /** 復帰の案内（おかえりなさい・ホストとして戻りました）を閉じた。 */
  resumeAck: boolean
}

/** 名前の確かめ（1〜12文字、サーバーと同じ cleanName）。問題がなければ空文字。 */
export function nameProblem(name: string): string {
  if (!name.trim()) return '名前を入れてください'
  if ([...name.replace(/\s+/g, ' ').trim()].length > SHARED_NAME_MAX) return `名前は${SHARED_NAME_MAX}文字までです`
  return cleanName(name) === null ? '使えない文字が入っています' : ''
}

/** 見ていないうちに公開された自分の結果（再読み込み・長い通信断のあと）。 */
export function missedResults(state: RoomState, ui: RoomUi) {
  return state.unseenResults.filter(result => !ui.watchedRounds.has(result.roundNo))
}

export function roomView(state: RoomState, ui: RoomUi): RoomView {
  if (!ui.inRoom) {
    if (ui.joinError === 'room-full') return 'full'
    if (ui.joinError === 'room-unavailable') return 'expired'
    return ui.nameStep === 'taken' ? 'nameTaken' : ui.nameStep === 'choose' ? 'nameChoose' : 'invite'
  }
  const { phase } = state
  if (phase === 'unavailable') return 'expired'
  if (phase === 'reconnecting' || phase === 'connecting' || phase === 'idle' || !state.snapshot) return 'reconnecting'
  if (ui.detail === 'history') return 'history'
  if (phase === 'countdown') return 'countdown'
  if (phase === 'opening') return 'opening'
  if (ui.resumed && !ui.resumeAck && missedResults(state, ui).length > 0) return 'recover'
  if (phase === 'results') return ui.detail === 'all' ? 'allResults' : ui.detail === 'mine' ? 'myResult' : 'opening'
  if (ui.nameStep) return ui.nameStep === 'taken' ? 'nameTaken' : 'nameChoose'
  if (ui.autoNamed) return 'nameAuto'
  if (state.isHost) {
    // 予約の結末・予約中は、戻ってきたときもそのまま見せる（時刻と取り消しが先に要る）
    if (state.scheduleNotice) return 'scheduleFailed'
    if (state.scheduledAt) return 'hostScheduled'
    if (ui.resumed && !ui.resumeAck) return 'hostResume'
    return ui.scheduleSetup ? 'hostSchedule' : 'hostStart'
  }
  if (!state.hostOnline && !ui.hostAwayAck) return 'hostAway'
  if (state.scheduledAt) return 'guestScheduled'
  if (state.self?.ready) return 'ready'
  return ui.watching ? 'watching' : 'lobby'
}

/** 秒数を「00:08」の形に。 */
export function clockText(seconds: number | null): string {
  const value = Math.max(0, seconds ?? 0)
  const minutes = Math.floor(value / 60)
  return `${String(minutes).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`
}

/** 残り時間を「2:45」の形に（予約の秒読み）。 */
export function remainText(seconds: number | null): string {
  const value = Math.max(0, seconds ?? 0)
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`
}

/** サーバーの UTC 時刻を、この端末の時刻「21:03」で表す。 */
export function timeOfDay(iso: string): string {
  const date = new Date(iso)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

/** 共有ルームの賞品（説明用の架空の品）と、public/assets/goods のオリジナルの絵。 */
export const PRIZE_ART: Record<SharedPrize, { art: GoodsArt; glow: Glow; mark: string }> = {
  plush: { art: 'plush', glow: 'featured', mark: '✦' },
  pouch: { art: 'pouch', glow: 'sparkle', mark: '◇' },
  badge: { art: 'badge', glow: 'normal', mark: '○' },
}

export const prizeName = (prize: SharedPrize) => SHARED_PRIZES[prize].name
export const isTopPrize = (prize: SharedPrize) => prize === SHARED_TOP_PRIZE

/** ホストの呼び名（「ミオさんのルーム」）。 */
export function roomTitle(state: RoomState): string {
  if (state.isHost) return 'あなたのルーム'
  const host = state.members.find(member => member.id === state.snapshot?.host)
  return host ? `${host.nickname}さんのルーム` : 'みんなの開封ルーム'
}
