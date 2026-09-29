// Экран «Профиль» (ADR-0045) — сборка шапки, имени, уведомлений, Telegram и
// «Выйти». Проверки уведомлений/Telegram/«Выйти» перенесены дословно из теста
// удалённого экрана «Уведомления» (CLAUDE.md «Отказались от механики —
// удаляем с концами»); форма имени в изоляции — ProfileNameSection.test.tsx,
// здесь только то, что она открывается уже с разобранным me.name.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MeDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { ApiError } from '../api/http';
import { mockedApiFetch, resetApiFetchBetweenTests } from '../test-support/apiFetchMock';
import { AuthProvider } from '../auth/AuthProvider';
import type * as GoogleAuthRedirectModule from '../auth/googleAuthRedirect';
import type * as MyPaymentsVisibilityModule from '../student/myPaymentsVisibility';
import { redirectToGoogleLink } from '../auth/googleAuthRedirect';
import ProfileScreen from './ProfileScreen';

vi.mock('../auth/googleAuthRedirect', async () => {
  const actual = await vi.importActual<typeof GoogleAuthRedirectModule>(
    '../auth/googleAuthRedirect',
  );
  return { ...actual, redirectToGoogleLink: vi.fn() };
});
const redirectToGoogleLinkSpy = vi.mocked(redirectToGoogleLink);

// Флаг секции «Абонемент» (ADR-0157) — подменяем только его, правило «кому
// показывать» остаётся настоящим.
const paymentsFlag = vi.hoisted(() => ({ visible: false }));
vi.mock('../student/myPaymentsVisibility', async () => {
  const actual = await vi.importActual<typeof MyPaymentsVisibilityModule>(
    '../student/myPaymentsVisibility',
  );
  return {
    ...actual,
    isMyPaymentsVisible: (me: MeDto | null) =>
      actual.isMyPaymentsVisible(me, paymentsFlag.visible),
  };
});
afterEach(() => {
  redirectToGoogleLinkSpy.mockClear();
});

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

// Контакт бухгалтера приезжает ученику в его же /me/payments (ADR-0159).
const MY_PAYMENTS_PAGE = { month: '2026-09', rows: [], contact: 'Маше @marievyazova' };

// hasEmail: true — почта уже подтверждена (тот же ключ, которым вошли),
// Telegram не связан: ровно один ключ есть, SecondLoginKey (ADR-0059)
// предлагает второй, как это бывает в жизни (не оба ключа отсутствуют разом).
const STUDENT: MeDto = {
  id: 'u1',
  name: 'Мария Ли',
  roles: [],
  status: 'active',
  telegramLinked: false,
  botChatActive: false,
  email: 'maria@example.com',
  hasEmail: true,
  noTelegram: false,
  needsProfile: false,
  googleLinked: false,
};

function renderScreen(
  me: MeDto,
  notificationsResponse: unknown = { enabled: [] },
  authConfig: unknown = {},
) {
  mockedApiFetch.mockImplementation((path: string) => {
    if (path === '/auth/me') return Promise.resolve(me);
    if (path === '/auth/config') return Promise.resolve(authConfig);
    if (path === '/me/notifications') {
      return notificationsResponse instanceof Error
        ? Promise.reject(notificationsResponse)
        : Promise.resolve(notificationsResponse);
    }
    // publicKey: null — push выключен на сервере (риск за флагом, ADR-0092):
    // PushNotificationsSection.tsx не рисует ничего, экран остаётся тем же,
    // что и до неё. Сами состояния раздела — PushNotificationsSection.test.tsx.
    if (path === '/push/public-key') return Promise.resolve({ publicKey: null });
    // Абонемент есть только у ученика (PLAN §15, слой 2.4); сам блок —
    // student/MyPaymentsSection.test.tsx, здесь лишь его присутствие.
    if (path === '/me/payments') return Promise.resolve(MY_PAYMENTS_PAGE);
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
    expect(screen.getByText('Ниже — что присылать и куда.')).toBeInTheDocument();
  });
});

// Политика и «Доступность» открываются и вошедшему (маршруты вне RequireAuth,
// ADR-0158): в личном разделе — тихая строка внизу, не карточка и не кнопка.
describe('ProfileScreen — юридические ссылки', () => {
  it('внизу — ссылки на политику конфиденциальности и «Доступность»', async () => {
    renderScreen(STUDENT);

    expect(await screen.findByRole('link', { name: 'Доступность' })).toHaveAttribute(
      'href',
      '/accessibility',
    );
    expect(
      screen.getByRole('link', { name: 'Политика конфиденциальности' }),
    ).toHaveAttribute('href', '/privacy');
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
  it('ученик видит один вид уведомлений — результат экзамена (ADR-0062)', async () => {
    renderScreen(STUDENT, { enabled: ['exam_result'] });

    expect(await screen.findByText('Результат экзамена')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Придёт, когда учитель проверит вашу работу и выставит результат.',
      ),
    ).toBeInTheDocument();
    // «Черновик поста» — вид для учителя, ученику его показывать незачем.
    expect(screen.queryByText('Черновик поста')).not.toBeInTheDocument();
  });

  // Бот и «Профиль» переключают одно и то же (ADR-0065) — строка про бота
  // рядом с самими переключателями, не только в справке. Строка зависит от
  // botChatActive (отзыв владельца 2026-09-22, регрессия — раньше рисовалась
  // безусловно и спорила с блоком «Второй способ входа» на этом же экране).
  it('есть личный чат с ботом — подсказка про команду /notifications на месте', async () => {
    renderScreen(
      { ...STUDENT, telegramLinked: true, botChatActive: true },
      { enabled: ['exam_result'] },
    );

    expect(
      await screen.findByText(/То же самое можно переключить в боте/),
    ).toBeInTheDocument();
    // ADR-0124: команда бота выделена акцентом — RichText рисует её
    // отдельным <strong>.
    expect(screen.getByText('/notifications').tagName).toBe('STRONG');
  });

  it('нет личного чата с ботом — подсказки про команду /notifications нет', async () => {
    renderScreen(STUDENT, { enabled: ['exam_result'] });

    await screen.findByText('Результат экзамена');
    expect(
      screen.queryByText(
        'То же самое можно переключить в боте — командой /notifications.',
      ),
    ).not.toBeInTheDocument();
  });

  // «Telegram у меня нет» — тем более нет чата с ботом, команда так же
  // недоступна (отзыв владельца 2026-09-22).
  it('отметка «Telegram у меня нет» — подсказки про команду /notifications нет', async () => {
    renderScreen({ ...STUDENT, noTelegram: true }, { enabled: ['exam_result'] });

    await screen.findByText('Результат экзамена');
    expect(
      screen.queryByText(
        'То же самое можно переключить в боте — командой /notifications.',
      ),
    ).not.toBeInTheDocument();
  });

  it('включённый вид — переключатель отмечен', async () => {
    renderScreen(STUDENT, { enabled: ['exam_result'] });
    await screen.findByText('Результат экзамена');

    expect(screen.getByRole('checkbox', { name: 'Результат экзамена' })).toBeChecked();
  });

  it('выключенный вид — переключатель не отмечен', async () => {
    renderScreen(STUDENT, { enabled: [] });
    await screen.findByText('Результат экзамена');

    expect(
      screen.getByRole('checkbox', { name: 'Результат экзамена' }),
    ).not.toBeChecked();
  });
});

describe('ProfileScreen — связка Telegram (ADR-0034)', () => {
  it('Telegram связан, почта тоже — оба ключа на месте, блока нет вовсе', async () => {
    renderScreen(
      { ...STUDENT, telegramLinked: true, botChatActive: true },
      { enabled: [] },
    );

    await screen.findByRole('heading', { level: 1, name: 'Профиль' });
    expect(screen.queryByText('Второй способ входа')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Связать Telegram' }),
    ).not.toBeInTheDocument();
  });

  it('Telegram не связан — блок «Второй способ входа» с кнопкой связки (ADR-0059)', async () => {
    renderScreen(STUDENT, { enabled: [] });

    expect(await screen.findByText('Второй способ входа')).toBeInTheDocument();
    // ADR-0124: что даст связка — выделено акцентом, RichText рисует его
    // отдельным <strong>, полный текст проверяем через textContent абзаца.
    const explanation = screen.getByText(/Сейчас в кабинет пускает только почта/);
    expect(explanation).toHaveTextContent(
      'Сейчас в кабинет пускает только почта. Свяжите Telegram — если потеряете ' +
        'доступ к ящику, войдёте через него.',
    );
    expect(screen.getByRole('button', { name: 'Связать Telegram' })).toBeInTheDocument();
  });
});

describe('ProfileScreen — переключение уведомлений (read-after-write)', () => {
  it('клик шлёт PATCH с нужным телом и перерисовывает состояние', async () => {
    renderScreen(STUDENT, { enabled: [] });
    const toggle = await screen.findByRole('checkbox', { name: 'Результат экзамена' });
    expect(toggle).not.toBeChecked();

    // Один ответ на одно действие: PATCH /me/notifications возвращает полный
    // NotificationPrefsDto, и экран берёт состояние прямо из него (ADR-0087).
    // Прежняя заглушка `undefined` на сам PATCH оставила бы переключатель без
    // значения.
    mockedApiFetch.mockResolvedValueOnce({ enabled: ['exam_result'] });
    toggle.click();

    await waitFor(() => expect(toggle).toBeChecked());
    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/me/notifications',
      expect.objectContaining({
        method: 'PATCH',
        body: { kind: 'exam_result', enabled: true },
      }),
    );
  });

  it('ошибка сети — сообщение под списком, переключатель остаётся в прежнем положении', async () => {
    renderScreen(STUDENT, { enabled: [] });
    const toggle = await screen.findByRole('checkbox', { name: 'Результат экзамена' });

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
    const toggle = await screen.findByRole('checkbox', { name: 'Результат экзамена' });

    mockedApiFetch.mockRejectedValueOnce(new Error('boom'));
    toggle.click();

    expect(
      await screen.findByText('Не удалось изменить уведомление. Попробуйте ещё раз.'),
    ).toBeInTheDocument();
  });
});

// «Выйти» держится на этом экране, доступна любой роли (было на прежнем
// экране «Уведомления», отзыв владельца 2026-09-12/18).
// Секция «Абонемент» спрятана флагом (ADR-0157, myPaymentsVisibility.ts):
// бухгалтер не ведёт оплаты в кабинете. Тест с включённым флагом держит
// обещание «вернуть — одной строкой»: секция и её запрос живы.
describe('ProfileScreen — секция «Абонемент» спрятана (ADR-0157)', () => {
  afterEach(() => {
    paymentsFlag.visible = false;
  });

  it('флаг включён — у ученика без ролей блок «Абонемент» есть и запрашивает свои оплаты', async () => {
    paymentsFlag.visible = true;
    renderScreen(STUDENT);

    expect(await screen.findByRole('heading', { name: 'Абонемент' })).toBeInTheDocument();
    expect(await screen.findByText('Оплаты за сентябрь нет')).toBeInTheDocument();
  });

  it('у ученика без ролей блока «Абонемент» нет, но есть «Оплата» с контактом бухгалтера', async () => {
    renderScreen(STUDENT);

    expect(await screen.findByRole('heading', { name: 'Оплата' })).toBeInTheDocument();
    const note = await screen.findByText(/Скриншот перевода присылайте/);
    expect(note).toHaveTextContent(
      'Скриншот перевода присылайте Маше @marievyazova в Telegram.',
    );
    expect(within(note).getByText('Маше @marievyazova').tagName).toBe('STRONG');
    expect(screen.queryByRole('heading', { name: 'Абонемент' })).not.toBeInTheDocument();
  });

  it('у учителя нет ни «Абонемента», ни «Оплаты», и запроса за оплатами тоже нет', async () => {
    renderScreen({ ...STUDENT, id: 't1', roles: ['teacher'] });

    await screen.findByRole('heading', { level: 1, name: 'Профиль' });
    await screen.findByText('Второй способ входа').catch(() => null);
    expect(screen.queryByRole('heading', { name: 'Абонемент' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Оплата' })).not.toBeInTheDocument();
    expect(mockedApiFetch).not.toHaveBeenCalledWith('/me/payments', expect.anything());
  });
});

describe('ProfileScreen — «Выйти»', () => {
  it('кнопка «Выйти» есть в конце экрана', async () => {
    renderScreen(STUDENT);

    await screen.findByRole('heading', { level: 1, name: 'Профиль' });
    expect(screen.getByRole('button', { name: 'Выйти' })).toBeInTheDocument();
  });
});

// Карточка входа в журнал сбоев (ADR-0132) — только admin, не пункт меню
// (ADR-0025): учитель и ученик её не видят вовсе.
describe('ProfileScreen — карточка «Сбои» (ADR-0132)', () => {
  it('admin — карточка на месте, ведёт на /dev/errors', async () => {
    renderScreen({ ...STUDENT, id: 'a1', roles: ['admin'] });

    const link = await screen.findByRole('link', { name: /Сбои/ });
    expect(link).toHaveAttribute('href', '/dev/errors');
  });

  it('учитель — карточки нет', async () => {
    renderScreen({ ...STUDENT, id: 't1', roles: ['teacher'] });

    await screen.findByRole('heading', { level: 1, name: 'Профиль' });
    expect(screen.queryByRole('link', { name: /Сбои/ })).not.toBeInTheDocument();
  });

  it('ученик без роли — карточки нет', async () => {
    renderScreen(STUDENT);

    await screen.findByRole('heading', { level: 1, name: 'Профиль' });
    expect(screen.queryByRole('link', { name: /Сбои/ })).not.toBeInTheDocument();
  });
});

// Баг владельца 2026-09-29: адрес почты нигде не был назван.
describe('ProfileScreen — сводка «Способы входа»', () => {
  it('виден адрес подтверждённой почты, Telegram — «нет»', async () => {
    renderScreen(STUDENT);

    expect(await screen.findByText('maria@example.com')).toBeInTheDocument();
    expect(screen.getByText('Telegram').nextElementSibling).toHaveTextContent('нет');
  });
});

describe('ProfileScreen — привязка Google (ADR-0145)', () => {
  it('googleLoginEnabled: false — блока нет вовсе', async () => {
    renderScreen(STUDENT, { enabled: [] }, { googleLoginEnabled: false });

    await screen.findByRole('heading', { level: 1, name: 'Профиль' });
    expect(screen.queryByText(/Второй путь входа/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Привязать Google' }),
    ).not.toBeInTheDocument();
  });

  it('googleLoginEnabled: true, googleLinked: false — объяснение и кнопка «Привязать Google»', async () => {
    renderScreen(STUDENT, { enabled: [] }, { googleLoginEnabled: true });

    expect(
      await screen.findByRole('button', { name: 'Привязать Google' }),
    ).toBeInTheDocument();
    const explanation = screen.getByText(/Второй путь входа/);
    expect(explanation).toHaveTextContent(
      'Второй путь входа на случай, если потеряете доступ к Telegram или почте — ' +
        'можно будет войти через Google.',
    );
    expect(screen.getByText('можно будет войти через Google').tagName).toBe('STRONG');
  });

  it('googleLoginEnabled: true, googleLinked: true — в сводке «привязан», кнопки нет', async () => {
    renderScreen(
      { ...STUDENT, googleLinked: true },
      { enabled: [] },
      { googleLoginEnabled: true },
    );

    const label = await screen.findByText('Google');
    expect(label.nextElementSibling).toHaveTextContent('привязан');
    expect(
      screen.queryByRole('button', { name: 'Привязать Google' }),
    ).not.toBeInTheDocument();
  });

  it('клик по кнопке уводит вкладку (redirectToGoogleLink) и оставляет кнопку занятой', async () => {
    const user = userEvent.setup();
    renderScreen(STUDENT, { enabled: [] }, { googleLoginEnabled: true });

    const button = await screen.findByRole('button', { name: 'Привязать Google' });
    await user.click(button);

    expect(redirectToGoogleLinkSpy).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(button).toBeDisabled());
  });
});

describe('ProfileScreen — ошибка загрузки уведомлений', () => {
  it('баннер с кнопкой повтора вместо списка, повтор перечитывает список', async () => {
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/me') return Promise.resolve(STUDENT);
      if (path === '/auth/config') return Promise.resolve({});
      if (path === '/me/notifications')
        return Promise.reject(new Error('сеть недоступна'));
      if (path === '/push/public-key') return Promise.resolve({ publicKey: null });
      if (path === '/me/payments') return Promise.resolve(MY_PAYMENTS_PAGE);
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
    expect(await screen.findByText('Результат экзамена')).toBeInTheDocument();
  });
});
