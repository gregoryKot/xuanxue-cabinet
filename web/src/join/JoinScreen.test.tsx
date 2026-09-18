// Экран целиком: check → карточка входа/сообщение/авто-присоединение
// (useJoinByInvite.ts уже покрыт отдельно юнитом — здесь смоук по веткам
// рендера и по тому, что EmailLoginForm получает inviteCode).
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MeDto, TelegramLoginInput } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { ApiError, apiFetch } from '../api/http';
import App from '../app/App';
import { AuthProvider } from '../auth/AuthProvider';
import JoinScreen from './JoinScreen';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);
const CODE = 'a'.repeat(32);

/** Тот же способ, что у telegram-widget.js (useTelegramAuthResultLogin.test.ts) —
 * симулирует возврат с oauth.telegram.org на /join/<code>#tgAuthResult=. */
function toTgAuthResultHash(user: TelegramLoginInput): string {
  const bytes = new TextEncoder().encode(JSON.stringify(user));
  const binaryString = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
  const encoded = btoa(binaryString)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `#tgAuthResult=${encoded}`;
}

afterEach(() => {
  mockedApiFetch.mockReset();
  window.location.hash = '';
});

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={[`/join/${CODE}`]}>
      <AuthProvider>
        <Routes>
          <Route path="/join/:code" element={<JoinScreen />} />
          <Route path="/login" element={<p>Экран входа</p>} />
          <Route path="/schedule" element={<p>Расписание</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('JoinScreen — ссылка не действует', () => {
  it('checkStatus invalid — сообщение и кнопка «На страницу входа» ведёт на /login', async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/me')
        return Promise.reject(new ApiError('Войдите', 401, 'unauthorized'));
      if (path === '/auth/join/check') return Promise.resolve({ valid: false });
      return Promise.reject(new Error(`неожиданный путь: ${path}`));
    });

    renderScreen();

    expect(await screen.findByText('Ссылка не подошла')).toBeInTheDocument();
    expect(
      screen.getByText('Ссылка-приглашение не действует. Попросите у учителя новую.'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'На страницу входа' }));
    expect(await screen.findByText('Экран входа')).toBeInTheDocument();
  });
});

describe('JoinScreen — сеть недоступна при проверке', () => {
  it('checkStatus offline — «Нет связи…», «Повторить» перезапрашивает check', async () => {
    const user = userEvent.setup();
    let attempt = 0;
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/me')
        return Promise.reject(new ApiError('Войдите', 401, 'unauthorized'));
      if (path === '/auth/join/check') {
        attempt += 1;
        return attempt === 1
          ? Promise.reject(new Error('boom'))
          : Promise.resolve({ valid: true });
      }
      if (path === '/auth/config') return Promise.resolve({});
      return Promise.reject(new Error(`неожиданный путь: ${path}`));
    });

    renderScreen();
    expect(await screen.findByText(/Нет связи с сервером/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Повторить' }));

    await waitFor(() =>
      expect(screen.getByText('Вас пригласили в школу')).toBeInTheDocument(),
    );
  });
});

describe('JoinScreen — ссылка действует, гость', () => {
  it('карточка приглашения — кнопка Telegram, форма почты с inviteCode', async () => {
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/me')
        return Promise.reject(new ApiError('Войдите', 401, 'unauthorized'));
      if (path === '/auth/join/check') return Promise.resolve({ valid: true });
      if (path === '/auth/config')
        return Promise.resolve({ telegramBotId: 123456, emailLoginEnabled: true });
      return Promise.reject(new Error(`неожиданный путь: ${path}`));
    });

    renderScreen();

    expect(await screen.findByText('Вас пригласили в школу')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Войти через Telegram' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Почта')).toBeInTheDocument();
  });
});

// Регресс на инцидент 2026-09-15: владелец на мгновение увидел
// «Вы вошли, осталось дождаться подтверждения…» между возвратом с Telegram
// на /join/<code> и попаданием в кабинет — вход оставался двухшаговым даже
// после ADR-0030. ADR-0036 убрало промежуточное состояние с концами: этот
// текст (и любой похожий на него) не должен появиться на экране НИ РАЗУ за
// весь флоу «код валиден → возврат с Telegram → сессия есть → /schedule».
//
// Старый тест проверял только финальный DOM (после findByText('Расписание'))
// — на старом двухшаговом коде экран ожидания успевал отрисоваться и
// исчезнуть до этой проверки, тест прошёл бы и на баге. MutationObserver,
// повешенный на document.body ДО render, ловит каждое изменение разметки в
// реальном времени, включая тот самый промежуточный кадр — единственный
// способ поймать регресс, который сам себя стирает.
// Настоящее дерево App (а не JoinScreen с заглушками маршрутов): старый экран
// ожидания жил не в JoinScreen, а в AppShell/RequireAuth за редиректом на
// /schedule — изолированный экран его бы не увидел ни при каком статусе.
describe('JoinScreen — регресс на инцидент 2026-09-15 (мелькнувший экран ожидания)', () => {
  const STUDENT: MeDto = {
    id: 'u1',
    name: 'Аня',
    roles: [],
    tz: 'Asia/Jerusalem',
    status: 'active',
    telegramLinked: true,
    botChatActive: true,
    needsProfile: false,
  };
  const FORBIDDEN_TEXT_PATTERNS = [
    /дождаться подтверждения/i,
    /ждём подтверждения/i,
    /ждёт подтверждения/i,
    /осталось дождаться/i,
  ];

  it('возврат с Telegram на /join/<code> — ни на одном рендере всего App нет текста про ожидание подтверждения', async () => {
    const telegramUser: TelegramLoginInput = {
      id: 700,
      first_name: 'Аня',
      auth_date: Math.floor(Date.now() / 1000),
      hash: 'a'.repeat(64),
    };
    window.location.hash = toTgAuthResultHash(telegramUser);

    let loggedIn = false;
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/me') {
        return loggedIn
          ? Promise.resolve(STUDENT)
          : Promise.reject(new ApiError('Войдите', 401, 'unauthorized'));
      }
      if (path === '/auth/join/check') return Promise.resolve({ valid: true });
      if (path === '/auth/config')
        return Promise.resolve({ telegramBotId: 123456, emailLoginEnabled: false });
      if (path.startsWith('/auth/telegram')) {
        loggedIn = true;
        return Promise.resolve(STUDENT);
      }
      // Ученик без ролей на /schedule видит StudentScreen (AppShell.tsx) —
      // его собственные эндпоинты, пустые списки.
      if (path.startsWith('/me/')) return Promise.resolve([]);
      return Promise.reject(new Error(`неожиданный путь: ${path}`));
    });

    const violations: string[] = [];
    // Наблюдатель регистрируется ДО render — иначе первый же (уже отрисованный)
    // кадр останется непроверенным, а именно там мог мелькнуть старый экран.
    const observer = new MutationObserver(() => {
      const text = document.body.textContent ?? '';
      for (const pattern of FORBIDDEN_TEXT_PATTERNS) {
        if (pattern.test(text)) violations.push(text);
      }
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    render(
      <MemoryRouter initialEntries={[`/join/${CODE}`]}>
        <App />
      </MemoryRouter>,
    );

    await waitFor(
      () => expect(screen.getByText('Ближайших занятий пока нет.')).toBeInTheDocument(),
      { timeout: 5000 },
    );
    observer.disconnect();

    // Проверка на каждом рендере (observer выше), а не только в финальном
    // DOM — так тест ловит и мелькнувший, и не мелькнувший регресс одинаково.
    expect(violations).toEqual([]);
    expect(mockedApiFetch).toHaveBeenCalledWith(
      `/auth/telegram?join=${CODE}`,
      expect.objectContaining({ method: 'POST' }),
    );
    expect(mockedApiFetch).not.toHaveBeenCalledWith('/auth/join', expect.anything());
  });
});
