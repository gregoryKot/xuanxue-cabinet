// Сборка экрана ученика (ТЗ student-screen.md, student-exams.md): занятия и
// экзамены рисуют свои разделы (проверки — в student/), здесь — приветствие
// по имени, заголовок раздела и ссылка на сайт школы поверх них. Четыре
// запроса сразу (/auth/me, /auth/config, /me/lessons, /me/exams) —
// mockApiByPath, а не очередь mockResolvedValueOnce (test-support/
// apiFetchMock.ts: порядок запросов зависит от порядка хуков).
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { MeDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { AuthProvider } from '../auth/AuthProvider';
import { mockApiByPath, resetApiFetchBetweenTests } from '../test-support/apiFetchMock';
import { StudentScreen } from './StudentScreen';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

const STUDENT: MeDto = {
  id: 's1',
  name: 'Мария',
  roles: [],
  tz: 'Asia/Jerusalem',
  status: 'active',
  telegramLinked: false,
};

function renderStudent(config: Record<string, unknown>, me: MeDto | Error = STUDENT) {
  mockApiByPath({
    '/auth/me': me,
    '/auth/config': config,
    '/me/lessons': [],
    '/me/exams': [],
  });
  // MemoryRouter — StudentExamsSection зовёт useNavigate (переход на экран
  // сдачи после старта попытки), которому нужен контекст роутера.
  return render(
    <MemoryRouter>
      <AuthProvider>
        <StudentScreen />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('StudentScreen', () => {
  it('здоровается по имени и называет раздел заголовком', async () => {
    renderStudent({});

    expect(await screen.findByText('Здравствуйте, Мария')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Ближайшее занятие' }),
    ).toBeInTheDocument();
    // Чей это час — сказано прямо: школа может жить в другом поясе
    // (CLAUDE.md «Время»).
    expect(screen.getByText('Время — по вашим часам.')).toBeInTheDocument();
  });

  it('имени ещё нет — здороваемся без него, без прочерка', async () => {
    renderStudent({}, new Error('нет сессии'));

    expect(await screen.findByText('Здравствуйте')).toBeInTheDocument();
  });

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
