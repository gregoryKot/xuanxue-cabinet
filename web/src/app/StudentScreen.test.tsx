// Тонкая сборка экрана ученика (ТЗ student-screen.md, student-exams.md):
// расписание и экзамены рисуют свои разделы (проверки — в student/), здесь —
// только ссылка на сайт школы поверх них. Три запроса сразу (/auth/config,
// /me/lessons, /me/exams) — mockApiByPath, а не очередь mockResolvedValueOnce
// (test-support/apiFetchMock.ts: порядок запросов зависит от порядка хуков).
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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
  mockApiByPath({ '/auth/config': config, '/me/lessons': [], '/me/exams': [] });
  // MemoryRouter — StudentExamsSection зовёт useNavigate (переход на экран
  // сдачи после старта попытки), которому нужен контекст роутера.
  return render(
    <MemoryRouter>
      <StudentScreen />
    </MemoryRouter>,
  );
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
