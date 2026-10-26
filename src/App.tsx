import { useEffect } from 'react'
import { useMuseumStore } from './store/museumStore'
import TopBar from './components/TopBar'
import HomePage from './pages/HomePage'
import HallPage from './pages/HallPage'
import DetailPage from './pages/DetailPage'
import SpecialPage from './pages/SpecialPage'

export default function App() {
  const view = useMuseumStore((s) => s.view)

  // 切换视图时回到顶部
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [view])

  return (
    <>
      <TopBar />
      {view.name === 'home' && <HomePage />}
      {view.name === 'hall' && <HallPage hallId={view.hallId} />}
      {view.name === 'detail' && <DetailPage exhibitId={view.exhibitId} />}
      {view.name === 'special' && <SpecialPage specialId={view.specialId} />}
      <footer className="footer">
        集合世界博物馆 · 汇集世界文明瑰宝与科技里程碑
      </footer>
    </>
  )
}
