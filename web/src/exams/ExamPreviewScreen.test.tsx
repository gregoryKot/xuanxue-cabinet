// Страница предпросмотра экзамена «глазами ученика» —
// `/exams/:examId/preview` (ADR-0033, ТЗ 4.3). Мок сети — по префиксу пути
// (test-support/apiFetchMock.ts), как у ExamEditorScreen.test.tsx.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { ExamDto, ExamItemDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { mockApiByPath, resetApiFetchBetweenTests } from '../test-support/apiFetchMock';
import ExamPreviewScreen from './ExamPreviewScreen';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

const EDITOR_MARKER = 'Здесь редактор экзамена';

function makeExam(overrides: Partial<ExamDto> = {}): ExamDto {
  return {
    id: 'x1',
    title: 'Итоговый экзамен',
    description: 'Что вы умеете после первого года',
    level: '',
    blocks: [{ id: 'b1', title: '', itemIds: ['i1', 'i2'], shuffle: false }],
    shuffleOptions: false,
    rubric: [],
    attemptsAllowed: 2,
    status: 'draft',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeItem(overrides: Partial<ExamItemDto> = {}): ExamItemDto {
  return {
    id: 'i1',
    kind: 'text',
    prompt: 'Опишите принцип песчинки',
    options: [],
    tags: [],
    status: 'published',
    version: 1,
    history: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const BANK = [
  makeItem({ id: 'i1', prompt: 'Первый вопрос' }),
  makeItem({ id: 'i2', prompt: 'Второй вопрос' }),
];

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/exams/:examId" element={<p>{EDITOR_MARKER}</p>} />
        <Route path="/exams/:examId/preview" element={<ExamPreviewScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

function mockExamAndBank(exam: ExamDto, bank: ExamItemDto[] = BANK) {
  mockApiByPath({ '/exams/x1': exam, '/exam-items': bank });
}

describe('ExamPreviewScreen — загрузка', () => {
  it('пока грузится — скелетон, не пустой экран', () => {
    mockApiByPath({ '/exams/x1': new Promise(() => {}), '/exam-items': BANK });

    const { container } = renderAt('/exams/x1/preview');

    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
  });

  it('сбой загрузки экзамена — баннер ошибки, повтор показывает заголовок', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../api/http');
    mockApiByPath({
      '/exams/x1': new ApiError('Сервис недоступен', 503, 'unknown'),
      '/exam-items': BANK,
    });

    renderAt('/exams/x1/preview');

    expect(await screen.findByRole('alert')).toHaveTextContent('Сервис недоступен');

    mockExamAndBank(makeExam());
    await user.click(screen.getByRole('button', { name: 'Попробовать ещё раз' }));

    expect(
      await screen.findByRole('heading', { name: 'Итоговый экзамен' }),
    ).toBeVisible();
  });

  it('сбой загрузки банка — тот же баннер, а не «Вопрос недоступен»', async () => {
    const { ApiError } = await import('../api/http');
    mockApiByPath({
      '/exams/x1': makeExam(),
      '/exam-items': new ApiError('Банк недоступен', 503, 'unknown'),
    });

    renderAt('/exams/x1/preview');

    expect(await screen.findByRole('alert')).toHaveTextContent('Банк недоступен');
    expect(screen.queryByText(/Вопрос недоступен/)).not.toBeInTheDocument();
  });
});

describe('ExamPreviewScreen — облик', () => {
  it('рубрика «Глазами ученика», заголовок — название экзамена, описание видно', async () => {
    mockExamAndBank(makeExam());

    renderAt('/exams/x1/preview');

    expect(await screen.findByText('Глазами ученика')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Итоговый экзамен' })).toBeInTheDocument();
    expect(screen.getByText('Что вы умеете после первого года')).toBeInTheDocument();
  });

  it('без описания — абзаца описания нет', async () => {
    mockExamAndBank(makeExam({ description: '' }));

    renderAt('/exams/x1/preview');

    await screen.findByRole('heading', { name: 'Итоговый экзамен' });
    expect(
      screen.queryByText('Что вы умеете после первого года'),
    ).not.toBeInTheDocument();
  });

  it('текст «ничего не сохраняется» есть, кнопок сохранения и диалога нет', async () => {
    mockExamAndBank(makeExam());

    renderAt('/exams/x1/preview');

    expect(await screen.findByText(/здесь ничего не сохраняется/)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Сохранить|Отправить|Закрыть/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('«К экзамену» — ссылка на страницу экзамена, клик возвращает к редактору', async () => {
    const user = userEvent.setup();
    mockExamAndBank(makeExam());

    renderAt('/exams/x1/preview');
    const back = await screen.findByRole('link', { name: 'К экзамену' });
    expect(back).toHaveAttribute('href', '/exams/x1');

    await user.click(back);

    expect(screen.getByText(EDITOR_MARKER)).toBeInTheDocument();
  });
});

describe('ExamPreviewScreen — вопросы', () => {
  it('вопросы идут в порядке itemIds экзамена, а не банка', async () => {
    mockExamAndBank(
      makeExam({
        blocks: [{ id: 'b1', title: '', itemIds: ['i2', 'i1'], shuffle: false }],
      }),
    );

    renderAt('/exams/x1/preview');

    const rows = await screen.findAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Второй вопрос');
    expect(rows[1]).toHaveTextContent('Первый вопрос');
  });

  it('старая многоблочная форма — вопросы обоих блоков подряд', async () => {
    mockExamAndBank(
      makeExam({
        blocks: [
          { id: 'b1', title: 'Теория', itemIds: ['i1'], shuffle: false },
          { id: 'b2', title: 'Форма', itemIds: ['i2'], shuffle: false },
        ],
      }),
    );

    renderAt('/exams/x1/preview');

    const rows = await screen.findAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Первый вопрос');
    expect(rows[1]).toHaveTextContent('Второй вопрос');
  });

  it('перемешивание вопросов и вариантов — заметки о каждом', async () => {
    mockExamAndBank(
      makeExam({
        blocks: [{ id: 'b1', title: '', itemIds: ['i1'], shuffle: true }],
        shuffleOptions: true,
      }),
    );

    renderAt('/exams/x1/preview');

    expect(await screen.findByText(/Порядок вопросов будет другим/)).toBeInTheDocument();
    expect(screen.getByText(/Варианты ответа тоже встанут/)).toBeInTheDocument();
  });

  it('без перемешивания — заметок нет', async () => {
    mockExamAndBank(makeExam());

    renderAt('/exams/x1/preview');

    await screen.findByRole('heading', { name: 'Итоговый экзамен' });
    expect(
      screen.queryByText(/другом порядке|будет другим|встанут/),
    ).not.toBeInTheDocument();
  });

  it('без вопросов — «пока нет вопросов»', async () => {
    mockExamAndBank(makeExam({ blocks: [] }));

    renderAt('/exams/x1/preview');

    expect(await screen.findByText(/пока нет вопросов/)).toBeInTheDocument();
  });

  it('single — все radio disabled, тексты вариантов видны', async () => {
    mockExamAndBank(
      makeExam({ blocks: [{ id: 'b1', title: '', itemIds: ['i1'], shuffle: false }] }),
      [
        makeItem({
          id: 'i1',
          kind: 'single',
          options: [
            { id: 'o1', text: '24', correct: true },
            { id: 'o2', text: '108', correct: false },
          ],
        }),
      ],
    );

    renderAt('/exams/x1/preview');

    const radios = await screen.findAllByRole('radio');
    expect(radios).toHaveLength(2);
    radios.forEach((radio) => expect(radio).toBeDisabled());
    expect(screen.getByText('24')).toBeInTheDocument();
  });

  it('multiple — checkbox disabled', async () => {
    mockExamAndBank(
      makeExam({ blocks: [{ id: 'b1', title: '', itemIds: ['i1'], shuffle: false }] }),
      [
        makeItem({
          id: 'i1',
          kind: 'multiple',
          options: [{ id: 'o1', text: 'Правильно', correct: true }],
        }),
      ],
    );

    renderAt('/exams/x1/preview');

    const checkbox = await screen.findByRole('checkbox');
    expect(checkbox).toBeDisabled();
  });

  it('text — textarea disabled, доступное имя — формулировка вопроса', async () => {
    mockExamAndBank(
      makeExam({ blocks: [{ id: 'b1', title: '', itemIds: ['i1'], shuffle: false }] }),
      [makeItem({ id: 'i1', kind: 'text', prompt: 'Опишите принцип песчинки' })],
    );

    renderAt('/exams/x1/preview');

    expect(
      await screen.findByRole('textbox', { name: 'Опишите принцип песчинки' }),
    ).toBeDisabled();
  });

  it('video — текст «пришлёте боту»', async () => {
    mockExamAndBank(
      makeExam({ blocks: [{ id: 'b1', title: '', itemIds: ['i1'], shuffle: false }] }),
      [makeItem({ id: 'i1', kind: 'video' })],
    );

    renderAt('/exams/x1/preview');

    expect(await screen.findByText(/пришлёте боту/)).toBeInTheDocument();
  });

  it('вопрос с подсказкой — подсказка видна', async () => {
    mockExamAndBank(
      makeExam({ blocks: [{ id: 'b1', title: '', itemIds: ['i1'], shuffle: false }] }),
      [makeItem({ id: 'i1', hint: 'Смотрите в стойку' })],
    );

    renderAt('/exams/x1/preview');

    expect(await screen.findByText('Смотрите в стойку')).toBeInTheDocument();
  });

  it('вопрос не из банка — «Вопрос недоступен»', async () => {
    mockExamAndBank(
      makeExam({ blocks: [{ id: 'b1', title: '', itemIds: ['gone'], shuffle: false }] }),
    );

    renderAt('/exams/x1/preview');

    expect(await screen.findByText(/Вопрос недоступен/)).toBeInTheDocument();
  });
});
