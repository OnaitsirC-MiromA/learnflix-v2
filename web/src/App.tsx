import { Routes, Route } from 'react-router-dom';
import Library from './pages/Library';
import Telegram from './pages/Telegram';
import Course from './pages/Course';
import Lesson from './pages/Lesson';
import Settings from './pages/Settings';
import HelpDrawer from './components/HelpDrawer';

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Library />} />
        <Route path="/course/:id" element={<Course />} />
        <Route path="/lesson/:id" element={<Lesson />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/telegram" element={<Telegram />} />
      </Routes>
      {/* Fora das rotas: a ajuda abre por cima de qualquer tela sem desmontar a
          página de trás — quem pede ajuda não perde o lugar onde estava. */}
      <HelpDrawer />
    </>
  );
}
