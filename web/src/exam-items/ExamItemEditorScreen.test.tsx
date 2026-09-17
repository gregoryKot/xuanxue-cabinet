// Страница вопроса целиком: загрузка, тип ответа, поля, варианты, подвал со
// статусом и удалением, статистика (ADR-0033). Мок сети — по префиксу пути
// (test-support/apiFetchMock.ts); `/exam-items/e1/stats` стоит раньше
// `/exam-items/e1`, mockApiByPath матчит первым подходящим префиксом.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { ExamItemDto, ExamItemStatsDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import {
  mockApiByPath,
  mockedApiFetch,
  resetApiFetchBetweenTests,
} from '../test-support/apiFetchMock';
import ExamItemEditorScreen from './ExamItemEditorScreen';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

const LIST_MARKER = 'Здесь список вопросов';

function makeItem(overrides: Partial<ExamItemDto> = {}): ExamItemDto {
  return {
    id: 'e1',
    kind: 'single',
    prompt: 'Сколько форм в стиле Ян?',
    options: [
      { id: 'o1', text: '24', correct: true },
      { id: 'o2', text: '108', correct: false },
    ],
    tags: ['ян'],
    status: 'draft',
    version: 1,
    history: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const EMPTY_STATS: ExamItemStatsDto = {
  itemId: 'e1',
  kind: 'single',
  askedCount: 0,
  usedInExamsCount: 0,
};

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/exam-items" element={<p>{LIST_MARKER}</p>} />
        <Route path="/exam-items/new" element={<ExamItemEditorScreen />} />
        <Route path="/exam-items/:itemId" element={<ExamItemEditorScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

function mockItemAndStats(item: ExamItemDto) {
  mockApiByPath({
    '/exam-items/e1/stats': EMPTY_STATS,
    '/exam-items/e1': item,
    '/exam-items': item,
  });
}

/** Форма появляется раньше, чем уйдёт запрос статистики (эффект после
 * коммита): отказ, поставленный в очередь сразу после формы, достался бы не
 * сохранению. Ждём строку статистики — значит, оба запроса монтирования уже
 * ушли. */
async function waitForMounted() {
  await screen.findByText('Этот вопрос ещё никому не задавали.');
}

function callsWithMethod(method: string) {
  return mockedApiFetch.mock.calls.filter(
    (call) => (call[1] as { method?: string } | undefined)?.method === method,
  );
}

describe('ExamItemEditorScreen — загрузка', () => {
  it('вопрос ещё грузится — скелетон, а не пустой экран', () => {
    mockApiByPath({ '/exam-items/e1': new Promise(() => {}) });

    const { container } = renderAt('/exam-items/e1');

    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
  });

  it('сбой загрузки — текст ошибки и повтор', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../api/http');
    mockApiByPath({
      '/exam-items/e1': new ApiError('Сервис недоступен', 503, 'unknown'),
    });

    renderAt('/exam-items/e1');

    expect(await screen.findByRole('alert')).toHaveTextContent('Сервис недоступен');

    mockItemAndStats(makeItem());
    await user.click(screen.getByRole('button', { name: 'Попробовать ещё раз' }));

    expect(
      await screen.findByRole('heading', { name: 'Сколько форм в стиле Ян?' }),
    ).toBeVisible();
  });

  it('/exam-items/new — заголовок «Новый вопрос», запроса за вопросом нет', async () => {
    mockApiByPath({ '/exam-items': makeItem() });

    renderAt('/exam-items/new');

    expect(
      await screen.findByRole('heading', { name: 'Новый вопрос' }),
    ).toBeInTheDocument();
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it('длинная формулировка — в заголовке первые слова', async () => {
    mockItemAndStats(
      makeItem({
        prompt: 'Опишите ощущение в пояснице при сидении и объясните, зачем оно нужно',
      }),
    );

    renderAt('/exam-items/e1');

    expect(
      await screen.findByRole('heading', {
        name: 'Опишите ощущение в пояснице при сидении…',
      }),
    ).toBeInTheDocument();
  });
});

describe('ExamItemEditorScreen — тип ответа', () => {
  it('новый вопрос — переключатели с объяснением, по умолчанию свободный ответ', async () => {
    mockApiByPath({ '/exam-items': makeItem() });

    renderAt('/exam-items/new');

    expect(await screen.findByLabelText('Свободный ответ')).toBeChecked();
    expect(screen.getByLabelText('Один правильный вариант')).not.toBeChecked();
    expect(
      screen.getByText('Ученик отмечает один вариант — ответ сверяется сам.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Варианты ответа')).not.toBeInTheDocument();
  });

  it('выбор «Один правильный вариант» открывает варианты и уходит в тело запроса', async () => {
    const user = userEvent.setup();
    mockApiByPath({ '/exam-items': makeItem() });

    renderAt('/exam-items/new');
    await user.click(await screen.findByLabelText('Один правильный вариант'));
    await user.type(screen.getByLabelText('Формулировка'), 'Сколько форм?');
    await user.click(screen.getByRole('button', { name: 'Добавить вариант' }));
    await user.click(screen.getByRole('button', { name: 'Добавить вариант' }));
    await user.type(screen.getByLabelText('Текст варианта 1'), '24');
    await user.type(screen.getByLabelText('Текст варианта 2'), '108');
    await user.click(screen.getByLabelText('Верный вариант 1'));
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(callsWithMethod('POST')).toHaveLength(1));
    const body = callsWithMethod('POST')[0]?.[1] as {
      body: { kind: string; options: unknown[] };
    };
    expect(body.body.kind).toBe('single');
    expect(body.body.options).toEqual([
      { id: undefined, text: '24', correct: true },
      { id: undefined, text: '108', correct: false },
    ]);
    expect(await screen.findByText(LIST_MARKER)).toBeInTheDocument();
  });

  it('существующий вопрос — тип строкой, переключателей нет', async () => {
    mockItemAndStats(makeItem());

    renderAt('/exam-items/e1');

    expect(
      await screen.findByText(/Тип ответа: Один правильный вариант/),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Свободный ответ')).not.toBeInTheDocument();
  });
});

describe('ExamItemEditorScreen — поля', () => {
  it('поля заполнены из ответа сервера', async () => {
    mockItemAndStats(makeItem({ hint: 'Смотрите в стойку', criteria: 'Названо число' }));

    renderAt('/exam-items/e1');

    expect(await screen.findByLabelText('Формулировка')).toHaveValue(
      'Сколько форм в стиле Ян?',
    );
    expect(screen.getByLabelText('Подсказка')).toHaveValue('Смотрите в стойку');
    expect(screen.getByLabelText('Критерии проверки')).toHaveValue('Названо число');
    expect(screen.getByLabelText('Теги')).toHaveValue('ян');
    expect(screen.getByLabelText('Текст варианта 1')).toHaveValue('24');
  });

  it('правки полей уходят в тело сохранения', async () => {
    const user = userEvent.setup();
    mockItemAndStats(makeItem());

    renderAt('/exam-items/e1');
    await user.clear(await screen.findByLabelText('Формулировка'));
    await user.type(screen.getByLabelText('Формулировка'), 'Новая формулировка');
    await user.type(screen.getByLabelText('Подсказка'), 'Смотрите в стойку');
    await user.type(screen.getByLabelText('Критерии проверки'), 'Названо число');
    await user.clear(screen.getByLabelText('Теги'));
    await user.type(screen.getByLabelText('Теги'), 'ян, база');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(callsWithMethod('PATCH')).toHaveLength(1));
    const body = callsWithMethod('PATCH')[0]?.[1] as {
      body: { prompt: string; hint: string; criteria: string; tags: string[] };
    };
    expect(body.body.prompt).toBe('Новая формулировка');
    expect(body.body.hint).toBe('Смотрите в стойку');
    expect(body.body.criteria).toBe('Названо число');
    expect(body.body.tags).toEqual(['ян', 'база']);
    expect(await screen.findByText(LIST_MARKER)).toBeInTheDocument();
  });

  it('пустая формулировка — ошибка формы, запроса нет', async () => {
    const user = userEvent.setup();
    mockItemAndStats(makeItem({ prompt: '' }));

    renderAt('/exam-items/e1');
    await screen.findByLabelText('Формулировка');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('формулировку вопроса');
    expect(callsWithMethod('PATCH')).toHaveLength(0);
  });

  it('опубликованный — предупреждение про версию видно до сохранения', async () => {
    mockItemAndStats(makeItem({ status: 'published' }));

    renderAt('/exam-items/e1');

    expect(await screen.findByText(/обновит версию вопроса/)).toBeInTheDocument();
  });

  it('черновик — предупреждения про версию нет', async () => {
    mockItemAndStats(makeItem({ status: 'draft' }));

    renderAt('/exam-items/e1');
    await screen.findByLabelText('Формулировка');

    expect(screen.queryByText(/обновит версию вопроса/)).not.toBeInTheDocument();
  });

  it('ошибка сервера показывается как есть, страница остаётся', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../api/http');
    mockItemAndStats(makeItem());

    renderAt('/exam-items/e1');
    await waitForMounted();
    mockedApiFetch.mockRejectedValueOnce(
      new ApiError('Проверьте поля.', 400, 'invalid_input'),
    );
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByText('Проверьте поля.')).toBeInTheDocument();
    expect(screen.queryByText(LIST_MARKER)).not.toBeInTheDocument();
  });

  it('«К вопросам» — ссылка наверху страницы', async () => {
    const user = userEvent.setup();
    mockItemAndStats(makeItem());

    renderAt('/exam-items/e1');
    await user.click(await screen.findByRole('link', { name: 'К вопросам' }));

    expect(screen.getByText(LIST_MARKER)).toBeInTheDocument();
  });
});

describe('ExamItemEditorScreen — подвал', () => {
  it('черновик — статус со словами и кнопка «Опубликовать»', async () => {
    const user = userEvent.setup();
    mockItemAndStats(makeItem());

    renderAt('/exam-items/e1');

    expect(await screen.findByText('Черновик')).toBeInTheDocument();
    expect(screen.getByText(/в экзамен его не поставить/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Опубликовать' }));

    await waitFor(() => expect(callsWithMethod('PATCH')).toHaveLength(1));
    const body = callsWithMethod('PATCH')[0]?.[1] as { body: { status: string } };
    expect(body.body.status).toBe('published');
    expect(await screen.findByText(LIST_MARKER)).toBeInTheDocument();
  });

  it('опубликованный — переходы в черновик и архив, удаления нет', async () => {
    mockItemAndStats(makeItem({ status: 'published' }));

    renderAt('/exam-items/e1');

    expect(await screen.findByText('Опубликован')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Вернуть в черновик' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'В архив' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Удалить вопрос' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Отправьте его в архив/)).toBeInTheDocument();
  });

  it('архивный — свой текст статуса и своё объяснение вместо удаления', async () => {
    mockItemAndStats(makeItem({ status: 'archived' }));

    renderAt('/exam-items/e1');

    expect(await screen.findByText('В архиве')).toBeInTheDocument();
    expect(screen.getByText(/сданные работы остаются/)).toBeInTheDocument();
    expect(screen.getByText(/ссылки в сданных работах/)).toBeInTheDocument();
  });

  it('новый вопрос — ни статуса, ни удаления, ни статистики', async () => {
    mockApiByPath({ '/exam-items': makeItem() });

    renderAt('/exam-items/new');
    await screen.findByLabelText('Формулировка');

    expect(screen.queryByText('Черновик')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Удалить вопрос' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Как отвечают')).not.toBeInTheDocument();
  });

  it('смена статуса везёт с собой несохранённую правку формулировки', async () => {
    const user = userEvent.setup();
    mockItemAndStats(makeItem({ status: 'published' }));

    renderAt('/exam-items/e1');
    await user.clear(await screen.findByLabelText('Формулировка'));
    await user.type(screen.getByLabelText('Формулировка'), 'Исправленный вопрос');
    await user.click(screen.getByRole('button', { name: 'В архив' }));

    await waitFor(() => expect(callsWithMethod('PATCH')).toHaveLength(1));
    const body = callsWithMethod('PATCH')[0]?.[1] as {
      body: { prompt: string; status: string };
    };
    expect(body.body.prompt).toBe('Исправленный вопрос');
    expect(body.body.status).toBe('archived');
  });
});

describe('ExamItemEditorScreen — удаление черновика', () => {
  it('«Удалить вопрос» спрашивает подтверждение, отмена ничего не удаляет', async () => {
    const user = userEvent.setup();
    mockItemAndStats(makeItem());

    renderAt('/exam-items/e1');
    await user.click(await screen.findByRole('button', { name: 'Удалить вопрос' }));

    expect(screen.getByRole('dialog', { name: 'Удалить вопрос?' })).toBeInTheDocument();
    expect(callsWithMethod('DELETE')).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Отмена' }));

    expect(callsWithMethod('DELETE')).toHaveLength(0);
    expect(screen.queryByText(LIST_MARKER)).not.toBeInTheDocument();
  });

  it('подтверждение — DELETE и возврат к списку', async () => {
    const user = userEvent.setup();
    mockItemAndStats(makeItem());

    renderAt('/exam-items/e1');
    await user.click(await screen.findByRole('button', { name: 'Удалить вопрос' }));
    await user.click(screen.getByRole('button', { name: 'Удалить' }));

    await waitFor(() => expect(callsWithMethod('DELETE')).toHaveLength(1));
    expect(await screen.findByText(LIST_MARKER)).toBeInTheDocument();
  });

  it('409 при удалении — текст сервера остаётся на странице', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../api/http');
    mockItemAndStats(makeItem());

    renderAt('/exam-items/e1');
    await waitForMounted();
    mockedApiFetch.mockRejectedValueOnce(
      new ApiError('Удалить можно только черновик.', 409, 'conflict'),
    );
    await user.click(screen.getByRole('button', { name: 'Удалить вопрос' }));
    await user.click(screen.getByRole('button', { name: 'Удалить' }));

    expect(await screen.findByText('Удалить можно только черновик.')).toBeInTheDocument();
    expect(screen.queryByText(LIST_MARKER)).not.toBeInTheDocument();
  });
});

describe('ExamItemEditorScreen — «Как отвечают»', () => {
  it('существующий вопрос — раздел со статистикой под формой', async () => {
    mockItemAndStats(makeItem());

    renderAt('/exam-items/e1');

    expect(await screen.findByText('Как отвечают')).toBeInTheDocument();
    expect(
      await screen.findByText('Этот вопрос ещё никому не задавали.'),
    ).toBeInTheDocument();
  });
});
