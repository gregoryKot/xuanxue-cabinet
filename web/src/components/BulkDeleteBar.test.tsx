// ConfirmDialog требует React Router (useHistorySheet) — оборачиваем в
// MemoryRouter по образцу ConfirmDialog.test.tsx, только тогда, когда диалог
// действительно рисуется (bulk.confirming). `bulk` — фейковый объект той же
// формы, что даёт useBulkDelete.ts: сам хук проверен отдельно
// (useBulkDelete.test.ts), здесь — только рендер бара по его состоянию.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { BulkDeleteResult, PluralForms } from '@xuanxue/shared';
import type { UseBulkDeleteResult } from '../hooks/useBulkDelete';
import { BulkDeleteBar } from './BulkDeleteBar';

const QUESTION_FORMS: PluralForms = {
  one: 'вопрос',
  few: 'вопроса',
  many: 'вопросов',
  other: 'вопроса',
};
const CONFIRM_MESSAGE = 'Вопросы пропадут из банка.';

function makeBulk(overrides: Partial<UseBulkDeleteResult> = {}): UseBulkDeleteResult {
  return {
    isSelecting: false,
    start: vi.fn(),
    stop: vi.fn(),
    isSelected: () => false,
    toggle: vi.fn(),
    selectOnly: vi.fn(),
    selectedVisibleIds: [],
    allVisibleSelected: false,
    toggleAllVisible: vi.fn(),
    confirming: false,
    requestDelete: vi.fn(),
    cancelDelete: vi.fn(),
    confirmDelete: vi.fn(),
    pending: false,
    result: null,
    error: null,
    ...overrides,
  };
}

function renderBar(bulk: UseBulkDeleteResult, hasItems = true) {
  return render(
    <BulkDeleteBar
      bulk={bulk}
      forms={QUESTION_FORMS}
      hasItems={hasItems}
      confirmMessage={CONFIRM_MESSAGE}
    />,
  );
}

describe('BulkDeleteBar — не в режиме выбора', () => {
  it('список не пуст, итога нет — только «Выбрать»', () => {
    renderBar(makeBulk(), true);

    expect(screen.getByRole('button', { name: 'Выбрать' })).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('список пуст, итога нет — бар пустой', () => {
    const { container } = renderBar(makeBulk(), false);

    expect(container).toBeEmptyDOMElement();
  });

  it('список пуст, но есть итог последнего удаления — итог виден без «Выбрать»', () => {
    const result: BulkDeleteResult = { deletedIds: ['a'], failed: [] };
    renderBar(makeBulk({ result }), false);

    expect(screen.queryByRole('button', { name: 'Выбрать' })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Удалили 1 вопрос');
  });
});

describe('BulkDeleteBar — в режиме выбора', () => {
  it('показывает число отмеченных, переключатель «Выбрать все»/«Снять все»', () => {
    const { container } = renderBar(
      makeBulk({ isSelecting: true, selectedVisibleIds: ['a', 'b'] }),
    );

    expect(container).toHaveTextContent('Выбрано: 2');
    expect(screen.getByRole('button', { name: 'Выбрать все' })).toBeInTheDocument();
  });

  it('все видимые отмечены — подпись переключателя «Снять все»', () => {
    renderBar(
      makeBulk({
        isSelecting: true,
        selectedVisibleIds: ['a'],
        allVisibleSelected: true,
      }),
    );

    expect(screen.getByRole('button', { name: 'Снять все' })).toBeInTheDocument();
  });

  it('ничего не отмечено — «Удалить» недоступна', () => {
    renderBar(makeBulk({ isSelecting: true, selectedVisibleIds: [] }));

    expect(screen.getByRole('button', { name: 'Удалить' })).toBeDisabled();
  });

  it('клик по «Удалить» вызывает requestDelete, «Готово» — stop', async () => {
    const user = userEvent.setup();
    const bulk = makeBulk({ isSelecting: true, selectedVisibleIds: ['a'] });
    renderBar(bulk);

    await user.click(screen.getByRole('button', { name: 'Удалить' }));
    expect(bulk.requestDelete).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Готово' }));
    expect(bulk.stop).toHaveBeenCalledTimes(1);
  });

  it('bulk.error — текст ошибки виден рядом с баром', () => {
    renderBar(makeBulk({ isSelecting: true, error: 'Сервис недоступен' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Сервис недоступен');
  });
});

describe('BulkDeleteBar — подтверждение удаления', () => {
  function renderConfirming(bulk: UseBulkDeleteResult) {
    return render(
      <MemoryRouter initialEntries={['/hub', '/target']} initialIndex={1}>
        <BulkDeleteBar
          bulk={bulk}
          forms={QUESTION_FORMS}
          hasItems
          confirmMessage={CONFIRM_MESSAGE}
        />
      </MemoryRouter>,
    );
  }

  it('заголовок по числу отмеченного, свой текст последствия', () => {
    const bulk = makeBulk({
      isSelecting: true,
      confirming: true,
      selectedVisibleIds: ['a', 'b', 'c'],
    });
    renderConfirming(bulk);

    expect(
      screen.getByRole('dialog', { name: 'Удалить 3 вопроса?' }),
    ).toBeInTheDocument();
    expect(screen.getByText(CONFIRM_MESSAGE)).toBeInTheDocument();
  });

  it('«Отмена» в диалоге вызывает cancelDelete', async () => {
    const user = userEvent.setup();
    const bulk = makeBulk({
      isSelecting: true,
      confirming: true,
      selectedVisibleIds: ['a'],
    });
    renderConfirming(bulk);

    // Бар под диалогом несёт свою кнопку «Удалить» тем же именем — берём
    // именно ту, что внутри диалога (within), а не любую с этим именем.
    await user.click(screen.getByRole('button', { name: 'Отмена' }));
    expect(bulk.cancelDelete).toHaveBeenCalledTimes(1);
  });

  it('подтверждение в диалоге — confirmDelete, закрытие диалога дальше через cancelDelete', async () => {
    const user = userEvent.setup();
    const bulk = makeBulk({
      isSelecting: true,
      confirming: true,
      selectedVisibleIds: ['a'],
    });
    renderConfirming(bulk);

    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Удалить' }));

    expect(bulk.confirmDelete).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(bulk.cancelDelete).toHaveBeenCalledTimes(1));
  });
});
