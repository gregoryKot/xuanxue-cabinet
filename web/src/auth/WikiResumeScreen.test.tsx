// Экран `/wiki`: переход внутри приложения заменяется полной загрузкой, а
// страница, открытая сразу на `/wiki`, в петлю не уходит. Ключ записи истории
// 'default' MemoryRouter даёт первой записи — как браузер при открытии
// страницы; запись, на которую перешли (или `initialIndex` не 0), ключ
// получает случайный.
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as TelegramRedirectModule from './telegramAuthRedirect';
import { redirectCurrentTab } from './telegramAuthRedirect';
import WikiResumeScreen from './WikiResumeScreen';

vi.mock('./telegramAuthRedirect', async () => {
  const actual = await vi.importActual<typeof TelegramRedirectModule>(
    './telegramAuthRedirect',
  );
  return { ...actual, redirectCurrentTab: vi.fn() };
});

const redirectSpy = vi.mocked(redirectCurrentTab);
const WIKI_PATH = '/wiki?returnTo=%2Fa';

afterEach(() => {
  redirectSpy.mockClear();
});

function renderAt(entries: string[], initialIndex: number) {
  return render(
    <MemoryRouter initialEntries={entries} initialIndex={initialIndex}>
      <Routes>
        <Route path="/wiki" element={<WikiResumeScreen />} />
        <Route path="*" element={<p>Другой экран</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('WikiResumeScreen', () => {
  it('переход внутри приложения — один полный переход на тот же адрес, без тупика', () => {
    renderAt(['/login', WIKI_PATH], 1);

    expect(redirectSpy).toHaveBeenCalledTimes(1);
    expect(redirectSpy).toHaveBeenCalledWith(WIKI_PATH);
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('страница открылась сразу на /wiki — перехода нет, тупик с действием', () => {
    renderAt([WIKI_PATH], 0);

    expect(redirectSpy).not.toHaveBeenCalled();
    expect(
      screen.getByRole('heading', { name: 'Не получилось открыть страницу' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Откройте её ещё раз из wiki.');
  });
});
