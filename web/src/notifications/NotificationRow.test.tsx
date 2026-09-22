// Строка ленты уведомлений — кнопка у непрочитанной без адреса, обычная
// строка у прочитанной без адреса, ссылка на свой предмет у вида с адресом
// (ADR-0070), итог экзамена нефритом только при «сдал» (ADR-0063). Строка
// всегда обёрнута в SwipeRow (просьба владельца 2026-09-22) — под ней
// всегда есть кнопка «Убрать», отдельно от собственной кнопки/ссылки
// строки; SwipeRow.test.tsx проверяет саму механику смахивания и жест,
// здесь — только что строка её носит и не путает роли между собой.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { NotificationDto } from '@xuanxue/shared';
import { stubViewerTimeZone } from '../test-support/viewerTimeZone';
import { NotificationRow } from './NotificationRow';

stubViewerTimeZone();

const NOW = '2026-09-20T10:00:00.000Z'; // 13:00 в Москве (зритель теста)
// Собственная кнопка строки (mark-as-read) отличается от «Убрать» под ней по
// имени: у неё всегда звучит «Не прочитано» первым словом (unreadLabel), у
// «Убрать» имя начинается с самого этого слова — `getByRole('button')` без
// имени после SwipeRow находит обе и падает с «нашлось больше одного».
const UNREAD_BUTTON_NAME = /^Не прочитано/;

function makeItem(overrides: Partial<NotificationDto> = {}): NotificationDto {
  return {
    id: 'n1',
    kind: 'post_draft',
    text: 'Учитель написал вам',
    createdAt: '2026-09-20T09:00:00.000Z', // 12:00 в Москве, тот же день, что NOW
    ...overrides,
  };
}

// `<Link>` работает только под `<Router>` — остальным веткам (кнопка, `<div>`)
// он не нужен, но обёртка общая, чтобы случаи не расходились по окружению.
// onDismiss по умолчанию — пустышка: своя механика проверяется в
// SwipeRow.test.tsx, здесь только та строка, что и раньше.
function renderRow(
  item: NotificationDto,
  {
    isLast,
    onRead,
    onDismiss = vi.fn(),
  }: { isLast: boolean; onRead: () => void; onDismiss?: () => void },
) {
  return render(
    <MemoryRouter>
      <ul>
        <NotificationRow
          item={item}
          nowIso={NOW}
          isLast={isLast}
          onRead={onRead}
          onDismiss={onDismiss}
        />
      </ul>
    </MemoryRouter>,
  );
}

describe('NotificationRow — непрочитанная', () => {
  it('строка — кнопка, клик зовёт onRead', async () => {
    const onRead = vi.fn();
    const user = userEvent.setup();
    renderRow(makeItem(), { isLast: false, onRead });

    await user.click(screen.getByRole('button', { name: UNREAD_BUTTON_NAME }));

    expect(onRead).toHaveBeenCalledTimes(1);
  });

  it('«Не прочитано» слышно скринридеру', () => {
    renderRow(makeItem(), { isLast: false, onRead: vi.fn() });

    expect(screen.getByText('Не прочитано')).toBeInTheDocument();
  });
});

describe('NotificationRow — прочитанная', () => {
  const READ = makeItem({ readAt: '2026-09-20T09:05:00.000Z' });

  it('собственной кнопки нет, «Убрать» осталась', () => {
    renderRow(READ, { isLast: false, onRead: vi.fn() });

    expect(
      screen.queryByRole('button', { name: UNREAD_BUTTON_NAME }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Убрать/ })).toBeInTheDocument();
  });

  it('«Не прочитано» не звучит', () => {
    renderRow(READ, { isLast: false, onRead: vi.fn() });

    expect(screen.queryByText('Не прочитано')).not.toBeInTheDocument();
  });
});

describe('NotificationRow — итог экзамена', () => {
  it('passed — нефрит', () => {
    renderRow(makeItem({ outcome: 'passed' }), { isLast: false, onRead: vi.fn() });

    expect(screen.getByText('Экзамен сдан')).toHaveStyle({ color: 'var(--jade)' });
  });

  it('failed — обычный цвет текста, не нефрит', () => {
    renderRow(makeItem({ outcome: 'failed' }), { isLast: false, onRead: vi.fn() });

    expect(screen.getByText('Экзамен не сдан')).toHaveStyle({ color: 'var(--ink)' });
  });

  it('без outcome — итога нет вовсе', () => {
    renderRow(makeItem(), { isLast: false, onRead: vi.fn() });

    expect(screen.queryByText(/^Экзамен /)).not.toBeInTheDocument();
  });
});

describe('NotificationRow — время', () => {
  it('сегодняшнее событие — время в поясе зрителя', () => {
    renderRow(makeItem(), { isLast: false, onRead: vi.fn() });

    expect(screen.getByText('12:00')).toBeInTheDocument();
  });
});

describe('NotificationRow — isLast', () => {
  it('последняя строка своей карточки — без линии снизу', () => {
    renderRow(makeItem(), { isLast: true, onRead: vi.fn() });

    const li = screen.getByRole('button', { name: UNREAD_BUTTON_NAME }).closest('li');
    expect(li?.style.borderBottom).toBe('');
  });

  it('не последняя — волосяная линия снизу', () => {
    renderRow(makeItem(), { isLast: false, onRead: vi.fn() });

    const li = screen.getByRole('button', { name: UNREAD_BUTTON_NAME }).closest('li');
    expect(li?.style.borderBottom).toBe('1px solid var(--line)');
  });
});

describe('NotificationRow — ссылка на предмет (ADR-0070)', () => {
  it('exam_result непрочитанная — ссылка на «/tasks», клик зовёт onRead один раз', async () => {
    const onRead = vi.fn();
    const user = userEvent.setup();
    renderRow(makeItem({ kind: 'exam_result' }), { isLast: false, onRead });

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/tasks');

    await user.click(link);
    expect(onRead).toHaveBeenCalledTimes(1);
  });

  it('exam_result прочитанная — ссылка есть, onRead не зовётся, своей кнопки нет', async () => {
    const onRead = vi.fn();
    const user = userEvent.setup();
    renderRow(makeItem({ kind: 'exam_result', readAt: '2026-09-20T09:05:00.000Z' }), {
      isLast: false,
      onRead,
    });

    await user.click(screen.getByRole('link'));

    expect(onRead).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('button', { name: UNREAD_BUTTON_NAME }),
    ).not.toBeInTheDocument();
  });

  it('attempt_submitted с attemptId «a1» — ссылка на «/grading/a1»', () => {
    renderRow(makeItem({ kind: 'attempt_submitted', attemptId: 'a1' }), {
      isLast: false,
      onRead: vi.fn(),
    });

    expect(screen.getByRole('link')).toHaveAttribute('href', '/grading/a1');
  });

  it('attempt_submitted без attemptId — ссылки нет, осталась кнопка строки', () => {
    renderRow(makeItem({ kind: 'attempt_submitted' }), {
      isLast: false,
      onRead: vi.fn(),
    });

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: UNREAD_BUTTON_NAME })).toBeInTheDocument();
  });

  it('вид без своего экрана (payments) — ссылки нет', () => {
    renderRow(makeItem({ kind: 'payments' }), { isLast: false, onRead: vi.fn() });

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
