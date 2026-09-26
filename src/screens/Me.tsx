import { useState, type FormEvent } from 'react'
import { asset, useApp } from '../app/appContext'
import { addDemoCoins, COIN_PACKS, createInitialState, NICKNAME_MAX, setForceFeatured, setNickname, toggleSetting } from '../domain/game'
import { coinText, EXCHANGE_RATE } from '../domain/odds'
import { MockNotice, SaveWarning, TabBar, TopBar } from '../components/Chrome'

export function Me() {
  const { state, update } = useApp()
  const [name, setName] = useState(state.nickname)
  const [nameError, setNameError] = useState('')
  const [notice, setNotice] = useState('')
  const [confirmReset, setConfirmReset] = useState(false)

  const saveName = (event: FormEvent) => {
    event.preventDefault()
    const result = setNickname(state, name)
    if (!result.ok) { setNameError(result.message); return }
    setNameError('')
    update((current) => ({ ...current, nickname: result.state.nickname }))
    setNotice(`ニックネームを「${result.state.nickname}」にしました`)
  }

  return (
    <div className="screen">
      <TopBar title="マイページ" sub="MY PAGE" />
      <main className="content">
        <p className="lead mypage-lead">コインの残高と、名前・きまり・デモ操作をまとめています。</p>
        {notice && <p className="toast" role="status">{notice}</p>}
        <section className="panel coin-panel" aria-labelledby="coin-title">
          <h2 id="coin-title"><img src={asset('assets/icons/coin.png')} alt="" width="28" height="28" />コイン残高</h2>
          <p className="coin-big">{coinText(state.coins)}<small>コイン</small></p>
          <p className="fine">1コイン＝1円。デモ版では決済をせずに増えます。</p>
          <div className="packs">
            {COIN_PACKS.map((amount) => (
              <button key={amount} type="button" className="btn btn-outline" onClick={() => { update((current) => addDemoCoins(current, amount)); setNotice(`${coinText(amount)}コインを追加しました（デモ）`) }}>
                +{coinText(amount)}<small>¥{coinText(amount)}相当</small>
              </button>
            ))}
          </div>
        </section>
        <section className="panel" aria-labelledby="name-title">
          <h2 id="name-title">ニックネーム</h2>
          <form className="name-form" onSubmit={saveName} noValidate>
            <label htmlFor="nickname">ルームで友達に見える名前（{NICKNAME_MAX}文字まで）</label>
            <div className="name-row">
              <input id="nickname" value={name} onChange={(event) => setName(event.target.value)} aria-invalid={nameError ? true : undefined} aria-describedby={nameError ? 'nickname-error' : undefined} autoComplete="nickname" />
              <button type="submit" className="btn btn-main">保存</button>
            </div>
            {nameError && <p id="nickname-error" className="field-error">{nameError}</p>}
          </form>
        </section>
        <section className="panel" aria-labelledby="sound-title">
          <h2 id="sound-title">声と音</h2>
          <button type="button" className="switch-row" aria-pressed={state.voiceOn} onClick={() => update((current) => toggleSetting(current, 'voiceOn'))}>
            <span>ピピの声（読み上げ）</span><b>{state.voiceOn ? 'ON' : 'OFF'}</b>
          </button>
          <button type="button" className="switch-row" aria-pressed={state.soundOn} onClick={() => update((current) => toggleSetting(current, 'soundOn'))}>
            <span>チャイムと振動</span><b>{state.soundOn ? 'ON' : 'OFF'}</b>
          </button>
          <p className="fine">音は最初は鳴りません。ON にすると、回すたびに鳴ります。</p>
        </section>
        <section className="panel" aria-labelledby="info-title">
          <h2 id="info-title">お知らせ</h2>
          <ul className="fine-list">
            <li>新しいガチャは、JTCC の買取と検品が終わりしだい追加します（デモ）。</li>
          </ul>
          <details><summary>手元のグッズを売りたいとき</summary><p>アプリに「売る」機能はありません。手元の現物は、提携店舗の買取窓口へお持ちください（提携店舗の検索は次のフェーズで作ります）。</p></details>
        </section>
        <section className="panel" aria-labelledby="rules-title">
          <h2 id="rules-title">きまり</h2>
          <details><summary>確率の表示について</summary><p>中身ごとの確率は、いまの残りの数から計算した値をそのまま表示します。残りの数そのものは表示せず、全体の残りをバーと言葉で示します。</p></details>
          <details><summary>コインについて</summary><p>当たった物は参考価格の一律{Math.round(EXCHANGE_RATE * 100)}%のコインに交換できます。コインはアプリの中だけで使え、出金はできません。</p></details>
          <details><summary>取り扱い商品のルール</summary><p>発売から90日以内の商品は扱わない方針です（転売の助長を避けるため）。</p></details>
          <details>
            <summary>アクセス解析と外部送信について</summary>
            <p>使われ方を知って改善するため、公開版では、次の2つのサービスに情報を送信します。広告には使いません。</p>
            <p>Google アナリティクス 4（Google LLC）：Cookie などの識別子、開いた画面、操作の種類（はじめる・回す・ルームに入る など）、端末・ブラウザの種類。招待コードとホスト用のキーは画面の場所から取り除いて送ります。</p>
            <p>Microsoft Clarity（Microsoft Corporation）：Cookie などの識別子、画面上の操作（タップ・スクロールなど）の記録、端末・ブラウザの種類。ニックネームと入力した内容は記録の中で隠します。招待やホスト用の画面と、そこへ移った後は記録しません。</p>
            <p>ニックネーム・入力した内容・招待コード・ホスト用のキーは送信しません。確認用のプレビューと開発中の環境からも送信しません。</p>
            <p>止めたいときは、ブラウザの Cookie の削除やトラッキング防止の機能を使ってください。Google アナリティクスは<a href="https://tools.google.com/dlpage/gaoptout?hl=ja">オプトアウト アドオン</a>でも止められます。Clarity の扱いは<a href="https://privacy.microsoft.com/ja-jp/privacystatement">Microsoft のプライバシーに関する声明</a>をご覧ください。アドレスの最後に ?internal=1 を付けて開くと、その端末からは送信しなくなります（?internal=0 で元に戻ります）。</p>
          </details>
          <details><summary>特定商取引法・資金決済法に基づく表示</summary><p>提案モックのため未作成です。正式なサービスでは必ず掲載します。</p></details>
        </section>
        <section className="panel" aria-labelledby="demo-title">
          <h2 id="demo-title">デモ操作（審査用）</h2>
          <button type="button" className="switch-row" aria-pressed={state.forceFeaturedNext} onClick={() => update((current) => setForceFeatured(current, !current.forceFeaturedNext))}>
            <span>次の1回を目玉確定にする</span><b>{state.forceFeaturedNext ? 'ON' : 'OFF'}</b>
          </button>
          {!confirmReset ? (
            <button type="button" className="btn btn-outline btn-block" onClick={() => setConfirmReset(true)}>データを最初に戻す</button>
          ) : (
            <div className="confirm-box" role="group" aria-labelledby="reset-q">
              <p id="reset-q">コイン・当てたもの・残りをすべて最初に戻します。よろしいですか？</p>
              <div className="sticky-row">
                <button type="button" className="btn btn-text" onClick={() => setConfirmReset(false)}>やめる</button>
                <button type="button" className="btn btn-main" onClick={() => { const fresh = createInitialState(); update(() => fresh); setName(fresh.nickname); setConfirmReset(false); setNotice('データを最初に戻しました') }}>最初に戻す</button>
              </div>
            </div>
          )}
        </section>
        <SaveWarning />
        <MockNotice />
      </main>
      <TabBar />
    </div>
  )
}
