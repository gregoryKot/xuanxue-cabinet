// Страница политики конфиденциальности — открыта и гостю, и вошедшему, без
// редиректа в обе стороны (ADR-0145): доступ проверяется на уровне App.tsx
// (маршрут вне RequireAuth), здесь — что текст (privacyPolicyText.ts)
// доезжает до DOM, а раздел «Кто отвечает за данные» берёт имя и контакт из
// GET /auth/config (то, что школа сохранила на экране «Шаблоны», ADR-0155).
// Сеть — mockApiByPath, не очередь `…Once` (ADR-0116).
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { AuthConfigDto } from '@xuanxue/shared';
import { ApiError } from '../api/http';
import type * as HttpModule from '../api/http';
import {
  mockApiByPath,
  mockedApiFetch,
  resetApiFetchBetweenTests,
} from '../test-support/apiFetchMock';
import { PRIVACY_CONTROLLER_TITLE } from './privacyControllerText';
import { PRIVACY_SECTIONS, PRIVACY_TITLE } from './privacyPolicyText';
import PrivacyScreen from './PrivacyScreen';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

const BASE_CONFIG: AuthConfigDto = {
  emailLoginEnabled: false,
  googleLoginEnabled: false,
  fileStorageEnabled: false,
};

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/privacy']}>
      <PrivacyScreen />
    </MemoryRouter>,
  );
}

describe('PrivacyScreen', () => {
  it('рисует заголовок и дату редакции', async () => {
    mockApiByPath({ '/auth/config': BASE_CONFIG });
    renderScreen();

    expect(
      screen.getByRole('heading', { level: 1, name: PRIVACY_TITLE }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Редакция от/)).toBeInTheDocument();
    await screen.findByText(/ещё не указала/);
  });

  it('рисует раздел про ответственного и все разделы политики по заголовкам', async () => {
    mockApiByPath({ '/auth/config': BASE_CONFIG });
    renderScreen();

    expect(
      await screen.findByRole('heading', { level: 2, name: PRIVACY_CONTROLLER_TITLE }),
    ).toBeInTheDocument();
    for (const section of PRIVACY_SECTIONS) {
      expect(
        screen.getByRole('heading', { level: 2, name: section.title }),
      ).toBeInTheDocument();
    }
  });

  // Read-after-write: что школа сохранила в настройках, гость видит на странице.
  it('школа указала ответственного — имя и контакт из /auth/config на странице', async () => {
    mockApiByPath({
      '/auth/config': {
        ...BASE_CONFIG,
        dataControllerName: 'Дмитрий Дейч',
        dataControllerContact: 'privacy@xuanxue.su',
      },
    });
    renderScreen();

    expect(await screen.findByText('Дмитрий Дейч')).toBeInTheDocument();
    expect(screen.getByText('privacy@xuanxue.su')).toBeInTheDocument();
    expect(screen.queryByText(/ещё не указала/)).not.toBeInTheDocument();
  });

  it('школа не указала — честная строка «спросите учителя», без выдуманного имени', async () => {
    mockApiByPath({ '/auth/config': BASE_CONFIG });
    renderScreen();

    expect(await screen.findByText(/ещё не указала/)).toBeInTheDocument();
    expect(screen.getByText('спросите учителя школы').tagName).toBe('STRONG');
    expect(screen.queryByText(/За данные учеников отвечает/)).not.toBeInTheDocument();
  });

  it('пока настройки грузятся — на месте раздела скелетон, остальной текст уже читается', () => {
    mockedApiFetch.mockReturnValue(new Promise(() => {}));
    const { container } = renderScreen();

    expect(
      screen.getByRole('heading', { level: 2, name: PRIVACY_CONTROLLER_TITLE }),
    ).toBeInTheDocument();
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
    expect(
      screen.getByRole('heading', { level: 2, name: 'Ваши права' }),
    ).toBeInTheDocument();
  });

  it('настройки не загрузились — страница остаётся, а раздел отправляет к учителю', async () => {
    mockApiByPath({ '/auth/config': new ApiError('Сервис недоступен', 503, 'unknown') });
    renderScreen();

    expect(await screen.findByText(/Не удалось загрузить/)).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Ваши права' }),
    ).toBeInTheDocument();
  });

  // ADR-0124: акценты `**…**` из текста доезжают до экрана как <strong>, не
  // звёздочками.
  it('акценты текста рисуются через RichText, не звёздочками', async () => {
    mockApiByPath({ '/auth/config': BASE_CONFIG });
    renderScreen();
    await screen.findByText(/ещё не указала/);

    expect(screen.queryByText(/\*\*/)).not.toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 2 }).length).toBe(
      PRIVACY_SECTIONS.length + 1,
    );
    expect(screen.getByText('PostHog (ЕС)').tagName).toBe('STRONG');
  });
});
