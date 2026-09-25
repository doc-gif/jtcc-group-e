import { paths } from '../app/router'
import { BackBar } from '../components/Chrome'

export function NotFound() {
  return (
    <div className="screen">
      <BackBar title="ページが見つかりません" back={paths.home} backLabel="一覧へ" />
      <main className="content">
        <p className="lead notfound-lead">リンクが古いか、ガチャが終了した可能性があります。</p>
        <a className="btn btn-main" href={paths.home}>ガチャの一覧へ</a>
      </main>
    </div>
  )
}
