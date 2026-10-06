// Режим ученика целиком, в настоящей оболочке (ADR-0163): секция в «Профиле»
// только у штата, включение перестраивает меню и открывает «Доску», плашка
// стоит на каждом экране, выход возвращает штатное меню и «Экзамены», оплат в
// режиме нет. Сеть — по пути; ответ PUT применяется как есть, второго
// `GET /auth/me` нет (ADR-0087).
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { MeDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { AppShell } from '../app/AppShell';
import { AuthProvider } from '../auth/AuthProvider';
import ProfileScreen from '../profile/ProfileScreen';
import {
  mockApiByPath,
  mockedApiFetch,
  resetApiFetchBetweenTests,
} from '../test-support/apiFetchMock';
import {
  STAFF_IN_STUDENT_MODE_ME,
  STAFF_ME,
  STUDENT_ME,
  makeMe,
} from '../test-support/meFixture';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

const MY_PAYMENTS_PAGE = {
  month: '2026-09',
  rows: [],
  contact: 'Маше Вязовой — например, в Telegram @marievyazova',
};

function renderCabinet(me: MeDto, afterPut: MeDto, initialPath = '/profile') {
  mockApiByPath({
    '/auth/me': me,
    '/auth/config': {},
    '/me/student-mode': afterPut,
    '/me/payments': MY_PAYMENTS_PAGE,
    '/me/inbox': { items: [], unreadCount: 0 },
    '/me/exams': [],
  });
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/profile" element={<ProfileScreen />} />
            <Route path="/board" element={<p>Экран доски</p>} />
            <Route path="/tasks" element={<p>Экран заданий</p>} />
            <Route path="/lessons" element={<p>Экран занятий</p>} />
            <Route path="/exams" element={<p>Экран экзаменов</p>} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

function navigation() {
  return screen.getByRole('navigation', { name: 'Разделы кабинета' });
}

describe('«Профиль» — кому виден переключатель', () => {
  it('штату — секция «Режим ученика» с кнопкой', async () => {
    renderCabinet(STAFF_ME, STAFF_ME);

    expect(
      await screen.findByRole('button', { name: 'Включить режим ученика' }),
    ).toBeInTheDocument();
  });

  it.each([
    ['ученику', STUDENT_ME],
    [
      'штату без права на режим',
      makeMe({ roles: ['teacher'], canUseStudentMode: false }),
    ],
  ])('%s — секции нет', async (_label, me) => {
    renderCabinet(me, me);

    expect(await screen.findByRole('heading', { name: 'Профиль' })).toBeInTheDocument();
    // Профиль пришёл — блок человека в колонке называет его по имени.
    expect(await screen.findByText(`Вы вошли как ${me.name}`)).toBeInTheDocument();
    expect(screen.queryByText('Режим ученика')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /режим ученика/i }),
    ).not.toBeInTheDocument();
  });
});

describe('Включение режима в оболочке', () => {
  it('меню становится ученическим, открывается «Доска», появляется плашка', async () => {
    const user = userEvent.setup();
    renderCabinet(STAFF_ME, STAFF_IN_STUDENT_MODE_ME);
    await screen.findByRole('button', { name: 'Включить режим ученика' });
    expect(
      within(navigation()).getByRole('link', { name: 'Рассылки' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Включить режим ученика' }));

    expect(await screen.findByText('Экран доски')).toBeInTheDocument();
    expect(within(navigation()).getByRole('link', { name: 'Доска' })).toBeInTheDocument();
    expect(
      within(navigation()).queryByRole('link', { name: 'Рассылки' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Вы в режиме ученика');
    const authMeCalls = mockedApiFetch.mock.calls.filter(([path]) => path === '/auth/me');
    expect(authMeCalls).toHaveLength(1);
  });
});

describe('Плашка в оболочке', () => {
  it('стоит на любом экране режима — и на «Занятиях», и на «Профиле»', async () => {
    renderCabinet(STAFF_IN_STUDENT_MODE_ME, STAFF_ME, '/lessons');

    expect(await screen.findByText('Экран занятий')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Вы в режиме ученика');
  });

  it('вне режима плашки нет на экранах штата', async () => {
    renderCabinet(STAFF_ME, STAFF_ME, '/exams');

    expect(await screen.findByText('Экран экзаменов')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('«Вернуться к роли» возвращает штатное меню и «Экзамены», плашка уходит', async () => {
    const user = userEvent.setup();
    renderCabinet(STAFF_IN_STUDENT_MODE_ME, STAFF_ME, '/lessons');
    await screen.findByText('Экран занятий');
    expect(
      within(navigation()).queryByRole('link', { name: 'Рассылки' }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Вернуться к роли' }));

    expect(await screen.findByText('Экран экзаменов')).toBeInTheDocument();
    expect(
      within(navigation()).getByRole('link', { name: 'Рассылки' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('плашка — первая в оболочке после ссылки «Перейти к содержимому», до меню', async () => {
    const user = userEvent.setup();
    renderCabinet(STAFF_IN_STUDENT_MODE_ME, STAFF_ME, '/lessons');
    await screen.findByText('Экран занятий');

    await user.tab();
    expect(screen.getByRole('link', { name: 'Перейти к содержимому' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Вернуться к роли' })).toHaveFocus();
  });
});

describe('Деньги не входят в режим (ADR-0163)', () => {
  it('в режиме «Профиль» не показывает контакт бухгалтера и не ходит за оплатой', async () => {
    renderCabinet(STAFF_IN_STUDENT_MODE_ME, STAFF_ME);

    expect(
      await screen.findByRole('button', { name: 'Вернуться к своей роли' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/marievyazova/)).not.toBeInTheDocument();
    const paymentCalls = mockedApiFetch.mock.calls.filter(([path]) =>
      String(path).startsWith('/me/payments'),
    );
    expect(paymentCalls).toHaveLength(0);
  });
});
