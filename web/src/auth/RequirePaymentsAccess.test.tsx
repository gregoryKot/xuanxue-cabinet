import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { MeDto, UserRole } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { mockApiByPath, resetApiFetchBetweenTests } from '../test-support/apiFetchMock';
import { AuthProvider } from './AuthProvider';
import { RequireAuth } from './RequireAuth';
import { RequirePaymentsAccess } from './RequirePaymentsAccess';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

function makeMe(roles: UserRole[]): MeDto {
  return {
    id: 'u1',
    name: 'Оля',
    roles,
    status: 'active',
    telegramLinked: false,
    botChatActive: false,
    noTelegram: false,
    hasEmail: true,
    needsProfile: false,
    googleLinked: false,
    studentMode: false,
    canUseStudentMode: false,
  };
}

// Вложено под RequireAuth, как в App.tsx: без него `me` в первом рендере ещё
// null, и тест ловил бы гонку загрузки сессии, а не поведение гварда.
function renderGuarded(me: MeDto) {
  mockApiByPath({ '/auth/me': me });
  return render(
    <MemoryRouter initialEntries={['/payments']}>
      <AuthProvider>
        <Routes>
          <Route element={<RequireAuth />}>
            {/* ADR-0174: «Главная» — корень и штата, и ученика. */}
            <Route path="/board" element={<p>Главная</p>} />
            <Route element={<RequirePaymentsAccess />}>
              <Route path="/payments" element={<p>Оплаты</p>} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('RequirePaymentsAccess (ADR-0171)', () => {
  it('бухгалтер — рендерит вложенный маршрут', async () => {
    renderGuarded(makeMe(['accountant']));

    expect(await screen.findByText('Оплаты')).toBeInTheDocument();
  });

  it('admin — рендерит вложенный маршрут', async () => {
    renderGuarded(makeMe(['admin']));

    expect(await screen.findByText('Оплаты')).toBeInTheDocument();
  });

  it('учитель — уходит на свой корень «Главная», а не получает 403 от API', async () => {
    renderGuarded(makeMe(['teacher']));

    expect(await screen.findByText('Главная')).toBeInTheDocument();
    expect(screen.queryByText('Оплаты')).not.toBeInTheDocument();
  });

  it('ученик — уходит на «Главную»', async () => {
    renderGuarded(makeMe([]));

    expect(await screen.findByText('Главная')).toBeInTheDocument();
  });
});
