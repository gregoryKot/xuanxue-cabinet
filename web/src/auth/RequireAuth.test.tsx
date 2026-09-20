import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MeDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { apiFetch, ApiError } from '../api/http';
import { AuthProvider } from './AuthProvider';
import { RequireAuth } from './RequireAuth';
import { consumeReturnTo } from './returnTo';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

afterEach(() => {
  mockedApiFetch.mockReset();
  sessionStorage.clear();
});

function renderGuarded(initialEntry = '/schedule') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<p>Экран входа</p>} />
          <Route element={<RequireAuth />}>
            {/* Внутри RequireAuth, как в App.tsx (ADR-0044) — иначе тест не
                поймал бы петлю «RequireAuth уводит на /welcome, а сам /welcome
                снова проходит через RequireAuth и уводит на /welcome». */}
            <Route path="/welcome" element={<p>Экран знакомства</p>} />
            <Route path="/schedule" element={<p>Расписание</p>} />
            <Route path="/exams" element={<p>Экзамены</p>} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

/** Общее для теста первого входа (ADR-0044) — различается только `needsProfile`. */
function meWithNeedsProfile(needsProfile: boolean): MeDto {
  return {
    id: 'u1',
    name: 'Новый ученик',
    roles: [],
    status: 'active',
    telegramLinked: false,
    botChatActive: false,
    hasEmail: true,
    needsProfile,
  };
}

describe('RequireAuth', () => {
  it('гость (401) — редирект на /login', async () => {
    mockedApiFetch.mockRejectedValue(new Error('нет сессии'));

    renderGuarded();

    expect(await screen.findByText('Экран входа')).toBeInTheDocument();
  });

  it('сетевой сбой — «Нет связи…» с кнопкой «Повторить», не редирект', async () => {
    mockedApiFetch.mockRejectedValue(new ApiError('Нет связи', 0, 'network'));

    renderGuarded();

    expect(await screen.findByRole('alert')).toHaveTextContent('Нет связи с сервером');
    expect(screen.queryByText('Экран входа')).not.toBeInTheDocument();
  });

  it('вошедший (любая роль) — рендерит вложенный маршрут', async () => {
    const me: MeDto = {
      id: 'u1',
      name: 'Дима',
      roles: ['teacher'],
      status: 'active',
      telegramLinked: false,
      botChatActive: false,
      hasEmail: true,
      needsProfile: false,
    };
    mockedApiFetch.mockResolvedValue(me);

    renderGuarded();

    expect(await screen.findByText('Расписание')).toBeInTheDocument();
  });

  // ADR-0036: статуса «ждёт подтверждения» больше нет — RequireAuth не
  // ветвится по me.status вовсе, пускает по факту успешного /auth/me. Пустые
  // roles — обычный ученик (ADR-0026), не повод для особого экрана.
  it('вошедший с любым me (roles: [], status: active) рендерит вложенный маршрут — статуса ожидания не существует', async () => {
    const student: MeDto = {
      id: 's1',
      name: 'Ваня',
      roles: [],
      status: 'active',
      telegramLinked: false,
      botChatActive: false,
      hasEmail: true,
      needsProfile: false,
    };
    mockedApiFetch.mockResolvedValue(student);

    renderGuarded();

    expect(await screen.findByText('Расписание')).toBeInTheDocument();
  });

  // Задача 3: заблокированный (сессия жива, AuthGuard отверг 403-м) видит
  // отказ прямо здесь, не редирект на /login — там он получил бы тот же
  // отказ по новой (петля, тот же баг, что у email-входа, ревью PR #150).
  it('заблокированный (403) — виден alert с ACCESS_MESSAGE и кнопка «Выйти», редиректа на /login нет', async () => {
    mockedApiFetch.mockRejectedValue(
      new ApiError('Доступа нет. Обратитесь к администратору школы.', 403, 'forbidden'),
    );

    renderGuarded();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Доступа нет. Обратитесь к администратору школы.',
    );
    expect(screen.getByRole('button', { name: 'Выйти' })).toBeInTheDocument();
    expect(screen.queryByText('Экран входа')).not.toBeInTheDocument();
  });

  it('гость на /exams?tab=x — путь запоминается для возврата после входа (аудит L2)', async () => {
    mockedApiFetch.mockRejectedValue(new Error('нет сессии'));

    renderGuarded('/exams?tab=x');

    expect(await screen.findByText('Экран входа')).toBeInTheDocument();
    expect(consumeReturnTo()).toBe('/exams?tab=x');
  });

  it('вошедший — редиректа на /login нет, ничего не сохраняется', async () => {
    const me: MeDto = {
      id: 'u1',
      name: 'Дима',
      roles: ['teacher'],
      status: 'active',
      telegramLinked: false,
      botChatActive: false,
      hasEmail: true,
      needsProfile: false,
    };
    mockedApiFetch.mockResolvedValue(me);

    renderGuarded('/exams');

    expect(await screen.findByText('Экзамены')).toBeInTheDocument();
    expect(consumeReturnTo()).toBeNull();
  });

  it('«Повторить» на офлайне вызывает /auth/me снова', async () => {
    mockedApiFetch.mockRejectedValueOnce(new ApiError('Нет связи', 0, 'network'));
    const me: MeDto = {
      id: 'u1',
      name: 'Дима',
      roles: ['admin'],
      status: 'active',
      telegramLinked: false,
      botChatActive: false,
      hasEmail: true,
      needsProfile: false,
    };
    mockedApiFetch.mockResolvedValueOnce(me);

    const user = userEvent.setup();
    renderGuarded();
    await user.click(await screen.findByRole('button', { name: 'Повторить' }));

    expect(await screen.findByText('Расписание')).toBeInTheDocument();
  });
});

// ADR-0044 «Мягкий первый вход»: не назвавшегося (needsProfile) уводим на
// /welcome прежде, чем показать любой другой вложенный маршрут.
describe('RequireAuth — первый вход (ADR-0044)', () => {
  it('needsProfile: true — уводит на /welcome, адрес запоминается для возврата', async () => {
    mockedApiFetch.mockResolvedValue(meWithNeedsProfile(true));

    renderGuarded('/exams');

    expect(await screen.findByText('Экран знакомства')).toBeInTheDocument();
    expect(consumeReturnTo()).toBe('/exams');
  });

  it('needsProfile: false — пускает к вложенному маршруту, редиректа на /welcome нет', async () => {
    mockedApiFetch.mockResolvedValue(meWithNeedsProfile(false));

    renderGuarded();

    expect(await screen.findByText('Расписание')).toBeInTheDocument();
    expect(screen.queryByText('Экран знакомства')).not.toBeInTheDocument();
  });

  it('уже на /welcome с needsProfile: true — рендерится сам /welcome, без петли редиректа', async () => {
    mockedApiFetch.mockResolvedValue(meWithNeedsProfile(true));

    renderGuarded('/welcome');

    expect(await screen.findByText('Экран знакомства')).toBeInTheDocument();
  });
});
