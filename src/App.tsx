import { Navigate, Route, Routes } from 'react-router-dom'
import { MainMenu } from '@/features/main-menu/MainMenu'
import { Play } from '@/features/play/Play'

function App() {
  return (
    <Routes>
      <Route element={<MainMenu />} path="/" />
      <Route element={<MainMenu />} path="/join" />
      <Route element={<Play />} path="/play" />
      <Route element={<Navigate replace to="/" />} path="*" />
    </Routes>
  )
}

export default App
