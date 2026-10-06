// Общая обвязка тестов «Доски» (ADR-0173, ADR-0174): ученик и штат
// рендерятся одним экраном BoardScreen, оболочка вокруг у них одна. Сам
// `vi.mock('../api/http', …)` остаётся в файле теста — vitest поднимает его
// до импортов. Вынесено, чтобы две раскладки не повторяли один каркас
// (jscpd, CLAUDE.md «Дубли»).
import type { ReactNode } from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from '../auth/AuthProvider';
import { MyExamsProvider } from '../student/MyExamsProvider';
import BoardScreen from './BoardScreen';

/** Оболочка в миниатюре: провайдер экзаменов берёт `me` из сессии, как AppShell.
 * Пока сессия не пришла, не рисуем ничего: провайдер с `me === null` считает
 * человека учеником и успел бы послать `GET /me/exams` даже штату (ADR-0074). */
function ExamsFromSession({ children }: { children: ReactNode }) {
  const { me } = useAuth();
  if (!me) return null;
  return <MyExamsProvider me={me}>{children}</MyExamsProvider>;
}

/** `/board` с настоящей доской и заглушки соседних экранов из `routes`,
 * чтобы по клику видеть, куда ушли. */
export function renderBoardWithRoutes(routes: ReactNode) {
  return render(
    <MemoryRouter initialEntries={['/board']}>
      <AuthProvider>
        <ExamsFromSession>
          <Routes>
            <Route path="/board" element={<BoardScreen />} />
            {routes}
          </Routes>
        </ExamsFromSession>
      </AuthProvider>
    </MemoryRouter>,
  );
}
