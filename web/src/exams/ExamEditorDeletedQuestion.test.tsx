// Отдельный файл, а не правка ExamEditorScreen.test.tsx (уже на пределе,
// храповик размера файлов не даёт таким расти) — новый случай мягкого
// удаления вопроса из банка (ADR-0140): редактор экзамена должен видеть
// вопрос, который уже стоит в форме, даже если его убрали из банка, а поиск
// такой вопрос предлагать не должен.
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExamDto, ExamItemDto } from '@xuanxue/shared';
import { EXAM_EDITOR_ITEMS_PATH } from '../api/apiPaths';
import type * as HttpModule from '../api/http';
import { mockApiByPath, resetApiFetchBetweenTests } from '../test-support/apiFetchMock';
import ExamEditorScreen from './ExamEditorScreen';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

afterEach(() => {
  localStorage.clear();
});

const exam: ExamDto = {
  id: 'x1',
  title: 'Первый уровень',
  description: '',
  level: '',
  blocks: [{ id: 'b1', title: '', itemIds: ['i1', 'iDeleted'], shuffle: false }],
  shuffleOptions: false,
  attemptsAllowed: 2,
  status: 'draft',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function item(overrides: Partial<ExamItemDto> = {}): ExamItemDto {
  return {
    id: 'i1',
    kind: 'text',
    prompt: 'Живой вопрос',
    options: [],
    status: 'published',
    version: 1,
    history: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const BANK = [
  item({ id: 'i1', prompt: 'Живой вопрос' }),
  item({ id: 'iDeleted', prompt: 'Удалённый вопрос', deletedAt: '2026-09-27T00:00:00Z' }),
  item({ id: 'iOther', prompt: 'Другой живой вопрос' }),
];

function renderExam() {
  // Ключ мока — ровно путь, который зовёт экран (EXAM_EDITOR_ITEMS_PATH, тот же
  // includeDeleted): не общий префикс '/exam-items', а его нет вовсе — если
  // экран забыл includeDeleted, mockApiByPath не найдёт ответ, и запрос
  // упадёт «неожиданный путь», а не молча вернёт список без удалённого.
  mockApiByPath({
    '/exams/x1/attempt-count': { total: 0 },
    '/exams/x1': exam,
    [EXAM_EDITOR_ITEMS_PATH]: BANK,
    '/exams': exam,
  });
  return render(
    <MemoryRouter initialEntries={['/exams/x1']}>
      <Routes>
        <Route path="/exams/:examId" element={<ExamEditorScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ExamEditorForm — вопрос, удалённый из банка (ADR-0140)', () => {
  it('виден в списке экзамена со служебной строкой «удалён из списка вопросов»', async () => {
    renderExam();

    expect(await screen.findByText('Удалённый вопрос')).toBeInTheDocument();
    expect(screen.getByText(/удалён из списка вопросов/)).toBeInTheDocument();
  });

  it('поиск не предлагает его — только другой живой вопрос', async () => {
    renderExam();
    // findByText бросит на «нашлось больше одного», если бы поиск тоже
    // показывал этот вопрос второй строкой рядом с «Добавить».
    await screen.findByText('Удалённый вопрос');

    expect(screen.getByText('Другой живой вопрос')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Добавить' })).toBeInTheDocument();
  });
});
