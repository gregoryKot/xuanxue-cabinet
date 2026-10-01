// Экран «Профиль» (ADR-0045) — сборка шапки, имени, входа в настройки
// уведомлений, Telegram и «Выйти». Переключатели видов и push переехали на
// экран «Настройки уведомлений» (ADR-0162), их проверки — в
// notifications/NotificationSettingsScreen.test.tsx; здесь только карточка-вход
// и то, что самих переключателей на «Профиле» больше нет. Форма имени в
// изоляции — ProfileNameSection.test.tsx, здесь только то, что она открывается
// уже с разобранным me.name.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MeDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
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
  studentMode: false,
  canUseStudentMode: false,
};

function renderScreen(me: MeDto, authConfig: unknown = {}) {
  mockedApiFetch.mockImplementation((path: string) => {
    if (path === '/auth/me') return Promise.resolve(me);
    if (path === '/auth/config') return Promise.resolve(authConfig);
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
    expect(
      screen.getByText('Имя, способы входа и настройки уведомлений.'),
    ).toBeInTheDocument();
  });
});

// Переключатели видов и push живут на «Настройках уведомлений» (ADR-0162):
// «Профиль» остался входом и не ходит за ними в сеть.
describe('ProfileScreen — вход в настройки уведомлений (ADR-0162)', () => {
  it('ученику — карточка «Уведомления» ведёт на /notifications/settings и называет три блока', async () => {
    renderScreen(STUDENT);

    const card = await screen.findByRole('link', { name: /Уведомления/ });
    expect(card).toHaveAttribute('href', '/notifications/settings');
    expect(card).toHaveTextContent(
      'Что присылать, о каких занятиях и на какое устройство',
    );
  });

  it('штату — та же карточка, но без «о каких занятиях»: такого выбора у него нет', async () => {
    renderScreen({ ...STUDENT, id: 't1', roles: ['teacher'] });

    const card = await screen.findByRole('link', { name: /Уведомления/ });
    expect(card).toHaveAttribute('href', '/notifications/settings');
    expect(card).toHaveTextContent('Что присылать и на какое устройство');
    expect(card).not.toHaveTextContent('о каких занятиях');
  });

  it('пока me не пришёл — карточки с угаданной припиской нет', () => {
    mockedApiFetch.mockImplementation(() => new Promise(() => undefined));
    render(
      <MemoryRouter>
        <AuthProvider>
          <ProfileScreen />
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(screen.queryByRole('link', { name: /Уведомления/ })).not.toBeInTheDocument();
  });

  it('переключателей видов и push на «Профиле» больше нет, и за ними в сеть не ходят', async () => {
    renderScreen(STUDENT);

    await screen.findByRole('link', { name: /Уведомления/ });
    expect(screen.queryByText('Результат экзамена')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByText('Push-уведомления')).not.toBeInTheDocument();
    for (const path of ['/me/notifications', '/push/public-key']) {
      expect(mockedApiFetch).not.toHaveBeenCalledWith(path, expect.anything());
    }
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

describe('ProfileScreen — связка Telegram (ADR-0034)', () => {
  it('Telegram связан, почта тоже — оба ключа на месте, блока нет вовсе', async () => {
    renderScreen({ ...STUDENT, telegramLinked: true, botChatActive: true });

    await screen.findByRole('heading', { level: 1, name: 'Профиль' });
    expect(screen.queryByText('Второй способ входа')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Связать Telegram' }),
    ).not.toBeInTheDocument();
  });

  it('Telegram не связан — блок «Второй способ входа» с кнопкой связки (ADR-0059)', async () => {
    renderScreen(STUDENT);

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
    expect(within(note).getByRole('link', { name: '@marievyazova' })).toHaveAttribute(
      'href',
      'https://t.me/marievyazova',
    );
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
    renderScreen(STUDENT, { googleLoginEnabled: false });

    await screen.findByRole('heading', { level: 1, name: 'Профиль' });
    expect(screen.queryByText(/Второй путь входа/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Привязать Google' }),
    ).not.toBeInTheDocument();
  });

  it('googleLoginEnabled: true, googleLinked: false — объяснение и кнопка «Привязать Google»', async () => {
    renderScreen(STUDENT, { googleLoginEnabled: true });

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
    renderScreen({ ...STUDENT, googleLinked: true }, { googleLoginEnabled: true });

    const label = await screen.findByText('Google');
    expect(label.nextElementSibling).toHaveTextContent('привязан');
    expect(
      screen.queryByRole('button', { name: 'Привязать Google' }),
    ).not.toBeInTheDocument();
  });

  it('клик по кнопке уводит вкладку (redirectToGoogleLink) и оставляет кнопку занятой', async () => {
    const user = userEvent.setup();
    renderScreen(STUDENT, { googleLoginEnabled: true });

    const button = await screen.findByRole('button', { name: 'Привязать Google' });
    await user.click(button);

    expect(redirectToGoogleLinkSpy).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(button).toBeDisabled());
  });
});
