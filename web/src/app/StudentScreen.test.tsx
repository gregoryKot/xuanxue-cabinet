// Тонкая сборка экрана ученика (ТЗ student-screen.md): расписание рисует
// StudentLessonsScreen (своя проверка — student/StudentLessonsScreen.test.tsx),
// здесь — только ссылка на сайт школы поверх него. Два запроса сразу
// (/auth/config, /me/lessons) — mockApiByPath, а не очередь
// mockResolvedValueOnce (test-support/apiFetchMock.ts: порядок запросов
// зависит от порядка хуков).
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type * as HttpModule from '../api/http';
import { mockApiByPath, resetApiFetchBetweenTests } from '../test-support/apiFetchMock';
import { StudentScreen } from './StudentScreen';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

function renderStudent(config: Record<string, unknown>) {
  mockApiByPath({ '/auth/config': config, '/me/lessons': [] });
  return render(<StudentScreen />);
}

describe('StudentScreen', () => {
  it('учитель заполнил адрес сайта школы — ссылка ниже расписания', async () => {
    renderStudent({ schoolSiteUrl: 'https://xuanxue.su' });

    expect(await screen.findByText('Ближайших занятий пока нет.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'https://xuanxue.su' })).toHaveAttribute(
      'href',
      'https://xuanxue.su',
    );
  });

  it('без адреса сайта школы — без ссылки', async () => {
    renderStudent({});

    expect(await screen.findByText('Ближайших занятий пока нет.')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
