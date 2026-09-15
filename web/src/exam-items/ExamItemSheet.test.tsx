// ExamItemSheet напрямую, с фейковыми onCreate/onUpdate/onRemove — быстрее и
// точнее, чем гонять apiFetch через весь ExamItemsScreen, по образцу
// schedule/ClassSheet.test.tsx.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type {
  CreateExamItemInput,
  ExamItemDto,
  UpdateExamItemInput,
} from '@xuanxue/shared';
import { ApiError } from '../api/http';
import { ExamItemSheet } from './ExamItemSheet';

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

interface RenderSheetOverrides {
  onCreate?: (input: CreateExamItemInput) => Promise<void>;
  onUpdate?: (id: string, input: UpdateExamItemInput) => Promise<void>;
  onRemove?: (id: string) => Promise<void>;
}

function renderSheet(item: ExamItemDto | null, overrides: RenderSheetOverrides = {}) {
  const onClose = vi.fn();
  const onCreate = overrides.onCreate ?? vi.fn().mockResolvedValue(undefined);
  const onUpdate = overrides.onUpdate ?? vi.fn().mockResolvedValue(undefined);
  const onRemove = overrides.onRemove ?? vi.fn().mockResolvedValue(undefined);

  render(
    <MemoryRouter initialEntries={['/exam-items']}>
      <ExamItemSheet
        item={item}
        onClose={onClose}
        onCreate={onCreate}
        onUpdate={onUpdate}
        onRemove={onRemove}
      />
    </MemoryRouter>,
  );

  return { onClose, onCreate, onUpdate, onRemove };
}

describe('ExamItemSheet — диалог', () => {
  it('role=dialog, заголовком подписан, заголовок в фокусе', () => {
    renderSheet(makeItem());

    const dialog = screen.getByRole('dialog');
    const heading = screen.getByRole('heading', { name: 'Вопрос' });
    expect(dialog).toHaveAttribute('aria-labelledby', heading.id);
    expect(heading).toHaveFocus();
  });
});

describe('ExamItemSheet — создание', () => {
  it('заполнить формулировку и тип single с вариантами — POST с телом', async () => {
    const user = userEvent.setup();
    const { onCreate } = renderSheet(null);

    await user.selectOptions(screen.getByLabelText('Тип вопроса'), 'single');
    await user.type(screen.getByLabelText('Формулировка'), 'Сколько форм?');
    await user.click(screen.getByRole('button', { name: 'Добавить вариант' }));
    await user.click(screen.getByRole('button', { name: 'Добавить вариант' }));
    await user.type(screen.getByLabelText('Текст варианта 1'), '24');
    await user.type(screen.getByLabelText('Текст варианта 2'), '108');
    await user.click(screen.getByLabelText('Верный вариант 1'));

    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'single',
        prompt: 'Сколько форм?',
        options: [
          { id: undefined, text: '24', correct: true },
          { id: undefined, text: '108', correct: false },
        ],
      }),
    );
  });

  it('тип по умолчанию text — без вариантов вовсе', () => {
    renderSheet(null);

    expect(screen.queryByText('Варианты ответа')).not.toBeInTheDocument();
  });

  it('заполнить подсказку, критерии и теги — уходят в тело запроса', async () => {
    const user = userEvent.setup();
    const { onCreate } = renderSheet(null);

    await user.type(screen.getByLabelText('Формулировка'), 'Вопрос');
    await user.type(screen.getByLabelText('Подсказка'), 'Смотрите в стойку');
    await user.type(
      screen.getByLabelText('Критерии проверки'),
      'Верно, если названо число',
    );
    await user.type(screen.getByLabelText('Теги'), 'ян, база');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        hint: 'Смотрите в стойку',
        criteria: 'Верно, если названо число',
        tags: ['ян', 'база'],
      }),
    );
  });

  it('пустая формулировка — «Добавить вариант» видна, но сохранение не проходит', async () => {
    const user = userEvent.setup();
    const { onCreate } = renderSheet(null);

    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByText(/формулировку вопроса/)).toBeInTheDocument();
    expect(onCreate).not.toHaveBeenCalled();
  });
});

describe('ExamItemSheet — правка', () => {
  it('тип показан текстом, select недоступен', () => {
    renderSheet(makeItem());

    expect(screen.queryByLabelText('Тип вопроса')).not.toBeInTheDocument();
    expect(screen.getByText(/Тип: Один правильный вариант/)).toBeInTheDocument();
  });

  it('правка формулировки — PATCH с прежними вариантами', async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderSheet(makeItem());

    await user.clear(screen.getByLabelText('Формулировка'));
    await user.type(screen.getByLabelText('Формулировка'), 'Новая формулировка');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onUpdate).toHaveBeenCalledWith(
      'e1',
      expect.objectContaining({ prompt: 'Новая формулировка' }),
    );
  });

  it('вопрос опубликован — предупреждение про версию видно до сохранения', () => {
    renderSheet(makeItem({ status: 'published' }));

    expect(screen.getByText(/обновит версию вопроса/)).toBeInTheDocument();
  });

  it('черновик — предупреждения про версию нет', () => {
    renderSheet(makeItem({ status: 'draft' }));

    expect(screen.queryByText(/обновит версию вопроса/)).not.toBeInTheDocument();
  });

  it('сбой сохранения — текст сервера на листе', async () => {
    const user = userEvent.setup();
    const onUpdate = vi
      .fn()
      .mockRejectedValue(new ApiError('Проверьте поля.', 400, 'invalid_input'));
    renderSheet(makeItem(), { onUpdate });

    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Проверьте поля.');
  });
});

describe('ExamItemSheet — удаление', () => {
  it('черновик — «Удалить» открывает подтверждение, onRemove не зовётся до ответа', async () => {
    const user = userEvent.setup();
    const { onRemove } = renderSheet(makeItem({ status: 'draft' }));

    await user.click(screen.getByRole('button', { name: 'Удалить' }));

    expect(onRemove).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Удалить вопрос?' })).toBeInTheDocument();
  });

  it('отказ в диалоге подтверждения — ничего не удаляется', async () => {
    const user = userEvent.setup();
    const { onRemove, onClose } = renderSheet(makeItem({ status: 'draft' }));

    await user.click(screen.getByRole('button', { name: 'Удалить' }));
    await user.click(screen.getByRole('button', { name: 'Отмена' }));

    expect(onRemove).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('dialog', { name: 'Удалить вопрос?' }),
    ).not.toBeInTheDocument();
  });

  it('подтверждение — зовёт onRemove и закрывает весь лист ровно одним переходом назад', async () => {
    const user = userEvent.setup();
    const { onRemove, onClose } = renderSheet(makeItem({ status: 'draft' }));

    await user.click(screen.getByRole('button', { name: 'Удалить' }));
    await user.click(
      screen.getAllByRole('button', { name: 'Удалить' })[1] as HTMLElement,
    );

    await waitFor(() => expect(onRemove).toHaveBeenCalledWith('e1'));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('опубликованный — кнопки «Удалить» нет, есть объяснение', () => {
    renderSheet(makeItem({ status: 'published' }));

    expect(screen.queryByRole('button', { name: 'Удалить' })).not.toBeInTheDocument();
    expect(screen.getByText(/Удалить нельзя/)).toBeInTheDocument();
  });

  it('архивный — кнопки «Удалить» тоже нет', () => {
    renderSheet(makeItem({ status: 'archived' }));

    expect(screen.queryByRole('button', { name: 'Удалить' })).not.toBeInTheDocument();
  });

  it('новый вопрос — блока статуса и удаления нет вовсе', () => {
    renderSheet(null);

    expect(screen.queryByText(/Статус:/)).not.toBeInTheDocument();
  });

  it('409 при удалении — текст сервера остаётся на листе, лист не закрывается', async () => {
    const user = userEvent.setup();
    const onRemove = vi
      .fn()
      .mockRejectedValue(new ApiError('Удалить можно только черновик.', 409, 'conflict'));
    const { onClose } = renderSheet(makeItem({ status: 'draft' }), { onRemove });

    await user.click(screen.getByRole('button', { name: 'Удалить' }));
    await user.click(
      screen.getAllByRole('button', { name: 'Удалить' })[1] as HTMLElement,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Удалить можно только черновик.',
    );
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('ExamItemSheet — действия со статусом', () => {
  it('черновик — «Опубликовать» шлёт PATCH со status: published', async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderSheet(makeItem({ status: 'draft' }));

    await user.click(screen.getByRole('button', { name: 'Опубликовать' }));

    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith(
        'e1',
        expect.objectContaining({ status: 'published' }),
      ),
    );
  });

  it('опубликован — доступны «Вернуть в черновик» и «В архив»', () => {
    renderSheet(makeItem({ status: 'published' }));

    expect(
      screen.getByRole('button', { name: 'Вернуть в черновик' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'В архив' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Опубликовать' }),
    ).not.toBeInTheDocument();
  });

  // Блокер аудита 2026-09-15 №1: смена статуса отправляла только
  // { status }, молча теряя правку формулировки, наменянную до клика —
  // ученики получали вопрос с прежним текстом.
  it('«В архив» с несохранённой правкой формулировки — отправляет и правку, и статус', async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderSheet(makeItem({ status: 'draft' }));

    await user.clear(screen.getByLabelText('Формулировка'));
    await user.type(screen.getByLabelText('Формулировка'), 'Исправленный вопрос');
    await user.click(screen.getByRole('button', { name: 'В архив' }));

    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    expect(onUpdate).toHaveBeenCalledWith(
      'e1',
      expect.objectContaining({ prompt: 'Исправленный вопрос', status: 'archived' }),
    );
  });

  it('ошибка смены статуса — текст сервера на листе, статус на экране не менялся', async () => {
    const user = userEvent.setup();
    const onUpdate = vi
      .fn()
      .mockRejectedValue(new ApiError('Не удалось. Попробуйте ещё раз.', 500, 'unknown'));
    renderSheet(makeItem({ status: 'draft' }), { onUpdate });

    await user.click(screen.getByRole('button', { name: 'Опубликовать' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось. Попробуйте ещё раз.',
    );
    expect(screen.getByRole('button', { name: 'Опубликовать' })).toBeInTheDocument();
  });
});
