// Страница «Доступность» — открыта и гостю, и вошедшему (доступ проверяет
// App.test.tsx: маршрут вне RequireAuth). Здесь — что текст доезжает до DOM, а
// раздел «Как сообщить о проблеме» берёт имя и контакт из GET /auth/config: то,
// что школа сохранила на экране «Шаблоны» (ADR-0155, ADR-0158). Сеть —
// mockApiByPath, не очередь `…Once` (ADR-0116).
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthConfigDto } from '@xuanxue/shared';
import { ApiError } from '../api/http';
import type * as HttpModule from '../api/http';
import {
  mockApiByPath,
  mockedApiFetch,
  resetApiFetchBetweenTests,
} from '../test-support/apiFetchMock';
import {
  ACCESSIBILITY_CONTACT_TITLE,
  ACCESSIBILITY_SECTIONS,
  ACCESSIBILITY_TITLE,
} from './accessibilityText';
import AccessibilityScreen from './AccessibilityScreen';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

const BASE_TITLE = 'Сюань-Сюэ';

afterEach(() => {
  document.title = BASE_TITLE;
});

const BASE_CONFIG: AuthConfigDto = {
  emailLoginEnabled: false,
  googleLoginEnabled: false,
  fileStorageEnabled: false,
};

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/accessibility']}>
      <AccessibilityScreen />
    </MemoryRouter>,
  );
}

describe('AccessibilityScreen', () => {
  it('рисует заголовок, дату редакции и название вкладки', async () => {
    mockApiByPath({ '/auth/config': BASE_CONFIG });
    renderScreen();

    expect(
      screen.getByRole('heading', { level: 1, name: ACCESSIBILITY_TITLE }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Редакция от/)).toBeInTheDocument();
    expect(document.title).toBe(`${ACCESSIBILITY_TITLE} — ${BASE_TITLE}`);
    await screen.findByText(/ещё не указала/);
  });

  it('рисует раздел про контакт и все разделы заявления по заголовкам', async () => {
    mockApiByPath({ '/auth/config': BASE_CONFIG });
    renderScreen();

    expect(
      await screen.findByRole('heading', { level: 2, name: ACCESSIBILITY_CONTACT_TITLE }),
    ).toBeInTheDocument();
    for (const section of ACCESSIBILITY_SECTIONS) {
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
    expect(screen.getByText('privacy@xuanxue.su').tagName).toBe('STRONG');
    expect(screen.queryByText(/ещё не указала/)).not.toBeInTheDocument();
  });

  it('контакт — ссылка: рисуется ссылкой, звёздочек на экране нет', async () => {
    mockApiByPath({
      '/auth/config': { ...BASE_CONFIG, dataControllerContact: 'https://t.me/xuanxue' },
    });
    renderScreen();

    expect(
      await screen.findByRole('link', { name: 'https://t.me/xuanxue' }),
    ).toHaveAttribute('href', 'https://t.me/xuanxue');
    expect(screen.queryByText(/\*\*/)).not.toBeInTheDocument();
  });

  it('школа не указала — честная строка «напишите учителю», без выдуманного адреса', async () => {
    mockApiByPath({ '/auth/config': BASE_CONFIG });
    renderScreen();

    expect(await screen.findByText(/ещё не указала/)).toBeInTheDocument();
    expect(screen.getByText('напишите учителю школы').tagName).toBe('STRONG');
    expect(screen.queryByText(/Сообщения принимает/)).not.toBeInTheDocument();
  });

  it('пока настройки грузятся — на месте раздела скелетон, остальной текст уже читается', () => {
    mockedApiFetch.mockReturnValue(new Promise(() => {}));
    const { container } = renderScreen();

    expect(
      screen.getByRole('heading', { level: 2, name: ACCESSIBILITY_CONTACT_TITLE }),
    ).toBeInTheDocument();
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
    expect(
      screen.getByRole('heading', { level: 2, name: 'Что пока не получается' }),
    ).toBeInTheDocument();
  });

  it('настройки не загрузились — страница остаётся, а раздел отправляет к учителю', async () => {
    mockApiByPath({ '/auth/config': new ApiError('Сервис недоступен', 503, 'unknown') });
    renderScreen();

    expect(await screen.findByText(/Не удалось загрузить/)).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Что сделано' }),
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
      ACCESSIBILITY_SECTIONS.length + 1,
    );
    expect(screen.getByText('Субтитров у записей нет').tagName).toBe('STRONG');
  });

  it('внизу — ссылка на политику конфиденциальности, вторая юридическая страница рядом', async () => {
    mockApiByPath({ '/auth/config': BASE_CONFIG });
    renderScreen();
    await screen.findByText(/ещё не указала/);

    expect(
      screen.getByRole('link', { name: 'Политика конфиденциальности' }),
    ).toHaveAttribute('href', '/privacy');
  });

  it('ссылка «Перейти к содержимому» есть: страница собрана в общей колонке', async () => {
    mockApiByPath({ '/auth/config': BASE_CONFIG });
    renderScreen();
    await screen.findByText(/ещё не указала/);

    expect(
      screen.getByRole('link', { name: 'Перейти к содержимому' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
  });
});
