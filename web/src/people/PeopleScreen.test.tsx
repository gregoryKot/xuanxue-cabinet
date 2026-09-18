// Мокаем apiFetch (CLAUDE.md «Сеть только через http.ts») и useAuth (экран
// сравнивает id строки с me.id, чтобы найти себя). Маршрутизация по path, не
// последовательная очередь mockResolvedValueOnce: InviteLinkCard (ADR-0030)
// шлёт свой GET /users/invite-link независимо от usePeople, и с очередью,
// общей на все пути, эти два запроса перехватывали бы чужие ответы.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UserDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { apiFetch } from '../api/http';
import PeopleScreen from './PeopleScreen';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({
    me: { id: 'admin-1', name: 'Маша', roles: ['admin'], tz: 'Asia/Jerusalem' },
    status: 'ok',
    refresh: vi.fn(),
    clear: vi.fn(),
  }),
}));

const mockedApiFetch = vi.mocked(apiFetch);

function makePerson(overrides: Partial<UserDto> = {}): UserDto {
  return {
    id: 'u1',
    name: 'Гриша',
    roles: [],
    status: 'active',
    hasTelegram: true,
    lastLoginAt: '2026-09-01T10:00:00Z',
    joinedViaInvite: false,
    ...overrides,
  };
}

/** Маршрутизатор apiFetch: `/users/invite-link` — фиксированный ответ (сама
 * карточка не в фокусе этих тестов, см. InviteLinkCard.test.tsx), остальные
 * пути — очередь `queueUsers`/`queueError`, потреблённая по одной на вызов,
 * тем же порядком, что раньше делал `mockResolvedValueOnce`. */
function mockPeopleApi() {
  const queue: Array<() => Promise<unknown>> = [];
  mockedApiFetch.mockImplementation((path: string) => {
    if (path === '/users/invite-link') return Promise.resolve({ url: null });
    const next = queue.shift();
    if (!next) return Promise.reject(new Error(`неожиданный путь в тесте: ${path}`));
    return next();
  });
  return {
    queueUsers: (value: unknown) => queue.push(() => Promise.resolve(value)),
    queueError: (err: Error) => queue.push(() => Promise.reject(err)),
  };
}

function renderScreen() {
  return render(
    <MemoryRouter>
      <PeopleScreen />
    </MemoryRouter>,
  );
}

afterEach(() => {
  mockedApiFetch.mockReset();
});

describe('PeopleScreen — шапка', () => {
  // ADR-0031: раздел начинается с заголовка антиквой и одной строки
  // объяснения, длинное про роли ушло в приписку под ним.
  it('заголовок «Ученики», объяснение и приписка про роли', async () => {
    const { queueUsers } = mockPeopleApi();
    queueUsers([makePerson()]);

    renderScreen();

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Ученики' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Здесь те, кто зарегистрировался по ссылке-приглашению/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Отметьте, кто ведёт занятия/)).toBeInTheDocument();
  });
});

describe('PeopleScreen — загрузка', () => {
  it('показывает скелетон, пока список не пришёл', () => {
    mockedApiFetch.mockReturnValue(new Promise(() => {}));
    const { container } = renderScreen();
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
  });
});

describe('PeopleScreen — сбой загрузки', () => {
  it('ApiError — текст ошибки и «Попробовать ещё раз», клик повторяет запрос', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../api/http');
    const { queueUsers, queueError } = mockPeopleApi();
    queueError(new ApiError('Сервис недоступен', 503, 'unknown'));

    renderScreen();

    expect(await screen.findByRole('alert')).toHaveTextContent('Сервис недоступен');
    queueUsers([makePerson()]);
    await user.click(screen.getByRole('button', { name: 'Попробовать ещё раз' }));

    expect(await screen.findByText('Гриша')).toBeInTheDocument();
  });
});

describe('PeopleScreen — пустой список', () => {
  // После ADR-0036 вход без ссылки-приглашения даёт 403 — текст ведёт к
  // карточке «Ссылка-приглашение» выше на этом же экране, а не к «дайте
  // ссылку на кабинет».
  it('только сам admin в базе — честный текст со ссылкой на карточку приглашения', async () => {
    const { queueUsers } = mockPeopleApi();
    queueUsers([makePerson({ id: 'admin-1', name: 'Маша', roles: ['admin'] })]);

    renderScreen();

    expect(
      await screen.findByText(/Пока никто, кроме вас, не входил/),
    ).toBeInTheDocument();
    expect(screen.getByText(/ссылку-приглашение из карточки выше/)).toBeInTheDocument();
  });
});

describe('PeopleScreen — список', () => {
  it('строка на каждого человека, включая себя', async () => {
    const { queueUsers } = mockPeopleApi();
    queueUsers([
      makePerson({ id: 'admin-1', name: 'Маша', roles: ['admin'] }),
      makePerson({ id: 'u1', name: 'Гриша', roles: [] }),
    ]);

    renderScreen();

    expect(await screen.findByText('Гриша')).toBeInTheDocument();
    expect(screen.getByText('Маша')).toBeInTheDocument();
  });

  it('число «По ссылке пришли» считает только joinedViaInvite (ADR-0030)', async () => {
    const { queueUsers } = mockPeopleApi();
    queueUsers([
      makePerson({ id: 'admin-1', name: 'Маша', roles: ['admin'] }),
      makePerson({ id: 'u1', name: 'Гриша', roles: [], joinedViaInvite: true }),
      makePerson({ id: 'u2', name: 'Ждан', roles: [] }),
    ]);

    renderScreen();
    await screen.findByText('Гриша');

    expect(screen.getByText('По ссылке пришли: 1')).toBeInTheDocument();
  });

  it('действие роли вызывает PATCH и обновлённая роль видна в списке', async () => {
    const user = userEvent.setup();
    const { queueUsers } = mockPeopleApi();
    queueUsers([
      makePerson({ id: 'admin-1', name: 'Маша', roles: ['admin'] }),
      makePerson({ id: 'u1', name: 'Гриша', roles: [] }),
    ]);

    renderScreen();
    await screen.findByText('Гриша');

    queueUsers({});
    queueUsers([
      makePerson({ id: 'admin-1', name: 'Маша', roles: ['admin'] }),
      makePerson({ id: 'u1', name: 'Гриша', roles: ['teacher'] }),
    ]);

    // Пилюли ролей есть у КАЖДОЙ строки (PersonRoleBadge.tsx), поэтому
    // «Учитель» ищется внутри строки Гриши, а не по всему экрану.
    const grishaRow = screen.getByText('Гриша').closest('li');
    expect(grishaRow).not.toBeNull();
    await user.click(
      within(grishaRow as HTMLElement).getByRole('button', { name: 'Учитель' }),
    );

    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/users/u1',
      expect.objectContaining({ method: 'PATCH', body: { roles: ['teacher'] } }),
    );
    // Роль приехала с сервера — пилюля Гриши стала нажатой.
    await waitFor(() => {
      const row = screen.getByText('Гриша').closest('li') as HTMLElement;
      expect(within(row).getByRole('button', { name: 'Учитель' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });
  });

  it('клик «Закрыть доступ» вызывает PATCH /users/:id/status и обновлённый статус виден на строке', async () => {
    const user = userEvent.setup();
    const { queueUsers } = mockPeopleApi();
    queueUsers([
      makePerson({ id: 'admin-1', name: 'Маша', roles: ['admin'] }),
      makePerson({ id: 'u1', name: 'Гриша', roles: [], status: 'active' }),
    ]);

    renderScreen();
    await screen.findByText('Гриша');

    queueUsers({});
    queueUsers([
      makePerson({ id: 'admin-1', name: 'Маша', roles: ['admin'] }),
      makePerson({ id: 'u1', name: 'Гриша', roles: [], status: 'blocked' }),
    ]);

    await user.click(screen.getByRole('button', { name: 'Закрыть доступ' }));

    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/users/u1/status',
      expect.objectContaining({ method: 'PATCH', body: { status: 'blocked' } }),
    );
    expect(await screen.findByText('Доступ закрыт')).toBeInTheDocument();
  });

  it('сбой удаления — текст ошибки виден на строке (usePeople.remove)', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../api/http');
    const { queueUsers, queueError } = mockPeopleApi();
    // Себя (admin-1 === me.id) кнопка «Удалить данные» не показывает —
    // в списке только одна такая кнопка, у чужой строки Гриши.
    queueUsers([
      makePerson({ id: 'admin-1', name: 'Маша', roles: ['admin'] }),
      makePerson({ id: 'u1', name: 'Гриша', roles: [] }),
    ]);

    renderScreen();
    await screen.findByText('Гриша');

    queueError(
      new ApiError('Пользователь не найден. Обновите список.', 404, 'not_found'),
    );

    await user.click(screen.getByRole('button', { name: 'Удалить данные' }));
    const dialog = screen.getByRole('dialog', { name: 'Удалить данные?' });
    await user.click(within(dialog).getByRole('button', { name: 'Удалить данные' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Пользователь не найден. Обновите список.',
    );
  });

  // Регресс на инцидент 2026-09-15 (ADR-0036): статуса «ждёт подтверждения»
  // и кнопки «Подтвердить» на экране «Люди» больше нет ни при каком ответе
  // сервера — сортировка «ждущие вверху» тоже пропала, список идёт в
  // порядке ответа API.
  it('нет подписи «Ждёт подтверждения» и кнопки «Подтвердить», порядок — как в ответе API', async () => {
    const { queueUsers } = mockPeopleApi();
    queueUsers([
      makePerson({ id: 'admin-1', name: 'Маша', roles: ['admin'] }),
      makePerson({ id: 'u1', name: 'Гриша', roles: [] }),
      makePerson({ id: 'u2', name: 'Ждан', roles: [] }),
    ]);

    renderScreen();
    await screen.findByText('Гриша');

    expect(screen.queryByText(/Ждёт подтверждения/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Подтвердить' })).not.toBeInTheDocument();
    const names = screen.getAllByText(/^(Маша|Гриша|Ждан)$/).map((el) => el.textContent);
    expect(names).toEqual(['Маша', 'Гриша', 'Ждан']);
  });
});
