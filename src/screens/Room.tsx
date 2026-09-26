import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useApp } from '../app/appContext'
import { LOADING_DELAY, useDelayed } from '../app/assets'
import { navigate, paths } from '../app/router'
import {
  clockText, missedResults, nameProblem, prizeName, remainText, roomTitle, roomView, timeOfDay,
  type RoomUi,
} from '../app/roomView'
import { forgetRecord, readRecords, useRoomSession, useRoomState, writeRecord } from '../app/sharedRoom'
import { MockNotice, PageHeader } from '../components/Chrome'
import {
  HostLinkPanel, InviteShare, PITCH_ROOM_TEXT, PITCH_ROUND_TEXT, PitchLabel, ResultRow, RoomCard, RoomNameForm, RoomStage,
  RoomStats, RoomSwitch, ScheduleChoices, type RoomStat, type StageVariant,
} from '../components/Room'
import { Sheet } from '../components/Sheet'
import { RoomContractError, SHARED_PRICE, errorMessage, type RoomErrorCode, type ScheduleMinutes, type ScheduleStatus, type SharedPrize } from '../realtime/protocol'
import type { RoomState } from '../realtime/roomController'
import './room.css'

/*
 * 共有ルーム（デザインマスター T10 の 24 画面）。どの画面を出すかは src/app/roomView.ts が状態から決める。
 * 状態は src/realtime の controller（サーバーの snapshot が正）。この画面は表示と操作の受け渡しだけをする。
 */

type Back = { href: string } | { onClick: () => void }

interface Layout {
  title: string
  sub: string
  back: Back
  /** ピッチ用デモの明示（結果の画面では見出しのすぐ下、292:3118）。 */
  pitchTop?: string | null
  stage?: { caption: string; variant?: StageVariant; countdown?: string; prize?: SharedPrize | null; compact?: boolean } | null
  stats?: [RoomStat, RoomStat] | null
  note?: ReactNode
  card: ReactNode
  primary: ReactNode
  secondary?: ReactNode
}

/** 上部（マスターの提案モックの一行・戻る・題・補足）。共通の PageHeader を使う。 */
function RoomHeader({ title, sub, back }: { title: string; sub: string; back: Back }) {
  return (
    <PageHeader title={title} {...('href' in back ? { back: back.href } : { onBack: back.onClick })}>
      <p className="page-header-sub room-sub">{sub}</p>
    </PageHeader>
  )
}

function DemoLine({ demo }: { demo: boolean }) {
  if (!demo) return null
  return <p className="room-demo">デモ：この端末のブラウザの中だけのルームです（別のスマホとはつながりません）</p>
}

function RoomFrame({ layout, demo, faces, children }: { layout: Layout; demo: boolean; faces: string[]; children?: ReactNode }) {
  return (
    <div className="screen room-screen">
      <RoomHeader title={layout.title} sub={layout.sub} back={layout.back} />
      <main className="content room-content">
        <DemoLine demo={demo} />
        {layout.pitchTop && <PitchLabel>{layout.pitchTop}</PitchLabel>}
        {layout.stage && <RoomStage {...layout.stage} faces={faces} />}
        {layout.stats && <RoomStats items={layout.stats} />}
        {layout.note && <p className="room-line">{layout.note}</p>}
        {layout.card}
        {children}
        <MockNotice />
      </main>
      <div className="sticky-actions room-dock">
        {layout.primary}
        {layout.secondary}
      </div>
    </div>
  )
}

function Primary({ onClick, disabled, children, form }: { onClick?: () => void; disabled?: boolean; children: ReactNode; form?: string }) {
  return (
    <button type={form ? 'submit' : 'button'} form={form} className="btn btn-main btn-block" disabled={disabled} onClick={onClick}>
      {children}
    </button>
  )
}

function Secondary({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return <button type="button" className="btn btn-text btn-block" disabled={disabled} onClick={onClick}>{children}</button>
}

function SecondaryLink({ href, children }: { href: string; children: ReactNode }) {
  return <a className="btn btn-text btn-block" href={href}>{children}</a>
}

function DockNote({ children }: { children: ReactNode }) {
  return <p className="room-dock-note">{children}</p>
}

const SCHEDULE_REASON: Record<ScheduleStatus, string> = {
  started: '開始しました',
  cancelled: '取り消しました',
  'nobody-ready': '準備完了の人がいませんでした',
  'sold-out': '全員分の中身が残っていませんでした',
  'insufficient-coins': 'コインが足りない人がいました',
  failed: '開始できませんでした',
}

const faceOf = (name: string) => [...name][0] ?? '？'

function defaultStats(state: RoomState): [RoomStat, RoomStat] {
  return [
    { label: '集まっている人', value: `${state.seats.taken}人` },
    { label: '抽選の準備', value: `${state.readyOnline}人 準備完了` },
  ]
}

/** 招待リンクの行き先（#/room/<invite>）。参加者もホストも同じ URL で、画面はサーバーの状態で決まる。 */
export function Room({ invite }: { invite: string }) {
  const session = useRoomSession()
  const { controller, records, demo } = session
  const state = useRoomState(session)
  const { state: app } = useApp()
  const [record] = useState(() => readRecords(records)[invite] ?? null)
  // この画面を開いた時点で、記録のルームにまだつながっていなければ開き直す（復帰）
  const [resumed] = useState(() => {
    if (!record) return false
    if (record.viaHostLink) return true
    const now = controller.getState()
    return now.roomId !== record.roomId || now.phase === 'unavailable'
  })
  // ホスト用リンク（#/host/<key>）から戻ってきた
  const viaHostLink = record?.viaHostLink === true
  const [joinError, setJoinError] = useState<RoomErrorCode | null>(null)
  const [nameStep, setNameStep] = useState<RoomUi['nameStep']>(null)
  const [name, setName] = useState(app.nickname === 'あなた' ? '' : app.nickname)
  const [nameError, setNameError] = useState('')
  const [taken, setTaken] = useState<{ name: string; suggestion: string } | null>(null)
  const [autoNamed, setAutoNamed] = useState(false)
  const [lastName, setLastName] = useState<string | null>(null)
  const [watching, setWatchingState] = useState(record?.watching ?? false)
  const [detail, setDetail] = useState<RoomUi['detail']>(null)
  const [scheduleSetup, setScheduleSetup] = useState(false)
  const [hostAwayAck, setHostAwayAck] = useState(false)
  const [resumeAck, setResumeAck] = useState(false)
  const [watchedRounds, setWatchedRounds] = useState<ReadonlySet<number>>(() => new Set())
  const [share, setShare] = useState(false)
  const [minutes, setMinutes] = useState<ScheduleMinutes | null>(null)

  const snapshot = state.snapshot
  const recordRoom = record?.roomId ?? null
  const inRoom = state.roomId !== null && (snapshot ? snapshot.invite === invite : state.roomId === recordRoom)

  // 再読み込み・別の画面から戻ったときは、記録のルームを開き直す（最新ロビーへ復帰）。
  useEffect(() => {
    if (!resumed || !record) return
    const now = controller.getState()
    if (now.roomId !== record.roomId || now.phase === 'unavailable') void controller.open(record.roomId)
  }, [controller, record, resumed])

  // 期限切れ・無効になったルームは記録から外す
  useEffect(() => {
    if (inRoom && state.phase === 'unavailable') forgetRecord(records, invite)
  }, [inRoom, state.phase, records, invite])

  // 秒読みから見ていたラウンドを覚える。新しいラウンドが始まったら開いていた詳細を閉じる。
  const roundNo = state.round?.number ?? null
  const counting = state.phase === 'countdown' || state.phase === 'opening'
  if (counting && roundNo !== null && !watchedRounds.has(roundNo)) {
    setWatchedRounds(new Set(watchedRounds).add(roundNo))
    if (detail === 'history') setDetail(null)
    setScheduleSetup(false)
  }

  // ホストが戻ったら「ロビーで待つ」の選択を戻す（次に離れたときにまた知らせる）
  const hostIsOnline = state.hostOnline
  if (hostIsOnline && hostAwayAck) setHostAwayAck(false)

  const ui: RoomUi = { inRoom, joinError, nameStep, autoNamed, watching, detail, scheduleSetup, resumed, watchedRounds, hostAwayAck, resumeAck }
  const view = roomView(state, ui)

  // 自分の結果・履歴を見たら、この端末に「確認済み」と残す（次に開いたとき「おかえりなさい」で知らせない）
  const seenRounds = (view === 'myResult' || view === 'history') && state.phase !== 'unavailable' ? state.myResults.map((result) => result.roundNo).join(',') : null
  useEffect(() => {
    if (seenRounds === null || !snapshot) return
    writeRecord(records, invite, { roomId: snapshot.id, seen: seenRounds ? seenRounds.split(',').map(Number) : [] })
  }, [seenRounds, snapshot, records, invite])

  // 画面が変わったら見出しに焦点を移す（押したボタンが消えても迷わない・読み上げで切り替わりが分かる）
  const firstView = useRef(true)
  useEffect(() => {
    if (firstView.current) { firstView.current = false; return }
    document.getElementById('page-title')?.focus({ preventScroll: false })
  }, [view])

  // 開き直しの待ち時間は、300ms を超えたときだけ「接続を確認しています」を出す（F09 と同じ決まり）
  const connecting = inRoom && state.phase === 'connecting'
  const waitedLong = useDelayed(connecting, LOADING_DELAY)

  const busy = state.busy !== null
  const self = state.self
  const faces = state.members.slice(0, 4).map((member) => faceOf(member.nickname))
  const title = snapshot ? roomTitle(state) : 'ラストピースの開封ルーム'

  const setWatching = (value: boolean) => {
    setWatchingState(value)
    const room = controller.getState().snapshot?.id
    if (room) writeRecord(records, invite, { roomId: room, watching: value })
  }
  const markSeen = () => {
    controller.dismissResults()
    const snap = controller.getState().snapshot
    if (snap) writeRecord(records, invite, { roomId: snap.id, seen: snap.myResults.map((result) => result.roundNo) })
  }

  /** 名前を決めて（value が null なら名前を決めずに）入る。入室後は名前の変更。 */
  const joinWith = async (value: string | null) => {
    setNameError('')
    let clean: string | null = null
    if (value !== null) {
      const problem = nameProblem(value)
      if (problem) { setNameError(problem); return }
      clean = value.replace(/\s+/g, ' ').trim()
    }
    const renaming = inRoom
    const result = renaming && clean !== null ? await controller.rename(clean) : await controller.join(invite, clean)
    if (result.ok) {
      const snap = controller.getState().snapshot
      if (!renaming && snap) writeRecord(records, invite, { roomId: snap.id, watching })
      setLastName(snap?.members.find((member) => member.id === snap.self)?.nickname ?? clean)
      setJoinError(null)
      setTaken(null)
      setNameStep(null)
      setAutoNamed(!renaming && value === null)
      return
    }
    const error = result.error
    if (!error) return
    if (error.code === 'name-taken' && clean !== null && error.suggestion) {
      setName(clean)
      setTaken({ name: clean, suggestion: error.suggestion })
      setNameStep('taken')
      return
    }
    if (!renaming && (error.code === 'room-full' || error.code === 'room-unavailable')) {
      setJoinError(error.code)
      setNameStep(null)
      return
    }
    setNameError(error.message)
  }

  /** 復帰の案内（おかえりなさい・ホストとして戻りました）を閉じる。 */
  const ackResume = () => {
    setResumeAck(true)
    const room = controller.getState().snapshot?.id
    if (viaHostLink && room) writeRecord(records, invite, { roomId: room, viaHostLink: false })
  }

  const startRename = () => {
    setName(self?.nickname ?? '')
    setNameError('')
    setTaken(null)
    setNameStep('choose')
  }

  const start = () => { void controller.start() }
  const ready = (value: boolean) => { void controller.setReady(value) }
  const schedule = async (value: ScheduleMinutes | null) => {
    const result = await controller.schedule(value)
    if (result.ok) { setScheduleSetup(false); setMinutes(null) }
  }
  const leave = async () => {
    const result = await controller.leave()
    if (result.ok) { forgetRecord(records, invite); navigate(paths.town) }
  }

  const stats = defaultStats(state)
  const results = state.round?.results ?? null
  const pitchRound = state.roundGuaranteed ? PITCH_ROUND_TEXT : null
  const pitchNone = state.pitchMode && state.round && !state.roundGuaranteed && snapshot?.stock?.find((item) => item.prize === 'plush')?.remaining === 0
    ? 'ピッチ用デモ：目玉が残っていないため、このラウンドは確定なし（通常の抽選）'
    : null
  const pitchChip = state.pitchMode ? <PitchLabel>{PITCH_ROOM_TEXT}</PitchLabel> : null
  const errorLine = state.error ? <p className="field-error room-error" role="alert">{state.error.message}</p> : null
  const renameLine = self && (
    <p className="room-me">
      <span>あなたの名前：<b>{self.nickname}</b></span>
      <button type="button" className="room-rename" onClick={startRename}>名前を変える</button>
    </p>
  )
  const lowCoins = self && !self.ready && (state.balance ?? 0) < SHARED_PRICE
    ? <p className="room-reason" role="status">{errorMessage('insufficient-coins')}</p>
    : null
  const cooldownLabel = state.phase === 'cooldown' ? `次の抽選まで あと${state.secondsLeft ?? 0}秒` : null
  const hostJoin = self && (
    <RoomSwitch label="わたしも抽選に参加する" checked={self.ready} disabled={!state.canReady}
      description={self.ready ? '開始の時点で500デモコインを使います。オフにすると見守りです。' : 'オンにすると、開始の時点で500デモコインを使います。'}
      onChange={ready} />
  )
  const startReason = state.startBlockedBy === 'nobody-ready'
    ? '準備完了の人がいないため、まだ開始できません。あなたも参加するか、参加者の準備を待ってください。'
    : state.startBlockedBy === 'round-active' ? `次の開封まで あと${state.secondsLeft ?? 0}秒お待ちください。` : null
  const chosen = minutes && state.scheduleOptions.includes(minutes) ? minutes : state.scheduleOptions.includes(3) ? 3 : state.scheduleOptions[0] ?? null
  const scheduleChoices = (selected: ScheduleMinutes | null, onSelect: (value: ScheduleMinutes) => void) => (
    <ScheduleChoices legend="開始までの時間" options={state.scheduleOptions} selected={selected} onSelect={onSelect} disabled={!state.canSchedule} />
  )
  const toLobby = { href: paths.town }

  let layout: Layout
  switch (view) {
    case 'invite':
      layout = {
        title: 'ルームへの招待', sub: 'ラストピースの開封ルーム', back: toLobby,
        stage: { caption: 'いっしょに開けよう' },
        stats: [{ label: '集まっている人', value: '入室後に表示', plain: true }, { label: '抽選の準備', value: '入室後に選べます', plain: true }],
        note: '招待リンクから入室できます',
        card: (
          <RoomCard kicker="INVITE" title="招待が届いたよ" labelledBy="room-card-title" note="見守るだけならコインは使いません">
            <p className="room-body">ルームに入ってから、抽選参加か見守りかを選べます。</p>
          </RoomCard>
        ),
        primary: <Primary onClick={() => setNameStep('choose')}>ルームに入る</Primary>,
        secondary: <SecondaryLink href={paths.town}>今は見送る</SecondaryLink>,
      }
      break
    case 'nameChoose':
    case 'nameTaken': {
      const renaming = inRoom
      const isTaken = view === 'nameTaken' && taken
      layout = {
        title: renaming ? '名前を変える' : 'ルームへの招待', sub: renaming ? title : 'ラストピースの開封ルーム',
        back: { onClick: () => { setNameStep(null); setTaken(null) } },
        stage: { caption: 'いっしょに開けよう', compact: true },
        stats: renaming ? stats : [{ label: '集まっている人', value: '入室後に表示', plain: true }, { label: '抽選の準備', value: '入室後に選べます', plain: true }],
        note: 'ルームの中で表示される名前です',
        card: (
          <RoomCard kicker="INVITE" title={isTaken ? 'その名前は使われています' : renaming ? 'どんな名前にする？' : 'どんな名前で入る？'} labelledBy="room-card-title"
            note={isTaken ? undefined : renaming ? 'ロビーからいつでも変えられます' : '名前を決めなくても入れます。あとから変えられます'}>
            <RoomNameForm id="room-name" value={name} onChange={(value) => { setName(value); if (isTaken) { setTaken(null); setNameStep('choose') } }}
              busy={busy} error={nameError} onSubmit={() => void joinWith(name)} />
            {isTaken && <p className="room-body" role="status">このルームにはすでに「{isTaken.name}」さんがいます。「{isTaken.suggestion}」ならすぐ入れます。</p>}
          </RoomCard>
        ),
        primary: isTaken
          ? <Primary onClick={() => void joinWith(isTaken.suggestion)} disabled={busy}>「{isTaken.suggestion}」{renaming ? 'にする' : 'で入る'}</Primary>
          : <Primary form="room-name" disabled={busy}>{busy ? '接続しています…' : renaming ? 'この名前にする' : 'この名前で入る'}</Primary>,
        secondary: isTaken
          ? <Secondary onClick={() => { setTaken(null); setNameStep('choose'); setName(''); window.setTimeout(() => document.getElementById('room-name-input')?.focus(), 0) }}>別の名前にする</Secondary>
          : renaming
          ? <Secondary onClick={() => setNameStep(null)}>名前を変えずに戻る</Secondary>
          : <Secondary onClick={() => void joinWith(null)} disabled={busy}>名前を決めずに入る</Secondary>,
      }
      break
    }
    case 'nameAuto':
      layout = {
        title: 'ルームへの招待', sub: title, back: { onClick: () => setAutoNamed(false) },
        stage: { caption: 'いっしょに開けよう', compact: true },
        stats, note: '名前は自動で付けました',
        card: (
          <RoomCard kicker="INVITE" title={`「${self?.nickname ?? ''}」で入ります`} labelledBy="room-card-title" note="ロビーからいつでも変えられます">
            <p className="room-body">ルームの中ではこの名前で表示されます。ほかの人と重ならない名前を自動で付けました。</p>
          </RoomCard>
        ),
        primary: <Primary onClick={() => setAutoNamed(false)}>この名前で入る</Primary>,
        secondary: <Secondary onClick={() => { setAutoNamed(false); setName(''); setNameError(''); setNameStep('choose') }}>自分で名前を決める</Secondary>,
      }
      break
    case 'full':
      layout = {
        title: 'ただいま満員です', sub: 'ラストピースの開封ルーム', back: toLobby,
        stage: { caption: 'また一緒に開けよう' },
        stats: [{ label: 'ルームの状態', value: '満員', plain: true }, { label: '新規入室', value: 'できません', plain: true }],
        note: '新しい参加者は入室できません',
        card: (
          <RoomCard kicker="FULL" title="これ以上は入れません" labelledBy="room-card-title" note="入室済みなら参加情報を保持">
            <p className="room-body">この端末ですでに入室していた場合は、同じ参加情報で再接続できます。</p>
            {nameError && <p className="field-error" role="alert">{nameError}</p>}
          </RoomCard>
        ),
        primary: <a className="btn btn-main btn-block" href={paths.town}>招待元へ戻る</a>,
        secondary: <Secondary disabled={busy} onClick={() => { if (lastName ?? name.trim()) void joinWith(lastName ?? name); else { setJoinError(null); setNameStep('choose') } }}>参加済みなら再接続する</Secondary>,
      }
      break
    case 'expired': {
      const expired = snapshot !== null && Date.parse(snapshot.expiresAt) <= controller.serverNow()
      const hasHistory = state.myResults.length > 0
      layout = {
        title: 'ルームは終了しました',
        // 入っていたルーム（記録あり）に入れなくなったのは、ほぼ期限切れ。招待だけのときは無効か期限切れか区別できない
        sub: expired || resumed ? '有効期限が過ぎました' : demo ? 'デモのルームが見つかりません' : '招待が無効か、期限が切れています',
        back: toLobby,
        stage: { caption: 'また一緒に開けよう', variant: 'closed' },
        stats: [{ label: 'ルームの状態', value: '終了', plain: true }, { label: '新規入室', value: 'できません', plain: true }],
        note: 'この招待リンクからは入室できません',
        card: (
          <RoomCard kicker="CLOSED" title="新しいルームで会おう" labelledBy="room-card-title"
            note={hasHistory ? 'このページを開いている間は、結果を履歴で見られます' : undefined}>
            <p className="room-body">
              {expired || resumed ? 'このルームの有効期限が過ぎました。' : demo ? 'デモのルームは、作ったブラウザの中だけにあります。別のブラウザや端末では入れません。' : 'リンクが古いか、ルームの期限（作成から2時間）が過ぎています。'}
              {hasHistory ? '自分の過去の結果は履歴から確認できます。' : ''}
            </p>
          </RoomCard>
        ),
        primary: hasHistory
          ? <Primary onClick={() => setDetail('history')}>自分の履歴を見る</Primary>
          : <a className="btn btn-main btn-block" href={paths.createRoom}>新しいルームを作る</a>,
        secondary: <SecondaryLink href={paths.town}>街へ戻る</SecondaryLink>,
      }
      break
    }
    case 'reconnecting':
      layout = {
        title: '接続を確認しています', sub: `${title} · 復帰中`, back: toLobby,
        stage: { caption: 'すぐに戻るね' },
        stats: [{ label: '集まっている人', value: '--人', plain: true }, { label: '抽選の準備', value: '確認中', plain: true }],
        note: '最後に見た画面はそのまま保持',
        card: (
          <RoomCard kicker="RECONNECT" title="参加情報を確認中" labelledBy="room-card-title" note="500デモコインは二重に使いません">
            <p className="room-body">同じ端末の参加情報で復帰します。通信が戻るまで、抽選をもう一度送信しません。</p>
          </RoomCard>
        ),
        primary: <Primary onClick={() => void controller.refresh()} disabled={state.phase === 'connecting'}>再接続する</Primary>,
        secondary: <DockNote>通信が戻るまで待つ</DockNote>,
      }
      break
    case 'recover': {
      const missed = missedResults(state, ui)
      const latest = state.round && results && missed.some((result) => result.roundNo === state.round?.number)
      layout = {
        title: 'おかえりなさい', sub: `${title} · 結果を復元`, back: toLobby,
        stage: { caption: '続きから楽しもう', variant: 'sparkle' },
        stats: [{ label: '集まっている人', value: `${state.seats.taken}人` }, { label: '抽選の準備', value: '開封済み', plain: true }],
        note: '途中で離れても、自分の結果は残ります',
        card: (
          <RoomCard kicker="おかえり" title="あなたの結果を見られます" labelledBy="room-card-title" note={`未確認の結果 ${missed.length}件`}>
            <p className="room-body">開封履歴から今回の結果を確認できます。参加済みの抽選にもう一度請求しません。</p>
          </RoomCard>
        ),
        primary: <Primary onClick={() => { ackResume(); setDetail(latest ? 'mine' : 'history') }}>結果を確認する</Primary>,
        secondary: <Secondary onClick={() => { ackResume(); markSeen() }}>ルームに戻る</Secondary>,
      }
      break
    }
    case 'history': {
      const back = () => { if (state.phase === 'results') setDetail('mine'); else { markSeen(); setDetail(null) } }
      layout = {
        title: '自分の履歴', sub: title, back: { onClick: back },
        stage: null, stats: null,
        note: 'このルームで開けた自分の結果です',
        card: (
          <RoomCard kicker="HISTORY" title="このルームで開けたもの" labelledBy="room-card-title" note="ルームの期限（作成から2時間）を過ぎると、ここでは見られなくなります">
            {state.myResults.length === 0
              ? <p className="room-body">このルームで開けた結果は、まだありません。</p>
              : (
                <ul className="room-results">
                  {[...state.myResults].reverse().map((result) => (
                    <li key={result.roundNo} className="room-result">
                      <span className="room-result-mark" aria-hidden="true">✦</span>
                      <span>{result.roundNo}回目：{prizeName(result.prize)}</span>
                    </li>
                  ))}
                </ul>
              )}
          </RoomCard>
        ),
        primary: <Primary onClick={back}>{state.phase === 'unavailable' ? '閉じる' : 'ルームへ戻る'}</Primary>,
      }
      break
    }
    case 'countdown':
      layout = {
        title: 'もうすぐ開封！', sub: `${title} · 抽選は確定`, back: toLobby,
        pitchTop: pitchRound ?? pitchNone,
        stage: { caption: 'あと少し、せーので開けよう', variant: 'countdown', countdown: clockText(state.secondsLeft) },
        stats: [{ label: '集まっている人', value: `${state.seats.taken}人` }, { label: '抽選の準備', value: '参加確定', plain: true }],
        note: 'もうすぐ、みんなで一緒に開封',
        card: (
          <RoomCard kicker="COUNTDOWN" title="みんなで、せーので開けよう" labelledBy="room-card-title" note="結果は全員に同時公開">
            <p className="room-body">抽選は確定しました。結果は合図までお楽しみに。見守る人にも同時に公開します。</p>
          </RoomCard>
        ),
        primary: <Primary disabled>開封を待っています</Primary>,
        secondary: <DockNote>画面を閉じても結果は残ります</DockNote>,
      }
      break
    case 'opening': {
      const fetching = state.phase === 'opening'
      layout = {
        title: 'せーので、ひらこう！', sub: `${title} · 同時公開`, back: toLobby,
        pitchTop: pitchRound ?? pitchNone,
        stage: { caption: 'せーの、ぱかっ！', variant: 'open' },
        stats: [{ label: '集まっている人', value: `${state.seats.taken}人` }, { label: '抽選の準備', value: results ? `${results.length}人 参加` : '公開中' }],
        note: 'みんなに同じタイミングで公開されました',
        card: (
          <RoomCard kicker="REVEAL" title="開封の瞬間を共有" labelledBy="room-card-title" note="結果を見るまで次の抽選は待機">
            <p className="room-body">結果が見えるのはカウントダウン終了後。見守る友だちも一緒に楽しめます。</p>
          </RoomCard>
        ),
        primary: <Primary disabled={fetching} onClick={() => setDetail('mine')}>{fetching ? '結果を受け取っています' : '結果を見る'}</Primary>,
        secondary: <Secondary disabled={fetching} onClick={() => setDetail('all')}>みんなの反応を見る</Secondary>,
      }
      break
    }
    case 'myResult': {
      const prize = state.myPrize
      layout = {
        title: 'みんなの結果', sub: `${title} · ${state.round?.number ?? 0}回目`, back: { onClick: () => { markSeen(); setDetail(null) } },
        pitchTop: pitchRound ?? pitchNone,
        stage: prize ? { caption: 'おめでとう！', variant: 'prize', prize } : { caption: '今回は見守りでした', variant: 'sparkle' },
        stats: [{ label: '集まっている人', value: `${state.seats.taken}人` }, { label: '抽選の準備', value: `${results?.length ?? 0}人 参加` }],
        note: '自分の結果はあとから再確認できます',
        card: prize ? (
          <RoomCard kicker="YOUR PIECE" title={prizeName(prize)} labelledBy="room-card-title" note="自分の開封履歴に保存">
            <p className="room-body">あなたの結果です。開封後、みんなの結果も見られます。</p>
          </RoomCard>
        ) : (
          <RoomCard kicker="WATCHING" title="今回は見守りでした" labelledBy="room-card-title" note="見守りは無料">
            <p className="room-body">抽選には参加していないので、コインは使っていません。みんなの結果を見てみよう。</p>
          </RoomCard>
        ),
        primary: <Primary onClick={() => setDetail('all')}>みんなの結果を見る</Primary>,
        secondary: <Secondary onClick={() => setDetail('history')}>自分の履歴を見る</Secondary>,
      }
      break
    }
    case 'allResults': {
      const list = results ?? []
      const ordered = [...list.filter((result) => result.userId === snapshot?.self), ...list.filter((result) => result.userId !== snapshot?.self)]
      layout = {
        title: 'みんなのピース', sub: `${title} · 開封後`, back: { onClick: () => setDetail('mine') },
        pitchTop: pitchRound ?? pitchNone,
        stage: { caption: 'よろこびを分け合おう', variant: 'sparkle' },
        stats: [{ label: '集まっている人', value: `${state.seats.taken}人` }, { label: '抽選の準備', value: `${list.length}人 開封済み` }],
        note: `抽選に参加した${list.length}人の結果`,
        card: (
          <RoomCard kicker="EVERYONE" title="みんなの結果" labelledBy="room-card-title">
            <ul className="room-results">
              {ordered.map((result) => <ResultRow key={result.userId} nickname={result.nickname} prize={result.prize} self={result.userId === snapshot?.self} />)}
            </ul>
          </RoomCard>
        ),
        primary: <Primary onClick={() => setDetail('mine')}>自分の結果へ戻る</Primary>,
        secondary: <Secondary onClick={() => { markSeen(); setDetail(null) }}>ルームへ戻る</Secondary>,
      }
      break
    }
    case 'hostResume':
      layout = {
        title: 'ホストとして戻りました', sub: viaHostLink ? `${title} · ホスト用リンクで再開` : `${title} · この端末で再開`, back: toLobby,
        stage: { caption: '続きからはじめよう' }, stats, note: '進行役：あなた',
        card: (
          <RoomCard kicker="HOST" title="続きから進めよう" labelledBy="room-card-title"
            note={viaHostLink ? 'ホスト用リンクはあなただけが持っています' : '進行役はこの端末のあなたです'}>
            <p className="room-body">{viaHostLink ? 'ホスト用リンクを開いた端末で' : 'この端末で'}進行を続けます。参加者の席や結果はそのままです。</p>
            {startReason && <p className="room-reason" role="status">{startReason}</p>}
          </RoomCard>
        ),
        primary: <Primary onClick={() => { ackResume(); start() }} disabled={!state.canStart}>開封をはじめる</Primary>,
        secondary: <Secondary onClick={ackResume}>参加者を確認する</Secondary>,
      }
      break
    case 'hostStart':
      layout = {
        title: '開封の準備ができたよ', sub: 'あなたが進行役 · ルームへようこそ', back: toLobby,
        stage: { caption: 'みんなを招いて開けよう' }, stats, note: 'オンラインの準備完了者が1人以上なら開始',
        card: (
          <RoomCard kicker="HOST" title="そろそろ始めよう" labelledBy="room-card-title" note="結果は約8秒後に同時公開">
            <p className="room-body">開始時にオンラインで準備完了の人だけが抽選に参加します。見守りは無料です。</p>
            {pitchChip}
            {hostJoin}
            {startReason && <p className="room-reason" role="status">{startReason}</p>}
            <button type="button" className="btn btn-outline btn-block" onClick={() => setScheduleSetup(true)} disabled={!state.canSchedule}>
              開始の時間を予約する<small>1・3・5・10分後・ピッチ用の設定</small>
            </button>
          </RoomCard>
        ),
        primary: <Primary onClick={start} disabled={!state.canStart}>{cooldownLabel ?? '開封をはじめる'}</Primary>,
        secondary: <Secondary onClick={() => setShare(true)}>招待リンクを共有</Secondary>,
      }
      break
    case 'hostSchedule':
      layout = {
        title: '開始を予約しよう', sub: 'あなたが進行役 · 会場の準備に合わせて', back: { onClick: () => setScheduleSetup(false) },
        stage: { caption: 'みんなを招いて開けよう', compact: true }, stats, note: '準備完了の人が1人以上いれば予約どおり始まります',
        card: (
          <RoomCard kicker="HOST" title="何分後に始める？" labelledBy="room-card-title" note="時刻になると、あなたがいなくても自動で始まります">
            {scheduleChoices(chosen, setMinutes)}
            <RoomSwitch label="ピッチ用：1人に目玉確定" description="オンの間は、毎回1人が必ず目玉を当てます。全員の画面に表示します。"
              checked={state.pitchMode} disabled={!state.canSetPitchMode} onChange={(on) => void controller.setPitchMode(on)} />
            {hostJoin}
          </RoomCard>
        ),
        primary: <Primary onClick={() => chosen && void schedule(chosen)} disabled={!state.canSchedule || chosen === null}>{chosen ? `${chosen}分後に開始を予約` : '予約できる時間がありません'}</Primary>,
        secondary: <Secondary onClick={start} disabled={!state.canStart}>今すぐ開始</Secondary>,
      }
      break
    case 'hostScheduled': {
      const at = timeOfDay(state.scheduledAt ?? '')
      const left = remainText(state.secondsToScheduled)
      layout = {
        title: `${at} に開始`, sub: `あと ${left} · あなたが進行役`, back: toLobby,
        stage: { caption: 'みんなを招いて開けよう', compact: true }, stats,
        note: `準備完了 ${state.readyOnline}人 · 開始の時点でオンラインの人が参加`,
        card: (
          <RoomCard kicker="予約中" title={`あと ${left} で開始`} labelledBy="room-card-title">
            {scheduleChoices(null, (value) => void schedule(value))}
            {pitchChip}
            <p className="room-body">変えたいときは時間を選び直してください。</p>
            {hostJoin}
          </RoomCard>
        ),
        primary: <Primary onClick={start} disabled={!state.canStart}>今すぐ開始</Primary>,
        secondary: <Secondary onClick={() => void schedule(null)} disabled={busy}>予約を取り消す</Secondary>,
      }
      break
    }
    case 'scheduleFailed': {
      const outcome = state.lastSchedule
      const at = outcome ? timeOfDay(outcome.scheduledAt) : ''
      const reason = outcome ? SCHEDULE_REASON[outcome.status] : ''
      const body = outcome?.status === 'nobody-ready'
        ? '予約の時刻に、オンラインで準備完了の人がいなかったので始めませんでした。コインは減っていません。'
        : `${state.scheduleNotice?.message ?? ''}コインは減っていません。`
      layout = {
        title: '開始できませんでした', sub: `${at} · ${reason}`, back: { onClick: () => controller.dismissScheduleNotice() },
        stage: { caption: 'みんなを招いて開けよう', compact: true }, stats, note: `準備完了 ${state.readyOnline}人`,
        card: (
          <RoomCard kicker="HOST" title="もう一度予約しよう" labelledBy="room-card-title">
            <p className="room-body" role="status">{body}</p>
            {scheduleChoices(chosen, setMinutes)}
          </RoomCard>
        ),
        primary: <Primary onClick={() => chosen && void schedule(chosen)} disabled={!state.canSchedule || chosen === null}>{chosen ? `${chosen}分後に開始を予約` : '予約できる時間がありません'}</Primary>,
        secondary: <Secondary onClick={() => setShare(true)}>招待リンクを共有</Secondary>,
      }
      break
    }
    case 'guestScheduled': {
      const at = timeOfDay(state.scheduledAt ?? '')
      const left = remainText(state.secondsToScheduled)
      layout = {
        title: `${at} に開始`, sub: `あと ${left} · ${title}`, back: toLobby,
        stage: { caption: 'みんなを招いて開けよう', compact: true }, stats,
        note: 'ホストがいなくても時刻になると始まります',
        card: (
          <RoomCard kicker="まもなく開始" title={`あと ${left} で開始`} labelledBy="room-card-title" note={self?.ready ? 'あなたは準備完了です' : undefined}>
            {pitchChip}
            <p className="room-body">開始の時点で「準備完了」の人が抽選に参加します。見守りは無料です。</p>
            {lowCoins}
          </RoomCard>
        ),
        primary: self?.ready
          ? <Primary onClick={() => ready(false)} disabled={!state.canReady}>準備を取り消す</Primary>
          : <Primary onClick={() => { setWatching(false); ready(true) }} disabled={!state.canReady}>準備完了にする</Primary>,
        secondary: <Secondary onClick={() => { if (self?.ready) ready(false); setWatching(true) }} disabled={busy}>見守るだけ</Secondary>,
      }
      break
    }
    case 'hostAway':
      layout = {
        title: 'ホストが離れています', sub: `${title} · ホストの戻り待ち`, back: toLobby,
        stage: { caption: 'みんなで待っているよ' }, stats, note: 'ホストの最終接続から45秒経過',
        card: (
          <RoomCard kicker="HOST AWAY" title="ホストの戻りを待っています" labelledBy="room-card-title" note="抽選参加の準備は保持されます">
            <p className="room-body">準備したまま待てます。予約した時刻になれば、ホストがいなくても始まります。</p>
          </RoomCard>
        ),
        primary: <Primary onClick={() => setHostAwayAck(true)}>ロビーで待つ</Primary>,
        secondary: <Secondary disabled={busy} onClick={() => { if (self?.ready) ready(false); setWatching(true); setHostAwayAck(true) }}>見守るだけにする</Secondary>,
      }
      break
    case 'ready':
      layout = {
        title: '準備できたよ', sub: `${title} · 開始待ち`, back: toLobby,
        stage: { caption: 'みんなの準備を待とう' }, stats, note: '抽選は開始時に確定します',
        card: (
          <RoomCard kicker="READY" title="あなたも準備完了です" labelledBy="room-card-title" note="見守る友だちには請求されません">
            <p className="room-body">開始時に500デモコインを使います。開始前なら準備を取り消せます。</p>
            {pitchChip}
          </RoomCard>
        ),
        primary: <Primary onClick={() => ready(false)} disabled={!state.canReady}>準備を取り消す</Primary>,
        secondary: <DockNote>ホストが開始するまで待つ</DockNote>,
      }
      break
    case 'watching':
      layout = {
        title: '見守り中です', sub: `${title} · ${state.seats.taken}人が集まっています`, back: toLobby,
        stage: { caption: '友だちを応援しよう' }, stats, note: '抽選には参加していません',
        card: (
          <RoomCard kicker="WATCHING" title="一緒に見届けよう" labelledBy="room-card-title" note="見守りは無料">
            <p className="room-body">コインは使いません。開始前なら抽選参加へ切り替えて、みんなと開封できます。</p>
            {pitchChip}
            {lowCoins}
          </RoomCard>
        ),
        primary: <Primary onClick={() => { setWatching(false); ready(true) }} disabled={!state.canReady}>{cooldownLabel ?? '抽選に参加する'}</Primary>,
        secondary: <Secondary onClick={() => void leave()} disabled={busy}>ルームを出る</Secondary>,
      }
      break
    default: {
      const others = Math.max(0, state.seats.taken - 1)
      layout = {
        title: 'みんなの開封ルーム', sub: `${title} · ${state.seats.taken}人が集まっています`, back: toLobby,
        stage: { caption: '街の開封広場で待とう' }, stats,
        note: others > 0 ? `ほか${others}人も一緒に待っています` : '招待した友だちを待っています',
        card: (
          <RoomCard kicker="CHOOSE" title="今日はどう楽しむ？" labelledBy="room-card-title" note="開始前なら選び直せます">
            <p className="room-body">抽選参加は500デモコイン。見守りは無料で、みんなと同時に開封を見られます。</p>
            {pitchChip}
            {lowCoins}
          </RoomCard>
        ),
        primary: <Primary onClick={() => { setWatching(false); ready(true) }} disabled={!state.canReady}>{cooldownLabel ?? '抽選に参加する'}</Primary>,
        secondary: <Secondary onClick={() => setWatching(true)}>見守るだけ</Secondary>,
      }
    }
  }

  // 名前の変更はロビーの画面から（開封中・結果・復帰の案内では出さない）
  const showRename = inRoom && self !== null && state.canRename && ['lobby', 'watching', 'ready', 'guestScheduled', 'hostStart', 'hostSchedule', 'hostScheduled'].includes(view)
  if (connecting && !waitedLong) return <div className="screen room-screen" aria-busy="true" />
  return (
    <>
      <RoomFrame layout={layout} demo={demo} faces={view === 'invite' || view.startsWith('name') || view === 'full' ? [] : faces}>
        {showRename && renameLine}
        {!view.startsWith('name') && errorLine}
      </RoomFrame>
      {share && snapshot && (
        <Sheet title="招待リンクを共有" onClose={() => setShare(false)}>
          <InviteShare invite={snapshot.invite} demo={demo} />
          {state.isHost && state.hostKey && <HostLinkPanel hostKey={state.hostKey} />}
        </Sheet>
      )}
    </>
  )
}

/**
 * ルームを作る（#/room/new と、ホスト用リンクで開いているルームがないとき）。マスターにこの画面はない（Figma 修正待ち）。
 * ルームを作れるのはホスト用キーを持つ人だけ（F10）。端末内デモでは、この端末をデモのホストにして作れる。
 */
export function RoomCreate({ hostKey = null }: { hostKey?: string | null }) {
  const session = useRoomSession()
  const { controller, records, demo, makeDemoHostKey } = session
  const state = useRoomState(session)
  const { state: app } = useApp()
  const [name, setName] = useState(app.nickname === 'あなた' ? '' : app.nickname)
  const [error, setError] = useState('')
  const busy = state.busy !== null
  const key = hostKey ?? state.hostKey
  const canCreate = key !== null || makeDemoHostKey !== null
  const submit = async () => {
    const problem = nameProblem(name)
    if (problem) { setError(problem); return }
    setError('')
    const result = await controller.createAsHost(key ?? makeDemoHostKey?.() ?? null, name.replace(/\s+/g, ' ').trim())
    const snap = controller.getState().snapshot
    if (!result.ok || !snap) { setError(result.error?.message ?? ''); return }
    writeRecord(records, snap.invite, { roomId: snap.id })
    navigate(paths.room(snap.invite))
  }
  const current = state.snapshot && state.phase !== 'unavailable' ? state.snapshot : null
  return (
    <div className="screen room-screen">
      <RoomHeader title="ルームを作る" sub={canCreate ? 'あなたが進行役（ホスト）になります' : 'ホスト用リンクを持つ人が作ります'} back={{ href: paths.gachaList }} />
      <main className="content room-content">
        <DemoLine demo={demo} />
        <RoomStage caption="みんなを招いて開けよう" />
        {canCreate ? (
          <RoomCard kicker="HOST" title="どんな名前で始める？" labelledBy="room-create-title" note="見守る人はコインを使いません">
            <p className="room-body room-create-lead">
              ルームを作ると、招待リンクを送れます。みんなで同じ時刻に開封します。中身は説明用のマスコット・ポーチ・缶バッジで、抽選は1回500デモコイン（入った人それぞれに3,000デモコイン）です。
            </p>
            {key === null && <p className="room-reason">デモ：この端末をホストにして作ります。ホスト用リンクは、この端末のブラウザの中だけで使えます。</p>}
            <RoomNameForm id="room-create" value={name} onChange={setName} busy={busy} error={error} onSubmit={() => void submit()} />
          </RoomCard>
        ) : (
          <RoomCard kicker="HOST" title="ルームを作れるのはホストだけです" labelledBy="room-create-title" note="招待リンクから参加できます">
            <p className="room-body room-create-lead">
              ルームは、ホスト用リンクを持つ担当者が作ります。招待リンクを受け取ったら、そのリンクを開くと参加できます。
            </p>
          </RoomCard>
        )}
        {current && <a className="btn btn-outline btn-block" href={paths.room(current.invite)}>いまのルームに戻る</a>}
        <MockNotice />
      </main>
      <div className="sticky-actions room-dock">
        {canCreate
          ? <Primary form="room-create" disabled={busy}>{busy ? '接続しています…' : 'ルームを作る'}</Primary>
          : <a className="btn btn-main btn-block" href={paths.gachaList}>ガチャのお店へ</a>}
        <SecondaryLink href={canCreate ? paths.gachaList : paths.town}>{canCreate ? 'やめる' : '街へ戻る'}</SecondaryLink>
      </div>
    </div>
  )
}

type HostLinkStatus = 'checking' | 'create' | 'invalid' | 'limited' | 'offline'
/** アドレスバーから消したキー（このページを開いている間だけ）。キーのない #/host で開き直したときだけ使う。 */
let linkKey: string | null = null

/**
 * ホスト用リンク（#/host/<key>、F10）。キーはこの端末に保存し、アドレスバーからは消す。
 * 開いているルームがあればホストとして戻り（267:9678）、なければ作る。キーが違えば「ホスト用リンクが無効」（292:2703）。
 */
export function HostLink({ hostKey }: { hostKey: string | null }) {
  const session = useRoomSession()
  const { controller, records, demo } = session
  const [status, setStatus] = useState<HostLinkStatus>('checking')
  const [key] = useState(() => hostKey ?? linkKey)
  const started = useRef(false)
  const waitedLong = useDelayed(status === 'checking', LOADING_DELAY)

  const check = async () => {
    setStatus('checking')
    const result = await controller.resumeHost(key)
    if (result.ok) {
      const snap = controller.getState().snapshot
      if (snap) {
        writeRecord(records, snap.invite, { roomId: snap.id, viaHostLink: true })
        navigate(paths.room(snap.invite))
      }
      return
    }
    if (!result.error) return
    const code = result.error.code
    setStatus(code === 'no-room' ? 'create' : code === 'too-many-attempts' ? 'limited' : code === 'host-key-invalid' ? 'invalid' : 'offline')
  }

  useEffect(() => {
    if (started.current) return
    started.current = true
    // 秘密のキーを履歴・画面共有に残さない（この端末の保存にだけ残す）
    if (hostKey !== null) linkKey = hostKey
    if (hostKey !== null) window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/host`)
    void check()
  })

  if (status === 'checking' && !waitedLong) return <div className="screen room-screen" aria-busy="true" />
  if (status === 'create') return <RoomCreate hostKey={key ?? controller.getState().hostKey} />
  const checking = status === 'checking' || status === 'offline'
  const layout: Layout = checking ? {
    title: '接続を確認しています', sub: 'ホスト用リンク · 確認中', back: { href: paths.town },
    stage: { caption: 'すぐに戻るね' },
    stats: [{ label: 'ルームの状態', value: '確認中', plain: true }, { label: 'ホスト', value: '確認中', plain: true }],
    note: 'ホスト用リンクを確かめています',
    card: (
      <RoomCard kicker="HOST LINK" title="ホスト用リンクを確認中" labelledBy="room-card-title" note="参加者の席や結果は変わりません">
        <p className="room-body">{status === 'offline' ? '接続できませんでした。通信を確認して、もう一度お試しください。' : 'ホスト用リンクを確かめて、あなたのルームへ戻ります。'}</p>
      </RoomCard>
    ),
    primary: <Primary onClick={() => void check()} disabled={status === 'checking'}>再接続する</Primary>,
    secondary: <DockNote>通信が戻るまで待つ</DockNote>,
  } : {
    title: 'ホスト用リンクが無効です', sub: 'ラストピースの開封ルーム', back: { href: paths.town },
    stage: { caption: 'いっしょに開けよう' },
    stats: [{ label: 'ルームの状態', value: '確認できません', plain: true }, { label: 'ホスト', value: 'なれません', plain: true }],
    note: 'ホストになれるのはホスト用リンクを持つ人だけです',
    card: (
      <RoomCard kicker="HOST LINK" title="ホストにはなれません" labelledBy="room-card-title" note="ルームは作られていません">
        <p className="room-body">
          {status === 'limited' ? errorMessage(new RoomContractError('too-many-attempts')) : 'リンクが古いか、キーが違います。参加する場合は招待リンクを開いてください。'}
        </p>
      </RoomCard>
    ),
    primary: <a className="btn btn-main btn-block" href={paths.town}>街へ戻る</a>,
    secondary: <DockNote>招待リンクを開き直す</DockNote>,
  }
  return <RoomFrame layout={layout} demo={demo} faces={[]} />
}
