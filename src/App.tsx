import { useEffect } from 'react'
import './App.css'
import { AppProvider } from './app/AppProvider'
import { useRoute, type Route } from './app/router'
import { Collection } from './screens/Collection'
import { GachaDetail } from './screens/GachaDetail'
import { Home } from './screens/Home'
import { Me } from './screens/Me'
import { NotFound } from './screens/NotFound'
import { Room } from './screens/Room'
import { Spin } from './screens/Spin'
import { Together } from './screens/Together'
import { Welcome } from './screens/Welcome'

function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case 'home': return <Home />
    case 'gacha': return <GachaDetail id={route.id} room={route.room} />
    case 'welcome': return <Welcome />
    case 'spin': return <Spin id={route.id} mode="solo" />
    case 'room': return route.spin ? <Spin id={route.code} mode="room" /> : <Room code={route.code} />
    case 'collection': return <Collection />
    case 'together': return <Together />
    case 'me': return <Me />
    default: return <NotFound />
  }
}

function Router() {
  const route = useRoute()
  const key = route.name === 'gacha' ? `gacha-${route.id}` : JSON.stringify(route)
  // 画面が変わったら先頭へ戻し、見出しに焦点を移す（読み上げで画面の切り替わりが分かる）
  useEffect(() => {
    if (typeof window.scrollTo === 'function' && !/jsdom/i.test(navigator.userAgent)) window.scrollTo(0, 0)
    const title = document.getElementById('page-title')
    if (title && document.activeElement === document.body) title.focus({ preventScroll: true })
  }, [key])
  return <Screen key={key} route={route} />
}

function App({ storage }: { storage?: Pick<Storage, 'getItem' | 'setItem'> }) {
  return (
    <AppProvider storage={storage}>
      <Router />
    </AppProvider>
  )
}

export default App
