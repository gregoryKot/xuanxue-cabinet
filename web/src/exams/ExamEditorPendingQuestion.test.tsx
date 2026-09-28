// «Сохранить» экзамена при раскрытой форме вопроса (usePendingQuestion.ts).
// Регрессия отзыва владельца 2026-09-28: «загрузил видео в вопрос, нажал
// сохранить — вопрос не добавился» — экзамен уходил на сервер без вопроса, а
// форма вопроса пропадала вместе со страницей. Отдельный файл, а не правка
// ExamEditorScreen.test.tsx — тот и так больше тысячи строк.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExamDto, ExamItemDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { mockedApiFetch, resetApiFetchBetweenTests } from '../test-support/apiFetchMock';
import ExamEditorScreen from './ExamEditorScreen';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

afterEach(() => {
  localStorage.clear();
  Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
});

const LIST_MARKER = 'Здесь список экзаменов';

const exam: ExamDto = {
  id: 'x1',
  title: 'Первый уровень',
  description: '',
  level: '',
  blocks: [{ id: 'b1', title: '', itemIds: ['i1'], shuffle: false }],
  shuffleOptions: false,
  attemptsAllowed: 2,
  status: 'draft',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function makeItem(overrides: Partial<ExamItemDto> = {}): ExamItemDto {
  return {
    id: 'i1',
    kind: 'text',
    prompt: 'Зачем придумали тайцзи?',
    options: [],
    status: 'published',
    version: 1,
    history: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const created = makeItem({ id: 'new1', prompt: 'Как дышать в стойке?' });

// Ответ по пути и методу, не очередью `…Once` (ADR-0116).
function mockNetwork(): void {
  mockedApiFetch.mockImplementation((path: string, init?: { method?: string }) => {
    const method = init?.method ?? 'GET';
    if (path === '/exams/x1/attempt-count') return Promise.resolve({ total: 0 });
    if (path === '/exams/x1') return Promise.resolve(exam);
    if (path === '/exam-items' && method === 'POST') return Promise.resolve(created);
    if (path === '/exam-items/i1' && method === 'PATCH') {
      return Promise.resolve(makeItem({ prompt: 'Зачем нужна форма?' }));
    }
    if (path.startsWith('/exam-items')) return Promise.resolve([makeItem()]);
    return Promise.reject(new Error(`неожиданный путь: ${path} ${method}`));
  });
}

function renderExam() {
  mockNetwork();
  return render(
    <MemoryRouter initialEntries={['/exams/x1']}>
      <Routes>
        <Route path="/exams" element={<p>{LIST_MARKER}</p>} />
        <Route path="/exams/:examId" element={<ExamEditorScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

function callsTo(path: string, method: string) {
  return mockedApiFetch.mock.calls.filter(
    ([p, init]) =>
      p === path && (init as { method?: string } | undefined)?.method === method,
  );
}

function examPatchBody(): { blocks: { itemIds: string[] }[]; status?: string } {
  const call = callsTo('/exams/x1', 'PATCH')[0];
  return (call?.[1] as { body: { blocks: { itemIds: string[] }[]; status?: string } })
    .body;
}

async function saveExam(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  const buttons = await screen.findAllByRole('button', { name: 'Сохранить' });
  await user.click(buttons[0] as HTMLElement);
}

describe('ExamEditorForm — «Сохранить» при раскрытой форме нового вопроса', () => {
  it('вопрос сохраняется и попадает в экзамен, страница уходит на список', async () => {
    const user = userEvent.setup();
    renderExam();

    await user.click(await screen.findByRole('button', { name: 'Новый вопрос' }));
    await user.type(screen.getByLabelText('Формулировка'), 'Как дышать в стойке?');
    await saveExam(user);

    expect(await screen.findByText(LIST_MARKER)).toBeInTheDocument();
    expect(callsTo('/exam-items', 'POST')).toHaveLength(1);
    expect(examPatchBody().blocks[0]?.itemIds).toEqual(['i1', 'new1']);
  });

  it('форма пустая — экзамен сохраняется как был, лишнего вопроса нет', async () => {
    const user = userEvent.setup();
    renderExam();

    await user.click(await screen.findByRole('button', { name: 'Новый вопрос' }));
    await saveExam(user);

    expect(await screen.findByText(LIST_MARKER)).toBeInTheDocument();
    expect(callsTo('/exam-items', 'POST')).toHaveLength(0);
    expect(examPatchBody().blocks[0]?.itemIds).toEqual(['i1']);
  });

  it('вопрос не прошёл проверку — экзамен не сохраняется, ошибка у формы вопроса', async () => {
    const user = userEvent.setup();
    Element.prototype.scrollIntoView = vi.fn();
    renderExam();

    await user.click(await screen.findByRole('button', { name: 'Новый вопрос' }));
    await user.click(screen.getByLabelText('Один правильный вариант'));
    await saveExam(user);

    expect(await screen.findByText('Впишите формулировку вопроса.')).toBeInTheDocument();
    expect(callsTo('/exam-items', 'POST')).toHaveLength(0);
    expect(callsTo('/exams/x1', 'PATCH')).toHaveLength(0);
    expect(screen.queryByText(LIST_MARKER)).not.toBeInTheDocument();
  });

  it('«Опубликовать» тоже забирает раскрытый вопрос в экзамен', async () => {
    const user = userEvent.setup();
    renderExam();

    await user.click(await screen.findByRole('button', { name: 'Новый вопрос' }));
    await user.type(screen.getByLabelText('Формулировка'), 'Как дышать в стойке?');
    await user.click(screen.getByRole('button', { name: 'Опубликовать' }));

    expect(await screen.findByText(LIST_MARKER)).toBeInTheDocument();
    expect(examPatchBody()).toMatchObject({ status: 'published' });
    expect(examPatchBody().blocks[0]?.itemIds).toEqual(['i1', 'new1']);
  });
});

describe('ExamEditorForm — «Сохранить» при раскрытой правке вопроса', () => {
  it('правка вопроса уходит на сервер до сохранения экзамена', async () => {
    const user = userEvent.setup();
    renderExam();

    await user.click(
      await screen.findByRole('button', { name: 'Зачем придумали тайцзи?' }),
    );
    await user.click(screen.getByRole('button', { name: 'Изменить' }));
    const promptField = screen.getByLabelText('Формулировка');
    await user.clear(promptField);
    await user.type(promptField, 'Зачем нужна форма?');
    await saveExam(user);

    expect(await screen.findByText(LIST_MARKER)).toBeInTheDocument();
    await waitFor(() => expect(callsTo('/exam-items/i1', 'PATCH')).toHaveLength(1));
    expect(examPatchBody().blocks[0]?.itemIds).toEqual(['i1']);
  });
});
