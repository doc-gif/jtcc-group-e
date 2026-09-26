import { useEffect } from 'react'
import './App.css'
import { AppProvider } from './app/AppProvider'
import type { AssetGate } from './app/assets'
import { useRoute, type Route } from './app/router'
import { townAssets } from './app/townAssets'
import { Collection } from './screens/Collection'
import { FriendItem, FriendShelf } from './screens/Friend'
import { GachaDetail } from './screens/GachaDetail'
import { GachaList } from './screens/GachaList'
import { GachaOdds } from './screens/GachaOdds'
import { Me } from './screens/Me'
import { NotFound } from './screens/NotFound'
import { Room } from './screens/Room'
import { Shelf, ShelfItemScreen, ShelfShare } from './screens/Shelf'
import { Spin } from './screens/Spin'
import { Together } from './screens/Together'
import { Town } from './screens/Town'
import { Welcome } from './screens/Welcome'

function Screen({ route, assets }: { route: Route; assets: AssetGate }) {
  switch (route.name) {
    case 'town': return <Town assets={assets} />
    case 'gachaList': return <GachaList />
    case 'gacha': return <GachaDetail id={route.id} room={route.room} />
    case 'welcome': return <Welcome />
    case 'odds': return <GachaOdds id={route.id} />
    case 'spin': return <Spin id={route.id} mode="solo" />
    case 'room': return route.spin ? <Spin id={route.code} mode="room" /> : <Room code={route.code} />
    case 'collection': return <Collection />
    case 'shelf': return <Shelf />
    case 'shelfShare': return <ShelfShare />
    case 'shelfItem': return <ShelfItemScreen id={route.id} />
    case 'friend': return <FriendShelf id={route.id} />
    case 'friendItem': return <FriendItem id={route.id} item={route.item} />
    case 'together': return <Together />
    case 'me': return <Me />
    default: return <NotFound />
  }
}

function Router({ assets }: { assets: AssetGate }) {
  const route = useRoute()
  const key = route.name === 'gacha' ? `gacha-${route.id}` : JSON.stringify(route)
  // 画面が変わったら先頭へ戻し、見出しに焦点を移す（読み上げで画面の切り替わりが分かる）
  useEffect(() => {
    if (typeof window.scrollTo === 'function' && !/jsdom/i.test(navigator.userAgent)) window.scrollTo(0, 0)
    const title = document.getElementById('page-title')
    if (title && document.activeElement === document.body) title.focus({ preventScroll: true })
  }, [key])
  return <Screen key={key} route={route} assets={assets} />
}

/**
 * assets: 街を出す前に準備する絵・文字。アプリを開いたらすぐ読み込みを始め、
 * どの画面から開いても、街へ行くころには準備が済んでいるようにする。
 */
function App({ storage, assets = townAssets }: { storage?: Pick<Storage, 'getItem' | 'setItem'>; assets?: AssetGate }) {
  useEffect(() => { assets.load() }, [assets])
  return (
    <AppProvider storage={storage}>
      <Router assets={assets} />
    </AppProvider>
  )
}

export default App
