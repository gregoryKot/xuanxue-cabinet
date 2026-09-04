import { Route, Routes } from 'react-router-dom';

// Экран-заглушка этапа 0: подтверждает, что SPA собирается и раздаётся Nest.
// Реальные данные (расписание, рассылки) появятся в этапе 1 — без хардкода.
function HomeScreen() {
  return (
    <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1>Кабинет школы Сюань-Сюэ</h1>
      <p>Расписание, рассылки и записи занятий появятся здесь.</p>
    </main>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeScreen />} />
    </Routes>
  );
}
