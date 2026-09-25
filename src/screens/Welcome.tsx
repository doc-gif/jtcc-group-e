import { useState, type FormEvent } from 'react'
import { asset, useApp } from '../app/appContext'
import { navigate, paths } from '../app/router'
import { pipiLines } from '../copy/pipi'
import { completeWelcome, NICKNAME_MAX, STARTER_COINS } from '../domain/game'
import { coinText } from '../domain/odds'
import { MockNotice } from '../components/Chrome'
import { Pipi } from '../components/Pipi'

export function Welcome() {
  const { state, update } = useApp()
  const [name, setName] = useState(state.nickname === 'あなた' ? '' : state.nickname)
  const [error, setError] = useState('')
  const start = (event: FormEvent) => {
    event.preventDefault()
    const result = completeWelcome(state, name)
    if (!result.ok) { setError(result.message); return }
    update(() => result.state)
    navigate(paths.home)
  }
  return (
    <div className="screen welcome-screen">
      <main className="content">
        <img className="welcome-logo" src={asset('assets/logo/logo.png')} alt="" width="120" height="120" />
        <h1 id="page-title" tabIndex={-1}>ラストピース<small lang="en">LAST PIECE</small></h1>
        <p className="lead welcome-lead">即完売で買えなかった限定グッズを、JTCC が買い取り・検品。確率を公開したガチャで、コレクションに足りない「最後の一点」を友達といっしょに引き当てます。</p>
        <Pipi text={pipiLines.welcome} />
        <form className="name-form" onSubmit={start} noValidate>
          <label htmlFor="welcome-name">ニックネーム（ルームで友達に見えます・{NICKNAME_MAX}文字まで）</label>
          <input id="welcome-name" value={name} onChange={(event) => setName(event.target.value)} aria-invalid={error ? true : undefined} aria-describedby={error ? 'welcome-error' : undefined} autoComplete="nickname" />
          {error && <p id="welcome-error" className="field-error">{error}</p>}
          <button type="submit" className="btn btn-main btn-block">はじめる</button>
        </form>
        <ul className="fine-list">
          <li>体験用に {coinText(STARTER_COINS)} コインが入っています（1コイン＝1円・デモ）。</li>
          <li>ホーム画面に追加すると、アプリのように全画面で開けます（共有メニューの「ホーム画面に追加」）。</li>
        </ul>
        <MockNotice />
      </main>
    </div>
  )
}
