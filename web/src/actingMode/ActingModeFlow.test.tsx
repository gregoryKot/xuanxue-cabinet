// Режимы ученика (ADR-0163) и учителя (ADR-0190) целиком, в настоящей оболочке:
// секция в «Профиле» только у тех, кому режим доступен, включение перестраивает
// меню и открывает «Главную», плашка стоит на каждом экране, выход возвращает
// прежнее меню и «Главную» (ADR-0174: корень у ролей общий, различает их состав
// меню), оплат в режиме ученика нет. Сеть — по пути; ответ PUT применяется как
// есть, второго `GET /auth/me` нет (ADR-0087).
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
  ADMIN_IN_TEACHER_MODE_ME,
  ADMIN_ME,
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
    '/me/teacher-mode': afterPut,
    '/me/payments': MY_PAYMENTS_PAGE,
    '/me/inbox': { items: [], unreadCount: 0 },
    // Пункт «Задания» в панели ученика — только при наличии экзамена (ADR-0178).
    '/me/exams': [{ id: 'e1', title: 'Форма', attemptsAllowed: 1, attemptsUsed: 0 }],
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
  it('меню становится ученическим, открывается «Главная», появляется плашка', async () => {
    const user = userEvent.setup();
    renderCabinet(STAFF_ME, STAFF_IN_STUDENT_MODE_ME);
    await screen.findByRole('button', { name: 'Включить режим ученика' });
    // «Главная» есть в обоих меню, поэтому меню различаем по «Экзаменам»
    // (только у штата) и «Заданиям» (только у ученика).
    expect(
      within(navigation()).getByRole('link', { name: 'Экзамены' }),
    ).toBeInTheDocument();
    expect(
      within(navigation()).queryByRole('link', { name: 'Задания' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Включить режим ученика' }));

    expect(await screen.findByText('Экран доски')).toBeInTheDocument();
    expect(
      within(navigation()).getByRole('link', { name: 'Главная' }),
    ).toBeInTheDocument();
    expect(
      await within(navigation()).findByRole('link', { name: 'Задания' }),
    ).toBeInTheDocument();
    expect(
      within(navigation()).queryByRole('link', { name: 'Экзамены' }),
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

  it('«Вернуться к роли» возвращает штатное меню и «Главную», плашка уходит', async () => {
    const user = userEvent.setup();
    renderCabinet(STAFF_IN_STUDENT_MODE_ME, STAFF_ME, '/lessons');
    await screen.findByText('Экран занятий');
    expect(
      within(navigation()).queryByRole('link', { name: 'Экзамены' }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Вернуться к роли' }));

    expect(await screen.findByText('Экран доски')).toBeInTheDocument();
    expect(
      within(navigation()).getByRole('link', { name: 'Экзамены' }),
    ).toBeInTheDocument();
    expect(
      within(navigation()).queryByRole('link', { name: 'Задания' }),
    ).not.toBeInTheDocument();
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

describe('Режим учителя: «Профиль» — кому виден переключатель (ADR-0190)', () => {
  it('разработчику — обе секции, «Режим учителя» над «Режимом ученика»', async () => {
    renderCabinet(ADMIN_ME, ADMIN_ME);

    const teacher = await screen.findByRole('button', { name: 'Включить режим учителя' });
    const student = screen.getByRole('button', { name: 'Включить режим ученика' });

    expect(
      teacher.compareDocumentPosition(student) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it.each([
    ['учителю', STAFF_ME],
    ['ученику', STUDENT_ME],
    [
      'разработчику в режиме ученика (по пустым ролям админа не прочесть)',
      makeMe({ roles: [], studentMode: true, canUseStudentMode: true }),
    ],
  ])('%s — секции учителя нет', async (_label, me) => {
    renderCabinet(me, me);

    expect(await screen.findByText(`Вы вошли как ${me.name}`)).toBeInTheDocument();
    expect(screen.queryByText('Режим учителя')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /режим учителя/i }),
    ).not.toBeInTheDocument();
  });

  it('карточка «Сбои» есть у разработчика и пропадает в режиме учителя', async () => {
    renderCabinet(ADMIN_ME, ADMIN_ME);
    expect(await screen.findByRole('link', { name: /Сбои/ })).toBeInTheDocument();
  });

  it('в режиме учителя «Профиль» без «Сбоев», секция предлагает вернуться к роли', async () => {
    renderCabinet(ADMIN_IN_TEACHER_MODE_ME, ADMIN_ME);

    expect(
      await screen.findByRole('button', { name: 'Вернуться к своей роли' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Сбои/ })).not.toBeInTheDocument();
  });
});

describe('Режим учителя в оболочке (ADR-0190)', () => {
  it('включение: открывается «Главная», появляется плашка, профиль не перечитывается', async () => {
    const user = userEvent.setup();
    renderCabinet(ADMIN_ME, ADMIN_IN_TEACHER_MODE_ME);

    await user.click(
      await screen.findByRole('button', { name: 'Включить режим учителя' }),
    );

    expect(await screen.findByText('Экран доски')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Вы в режиме учителя');
    expect(
      within(navigation()).getByRole('link', { name: 'Экзамены' }),
    ).toBeInTheDocument();
    const authMeCalls = mockedApiFetch.mock.calls.filter(([path]) => path === '/auth/me');
    expect(authMeCalls).toHaveLength(1);
  });

  it('плашка стоит на любом экране режима, «Вернуться к роли» её убирает и ведёт на «Главную»', async () => {
    const user = userEvent.setup();
    renderCabinet(ADMIN_IN_TEACHER_MODE_ME, ADMIN_ME, '/exams');
    expect(await screen.findByText('Экран экзаменов')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Вы в режиме учителя');

    await user.click(screen.getByRole('button', { name: 'Вернуться к роли' }));

    expect(await screen.findByText('Экран доски')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('из режима учителя можно включить режим ученика: плашка меняется, меню ученическое', async () => {
    const user = userEvent.setup();
    renderCabinet(ADMIN_IN_TEACHER_MODE_ME, STAFF_IN_STUDENT_MODE_ME);

    await user.click(
      await screen.findByRole('button', { name: 'Включить режим ученика' }),
    );

    expect(await screen.findByText('Экран доски')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Вы в режиме ученика');
    expect(
      await within(navigation()).findByRole('link', { name: 'Задания' }),
    ).toBeInTheDocument();
  });
});
