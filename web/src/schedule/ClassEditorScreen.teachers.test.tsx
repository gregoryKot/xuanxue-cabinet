// Сбой GET /users/teachers на странице занятия расписания (аудит В4) —
// отдельный файл, чтобы не толкать ClassEditorScreen.test.tsx за 300 строк
// (CLAUDE.md «Файлы»). Список учителей грузит сама страница
// (ClassEditorForm.tsx): его сбой форму не прячет, над select'ом «Ведущий»
// встаёт строка с повтором.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { ClassDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import {
  mockApiByPath,
  mockedApiFetch,
  resetApiFetchBetweenTests,
} from '../test-support/apiFetchMock';
import ClassEditorScreen from './ClassEditorScreen';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

const TEACHERS_ERROR = 'Не удалось загрузить список учителей. Попробуйте ещё раз.';

const CLASS: ClassDto = {
  id: 'c1',
  title: 'Тайцзицюань',
  groupLabel: 'средняя группа',
  format: 'online',
  rules: [{ id: 'r1', weekday: 2, time: '19:00', durationMin: 60 }],
  tz: 'Asia/Jerusalem',
  channelIds: [],
  leadMinutes: 30,
  active: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/schedule/c1']}>
      <Routes>
        <Route path="/schedule" element={<p>Здесь сетка расписания</p>} />
        <Route path="/schedule/:classId" element={<ClassEditorScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ClassEditorScreen — сбой загрузки учителей (аудит В4)', () => {
  it('форма остаётся, у списка учителей — строка с ошибкой и повтор', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../api/http');
    mockApiByPath({
      '/classes/c1': CLASS,
      '/channels': [],
      '/users/teachers': new ApiError(TEACHERS_ERROR, 503, 'unknown'),
    });

    renderScreen();

    expect(await screen.findByRole('alert')).toHaveTextContent(TEACHERS_ERROR);
    expect(screen.getByLabelText('Ведущий')).toBeInTheDocument();
    expect(screen.getByLabelText('Название')).toHaveValue('Тайцзицюань');

    mockApiByPath({
      '/classes/c1': CLASS,
      '/channels': [],
      '/users/teachers': [{ id: 't1', name: 'Дмитрий' }],
    });
    await user.click(screen.getByRole('button', { name: 'Обновить' }));

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(screen.getByRole('option', { name: 'Дмитрий' })).toBeInTheDocument();
  });

  it('выбранный ведущий уходит в leaderId при сохранении', async () => {
    const user = userEvent.setup();
    mockApiByPath({
      '/classes/c1': CLASS,
      '/channels': [],
      '/users/teachers': [{ id: 't1', name: 'Дмитрий' }],
    });

    renderScreen();
    // Учителя приезжают своим запросом уже после первого рендера формы —
    // ждём саму строку списка, а не только поле «Ведущий».
    await screen.findByRole('option', { name: 'Дмитрий' });
    await user.selectOptions(screen.getByLabelText('Ведущий'), 't1');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        '/classes/c1',
        expect.objectContaining({ method: 'PATCH' }),
      ),
    );
    const patch = mockedApiFetch.mock.calls.find(
      (call) => (call[1] as { method?: string } | undefined)?.method === 'PATCH',
    )?.[1] as { body: { leaderId: string } };
    expect(patch.body.leaderId).toBe('t1');
  });
});
