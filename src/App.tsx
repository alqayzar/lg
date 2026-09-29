import { Navigate, Route, Routes } from 'react-router-dom'
import { MainMenu } from '@/features/main-menu/MainMenu'
import { Play } from '@/features/play/Play'

function App() {
  return (
    <Routes>
      <Route element={<MainMenu />} path="/" />
      <Route element={<MainMenu />} path="/join" />
      <Route element={<Play />} path="/">
        <Route element={null} path="room" />
        <Route element={null} path="play" />
      </Route>
      <Route element={<Navigate replace to="/" />} path="*" />
    </Routes>
  )
}

export default App
