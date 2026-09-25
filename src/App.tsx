import './App.css'

function App() {
  return (
    <main className="app-shell">
      <header className="app-header">
        <span className="brand-mark" aria-hidden="true">J</span>
        <span className="brand-name">JTCC Group E</span>
      </header>

      <section className="welcome" aria-labelledby="welcome-title">
        <p className="eyebrow">プロジェクトの準備ができました</p>
        <h1 id="welcome-title">これから、<br />使いやすいアプリを。</h1>
        <p className="intro">
          スマートフォンを中心に考えた Web アプリの土台です。
          まずは作りたい体験と、最初に必要な機能を決めましょう。
        </p>
      </section>

      <section className="next-steps" aria-labelledby="next-title">
        <h2 id="next-title">次に決めること</h2>
        <ol>
          <li><span className="step-number">01</span><span>誰が使うアプリか</span></li>
          <li><span className="step-number">02</span><span>何を解決するか</span></li>
          <li><span className="step-number">03</span><span>最初に作る機能は何か</span></li>
        </ol>
      </section>

      <footer className="app-footer">JTCC Group E</footer>
    </main>
  )
}

export default App
