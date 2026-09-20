// Экран «Профиль» (ADR-0045) — сборка шапки, имени, уведомлений, Telegram и
// «Выйти». Проверки уведомлений/Telegram/«Выйти» перенесены дословно из теста
// удалённого экрана «Уведомления» (CLAUDE.md «Отказались от механики —
// удаляем с концами»); форма имени в изоляции — ProfileNameSection.test.tsx,
// здесь только то, что она открывается уже с разобранным me.name.
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { MeDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { ApiError } from '../api/http';
import { mockedApiFetch, resetApiFetchBetweenTests } from '../test-support/apiFetchMock';
import { AuthProvider } from '../auth/AuthProvider';
import ProfileScreen from './ProfileScreen';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

// hasEmail: true — почта уже подтверждена (тот же ключ, которым вошли),
// Telegram не связан: ровно один ключ есть, SecondLoginKey (ADR-0059)
// предлагает второй, как это бывает в жизни (не оба ключа отсутствуют разом).
const STUDENT: MeDto = {
  id: 'u1',
  name: 'Мария Ли',
  roles: [],
  tz: 'Asia/Jerusalem',
  status: 'active',
  telegramLinked: false,
  botChatActive: false,
  hasEmail: true,
  needsProfile: false,
};

function renderScreen(me: MeDto, notificationsResponse: unknown = { enabled: [] }) {
  mockedApiFetch.mockImplementation((path: string) => {
    if (path === '/auth/me') return Promise.resolve(me);
    if (path === '/auth/config') return Promise.resolve({});
    if (path === '/me/notifications') {
      return notificationsResponse instanceof Error
        ? Promise.reject(notificationsResponse)
        : Promise.resolve(notificationsResponse);
    }
    return Promise.reject(new Error(`неожиданный путь: ${path}`));
  });

  return render(
    <MemoryRouter>
      <AuthProvider>
        <ProfileScreen />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('ProfileScreen — шапка', () => {
  it('заголовок «Профиль» и объяснение под ним', async () => {
    renderScreen(STUDENT);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Профиль' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Ваше имя видят учитель и помощники/)).toBeInTheDocument();
  });
});

describe('ProfileScreen — имя', () => {
  it('поля заполнены разобранным me.name', async () => {
    renderScreen(STUDENT);

    expect(await screen.findByLabelText('Имя')).toHaveValue('Мария');
    expect(screen.getByLabelText('Фамилия')).toHaveValue('Ли');
  });
});

describe('ProfileScreen — список уведомлений по роли', () => {
  it('ученик видит свои два вида уведомлений с подписью и подсказкой', async () => {
    renderScreen(STUDENT, { enabled: ['lesson_soon'] });

    expect(await screen.findByText('Занятие скоро')).toBeInTheDocument();
    expect(screen.getByText('Сообщение от учителя')).toBeInTheDocument();
    expect(
      screen.getByText('Придёт перед началом занятия — за сколько, настраивает школа.'),
    ).toBeInTheDocument();
    // «Черновик поста» — вид для учителя, ученику его показывать незачем.
    expect(screen.queryByText('Черновик поста')).not.toBeInTheDocument();
  });

  it('включённый вид — переключатель отмечен, выключенный — нет', async () => {
    renderScreen(STUDENT, { enabled: ['lesson_soon'] });
    await screen.findByText('Занятие скоро');

    expect(screen.getByRole('checkbox', { name: 'Занятие скоро' })).toBeChecked();
    expect(
      screen.getByRole('checkbox', { name: 'Сообщение от учителя' }),
    ).not.toBeChecked();
  });

  // Подсказка про личный чат — для связавшего Telegram: несвязанному на её
  // месте стоит кнопка связки (ADR-0034), проверка ниже.
  it('честно про Telegram — уведомления придут в личный чат с ботом', async () => {
    renderScreen(
      { ...STUDENT, telegramLinked: true, botChatActive: true },
      { enabled: [] },
    );

    expect(
      await screen.findByText(/В Telegram уведомления приходят в личный чат с ботом/),
    ).toBeInTheDocument();
  });
});

describe('ProfileScreen — связка Telegram (ADR-0034)', () => {
  it('Telegram связан, почта тоже — оба ключа на месте, блока нет вовсе, остаётся подсказка про личный чат', async () => {
    renderScreen(
      { ...STUDENT, telegramLinked: true, botChatActive: true },
      { enabled: [] },
    );

    await screen.findByText(/В Telegram уведомления приходят в личный чат с ботом/);
    expect(screen.queryByText('Второй способ входа')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Связать Telegram' }),
    ).not.toBeInTheDocument();
  });

  it('Telegram не связан — блок «Второй способ входа» с кнопкой связки (ADR-0059)', async () => {
    renderScreen(STUDENT, { enabled: [] });

    expect(await screen.findByText('Второй способ входа')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Сейчас в кабинет пускает только почта. Свяжите Telegram — если потеряете доступ к ящику, войдёте через него.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Связать Telegram' })).toBeInTheDocument();
  });
});

describe('ProfileScreen — переключение уведомлений (read-after-write)', () => {
  it('клик шлёт PATCH с нужным телом и перерисовывает состояние', async () => {
    renderScreen(STUDENT, { enabled: [] });
    const toggle = await screen.findByRole('checkbox', { name: 'Занятие скоро' });
    expect(toggle).not.toBeChecked();

    mockedApiFetch.mockResolvedValueOnce(undefined);
    mockedApiFetch.mockResolvedValueOnce({ enabled: ['lesson_soon'] });
    toggle.click();

    await waitFor(() => expect(toggle).toBeChecked());
    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/me/notifications',
      expect.objectContaining({
        method: 'PATCH',
        body: { kind: 'lesson_soon', enabled: true },
      }),
    );
  });

  it('ошибка сети — сообщение под списком, переключатель остаётся в прежнем положении', async () => {
    renderScreen(STUDENT, { enabled: [] });
    const toggle = await screen.findByRole('checkbox', { name: 'Занятие скоро' });

    mockedApiFetch.mockRejectedValueOnce(
      new ApiError(
        'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.',
        0,
        'network',
      ),
    );
    toggle.click();

    expect(
      await screen.findByText(
        'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.',
      ),
    ).toBeInTheDocument();
    expect(toggle).not.toBeChecked();
  });

  it('неопознанная ошибка (не ApiError) — общий текст, не текст исключения', async () => {
    renderScreen(STUDENT, { enabled: [] });
    const toggle = await screen.findByRole('checkbox', { name: 'Занятие скоро' });

    mockedApiFetch.mockRejectedValueOnce(new Error('boom'));
    toggle.click();

    expect(
      await screen.findByText('Не удалось изменить уведомление. Попробуйте ещё раз.'),
    ).toBeInTheDocument();
  });
});

// «Выйти» держится на этом экране, доступна любой роли (было на прежнем
// экране «Уведомления», отзыв владельца 2026-09-12/18).
describe('ProfileScreen — «Выйти»', () => {
  it('кнопка «Выйти» есть в конце экрана', async () => {
    renderScreen(STUDENT);

    await screen.findByRole('heading', { level: 1, name: 'Профиль' });
    expect(screen.getByRole('button', { name: 'Выйти' })).toBeInTheDocument();
  });
});

describe('ProfileScreen — ошибка загрузки уведомлений', () => {
  it('баннер с кнопкой повтора вместо списка, повтор перечитывает список', async () => {
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/me') return Promise.resolve(STUDENT);
      if (path === '/auth/config') return Promise.resolve({});
      if (path === '/me/notifications')
        return Promise.reject(new Error('сеть недоступна'));
      return Promise.reject(new Error(`неожиданный путь: ${path}`));
    });
    render(
      <MemoryRouter>
        <AuthProvider>
          <ProfileScreen />
        </AuthProvider>
      </MemoryRouter>,
    );

    const alert = await screen.findByRole('alert');
    const retryButton = within(alert).getByRole('button', {
      name: 'Попробовать ещё раз',
    });

    mockedApiFetch.mockImplementationOnce(() => Promise.resolve({ enabled: [] }));
    retryButton.click();

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(await screen.findByText('Занятие скоро')).toBeInTheDocument();
  });
});
