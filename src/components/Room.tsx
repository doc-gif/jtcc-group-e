import { useId, useState, type FormEvent, type ReactNode } from 'react'
import { inviteUrl } from '../app/sharedRoom'
import { hostLinkHash } from '../realtime/hostKey'
import type { ShownPhoto } from '../app/pitchPhotos'
import { PRIZE_ART, prizeName } from '../app/roomView'
import { NICKNAME_MAX } from '../domain/game'
import type { ScheduleMinutes, SharedPrize } from '../realtime/protocol'
import { glowLabel } from '../domain/odds'
import { GoodsImage } from './Goods'
import { Machine } from './Machine'

/*
 * 共有ルーム（デザインマスター T10）の部品。画面の組み立ては src/screens/Room.tsx。
 * 色は src/index.css のトークン（淡いミントは --mint。未定義の間は --soft）と共通のボタンクラスだけを使う。
 */

export type StageVariant = 'gift' | 'sparkle' | 'countdown' | 'open' | 'prize' | 'closed'

/**
 * ピッチ用の実物グッズ写真（F15。マスター 267:9379 の Prize hero と同じ位置）。
 * 読み込めない・表示できないときは元の絵（public/assets/goods のオリジナル）に戻す。alt は賞品の名前。
 */
function PrizePicture({ prize, photo, onBroken }: { prize: SharedPrize; photo: ShownPhoto | null; onBroken: (url: string) => void }) {
  const art = PRIZE_ART[prize]
  if (!photo) return <GoodsImage art={art.art} glow={art.glow} size="lg" />
  return (
    <span className={`goods goods-lg goods-photo glow-${art.glow}`}>
      <img src={photo.url} alt={prizeName(prize)} onError={() => onBroken(photo.url)} />
      {art.glow !== 'normal' && <span className="visually-hidden">（{glowLabel[art.glow]}）</span>}
    </span>
  )
}

/** 集まっている人の賑やかさ（マスターの部品「T10 / Room crowd」の 1〜3人・4〜9人・10人〜）。 */
type CrowdLevel = 'few' | 'some' | 'lively'

function crowdLevel(count: number): CrowdLevel {
  return count <= 3 ? 'few' : count <= 9 ? 'some' : 'lively'
}

/** 並べる人数と吹き出しの数。10人〜は並ばない人を「+N」で出す。 */
const CROWD: Record<CrowdLevel, { faces: number; cheers: number }> = {
  few: { faces: 3, cheers: 1 },
  some: { faces: 6, cheers: 2 },
  lively: { faces: 10, cheers: 3 },
}

/** 吹き出しの言葉。待っている間・秒読み・開いた後で変える（マスター T10 と同じ）。 */
const CHEERS: Record<'wait' | 'countdown' | 'joy', readonly string[]> = {
  wait: ['わくわく', 'まだかな？', '楽しみ！'],
  countdown: ['せーの！', 'ドキドキ', 'いくよ〜'],
  joy: ['やったー！', '見せて！', 'おめでとう'],
}

/** 集まっている人（名前の頭文字）と吹き出し。人数は下の「集まっている人 N人」で伝えるので、ここは飾りとして読み上げない。 */
function RoomCrowd({ names, count, variant }: { names: string[]; count: number; variant: StageVariant }) {
  const level = crowdLevel(count)
  const shown = names.slice(0, CROWD[level].faces)
  const more = count - shown.length
  const mood = variant === 'countdown' ? 'countdown' : variant === 'gift' || variant === 'closed' ? 'wait' : 'joy'
  return (
    <div className="room-crowd" aria-hidden="true" data-clarity-mask="true">
      {CHEERS[mood].slice(0, CROWD[level].cheers).map((cheer, index) => <span key={cheer} className={`room-cheer c${index + 1}`}>{cheer}</span>)}
      <ul className="room-faces">
        {shown.map((face, index) => <li key={index} className={`face f${index + 1}`}>{face}</li>)}
        {level === 'lively' && more > 0 && <li className="face-more">+{more}</li>}
      </ul>
    </div>
  )
}

/**
 * 舞台の絵（マスター T10 の「Opening stage」）。家並みはコードの SVG、真ん中はガチャ筐体（部品 267:10520 と同じ Machine）。
 * 集まっている人数（state.seats.taken）で crowd-few / crowd-some / crowd-lively を付け、並ぶ人と吹き出しを増やす。
 */
export function RoomStage({ caption, variant = 'gift', faces = [], crowd = 0, countdown, prize, photo = null, compact = false }: {
  caption: string
  variant?: StageVariant
  /** 集まっている人の頭文字（最大10人）。空ならルームの外の画面として人を出さない。 */
  faces?: string[]
  /** 集まっている人数（state.seats.taken）。 */
  crowd?: number
  countdown?: string
  prize?: SharedPrize | null
  /** ルームの中で読み込めた実物グッズ写真（F15）。null なら元の絵。 */
  photo?: ShownPhoto | null
  compact?: boolean
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const shown = photo && failedUrl !== photo.url ? photo : null
  const people = faces.length > 0 ? Math.max(crowd, faces.length) : 0
  return (
    <figure className={`room-stage stage-${variant}${people > 0 ? ` crowd-${crowdLevel(people)}` : ''}${compact ? ' is-compact' : ''}`}>
      <figcaption className="room-stage-caption">
        <span className="stage-flower is-left" aria-hidden="true" />
        {caption}
        <span className="stage-flower is-right" aria-hidden="true" />
      </figcaption>
      <div className="room-stage-body">
        <svg className="room-stage-art" viewBox="0 0 340 170" aria-hidden="true" focusable="false">
          <ellipse cx="170" cy="150" rx="120" ry="14" className="stage-shadow" />
          <g className="stage-house">
            <rect x="18" y="62" width="58" height="52" rx="8" className="house-wall" />
            <rect x="12" y="52" width="70" height="16" rx="8" className="house-roof" />
            <rect x="40" y="84" width="14" height="30" rx="7" className="house-door" />
          </g>
          <g className="stage-house">
            <rect x="264" y="62" width="58" height="52" rx="8" className="house-wall" />
            <rect x="258" y="52" width="70" height="16" rx="8" className="house-roof" />
            <rect x="286" y="84" width="14" height="30" rx="7" className="house-door" />
          </g>
          {variant !== 'countdown' && <circle cx="170" cy="76" r="64" className="stage-halo" />}
          {variant === 'open' && (
            <g className="stage-capsule">
              <path d="M244 30a18 18 0 0 1 36 0z" className="capsule-top" />
              <path d="M244 38a18 18 0 0 0 36 0z" className="capsule-bottom" />
            </g>
          )}
        </svg>
        {variant !== 'countdown' && <div className="room-machine" aria-hidden="true"><Machine /></div>}
        {variant === 'countdown' && (
          <p className="room-countdown" role="timer" aria-live="off">
            <span className="visually-hidden">開封まで</span>{countdown}
          </p>
        )}
        {variant === 'open' && <p className="room-pop" aria-hidden="true">ぱかっ！</p>}
        {(variant === 'sparkle' || variant === 'open') && <p className="room-sparkles" aria-hidden="true">✦ ✦ ✦</p>}
        {variant === 'prize' && prize && (
          <div className="room-prize-card">
            <PrizePicture prize={prize} photo={shown} onBroken={setFailedUrl} />
            <span>今日のピース</span>
          </div>
        )}
        {people > 0 && <RoomCrowd names={faces} count={people} variant={variant} />}
      </div>
      {variant === 'prize' && prize && shown && <p className="fine room-photo-credit">{shown.credit}</p>}
    </figure>
  )
}

/** plain: 数ではない値（「入室後に表示」など）は大きくしない。 */
export interface RoomStat { label: string; value: string; plain?: boolean }

/** 「集まっている人 N人」と「抽選の準備」。上限（内部の 100 人）は出さない。 */
export function RoomStats({ items }: { items: [RoomStat, RoomStat] }) {
  return (
    <dl className="room-stats">
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd className={item.plain ? 'is-plain' : undefined}>{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** 見出しの小札（CHOOSE・READY など）と説明、下の淡いミントの一言。 */
/** privateTitle: 見出しにニックネームを含むとき、録画（Clarity）で隠す。 */
export function RoomCard({ kicker, title, children, note, labelledBy, privateTitle = false }: {
  kicker: string; title: string; children?: ReactNode; note?: ReactNode; labelledBy: string; privateTitle?: boolean
}) {
  return (
    <section className="room-card" aria-labelledby={labelledBy}>
      <p className="room-kicker" lang={/^[A-Z ]+$/.test(kicker) ? 'en' : undefined}>{kicker}</p>
      <h2 id={labelledBy} className="room-card-title" data-clarity-mask={privateTitle ? 'true' : undefined}>{title}</h2>
      {children}
      {note && <p className="room-note">{note}</p>}
    </section>
  )
}

/** ピッチ用デモの明示。確定枠を使ったラウンドでは全員に出す（PRODUCT.md）。 */
export function PitchLabel({ children }: { children: ReactNode }) {
  return <p className="room-pitch">{children}</p>
}

export const PITCH_ROUND_TEXT = 'ピッチ用デモ：このラウンドは1人に目玉確定（確率表示の対象外）'
export const PITCH_ROOM_TEXT = 'ピッチ用：このルームは毎回1人に目玉確定'

/** 1・3・5・10分後。ルームの期限に間に合わない時間は選べない。 */
export function ScheduleChoices({ options, selected, onSelect, disabled, legend }: {
  options: readonly ScheduleMinutes[]; selected: ScheduleMinutes | null; onSelect: (minutes: ScheduleMinutes) => void; disabled?: boolean; legend: string
}) {
  const all: ScheduleMinutes[] = [1, 3, 5, 10]
  return (
    <fieldset className="room-minutes">
      <legend className="visually-hidden">{legend}</legend>
      {all.map((minutes) => (
        <button key={minutes} type="button" className="room-minute" aria-pressed={selected === minutes}
          disabled={disabled || !options.includes(minutes)} onClick={() => onSelect(minutes)}>
          {minutes}分後
        </button>
      ))}
    </fieldset>
  )
}

/** マスターのトグル（ピッチ用の切り替え）と同じ形のスイッチ。 */
export function RoomSwitch({ label, description, checked, onChange, disabled }: {
  label: string; description: string; checked: boolean; onChange: (next: boolean) => void; disabled?: boolean
}) {
  const id = useId()
  return (
    <div className="room-switch">
      <div className="room-switch-text">
        <label htmlFor={id}>{label}</label>
        <p id={`${id}-desc`}>{description}</p>
      </div>
      <input id={id} type="checkbox" role="switch" checked={checked} disabled={disabled} aria-describedby={`${id}-desc`}
        onChange={(event) => onChange(event.target.checked)} />
    </div>
  )
}

/**
 * 表示する名前の入力（マスター 298:2709・298:2867）。送信ボタンは画面下の操作欄に置き、form 属性でつなぐ。
 */
export function RoomNameForm({ id, value, onChange, busy, error, onSubmit }: {
  id: string; value: string; onChange: (value: string) => void; busy: boolean; error: string; onSubmit: () => void
}) {
  const submit = (event: FormEvent) => {
    event.preventDefault()
    onSubmit()
  }
  return (
    <form id={id} className="name-form room-name-form" onSubmit={submit} noValidate>
      <label htmlFor={`${id}-input`}>表示する名前</label>
      <input id={`${id}-input`} data-clarity-mask="true" value={value} onChange={(event) => onChange(event.target.value)} autoComplete="nickname" placeholder="例：もも"
        aria-invalid={error ? true : undefined} aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`} disabled={busy} />
      <p id={`${id}-hint`} className="room-hint">{NICKNAME_MAX}文字まで。ほかの人と同じ名前は使えません。</p>
      {error && <p id={`${id}-error`} className="field-error" role="alert" data-clarity-mask="true">{error}</p>}
    </form>
  )
}

/** 招待リンクの共有（LINE・コピー）。端末内デモでは、別のスマホとはつながらないことを書く。 */
export function InviteShare({ invite, demo }: { invite: string; demo: boolean }) {
  const [copied, setCopied] = useState<'idle' | 'done' | 'failed'>('idle')
  const url = inviteUrl(invite)
  const text = `いっしょに開けよう♡ ラストピースの開封ルーム\n${url}`
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
      <p className="sheet-lead">このリンクを受け取った人だけが入れます。ルームは作ってから2時間使えます。</p>
      <div className="share-row">
        <a className="btn btn-line" href={`https://line.me/R/msg/text/?${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer">LINEで送る</a>
        <button type="button" className="btn btn-outline" onClick={copy}>リンクをコピー</button>
      </div>
      <p className="fine" role="status">
        {copied === 'done' ? 'コピーしました。' : copied === 'failed' ? 'コピーできませんでした。下のリンクを長押ししてコピーしてください。' : ''}
      </p>
      <p className="invite-url">{url}</p>
      {demo && (
        <p className="fine">
          デモ：このルームはこの端末のブラウザの中だけにあります。同じブラウザの別のタブで開くと、別の参加者として試せます。別のスマホとはつながりません。
        </p>
      )}
    </>
  )
}

/** ホスト用リンク（ホストだけ）。別の端末で開くとホストとして戻れる。人には送らない。 */
export function HostLinkPanel({ hostKey }: { hostKey: string }) {
  const [copied, setCopied] = useState<'idle' | 'done' | 'failed'>('idle')
  const url = `${window.location.href.split('#')[0]}${hostLinkHash(hostKey)}`
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied('done')
    } catch {
      setCopied('failed')
    }
  }
  return (
    <section className="room-hostlink" aria-labelledby="room-hostlink-title">
      <h3 id="room-hostlink-title">ホスト用リンク（あなただけ）</h3>
      <p className="fine">別の端末で開くと、ホストとして戻れます。参加者には送らないでください。</p>
      <button type="button" className="btn btn-outline btn-block" onClick={copy}>ホスト用リンクをコピー</button>
      <p className="fine" role="status">
        {copied === 'done' ? 'コピーしました。' : copied === 'failed' ? 'コピーできませんでした。' : ''}
      </p>
    </section>
  )
}

/** みんなの結果の1行。自分の行は淡いミントで、文字でも「あなた」と示す。 */
export function ResultRow({ nickname, prize, self }: { nickname: string; prize: SharedPrize; self: boolean }) {
  return (
    <li className={`room-result${self ? ' is-self' : ''}`}>
      <span className={`room-result-mark mark-${prize}`} aria-hidden="true">{self ? '♥' : PRIZE_ART[prize].mark}</span>
      <span data-clarity-mask="true">{self ? 'あなた' : nickname}<span aria-hidden="true">  ·  </span><span className="visually-hidden">：</span>{prizeName(prize)}</span>
    </li>
  )
}
