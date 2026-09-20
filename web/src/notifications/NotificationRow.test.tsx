// Строка ленты уведомлений — кнопка у непрочитанной без адреса, обычная
// строка у прочитанной без адреса, ссылка на свой предмет у вида с адресом
// (ADR-0070), итог экзамена нефритом только при «сдал» (ADR-0063 — центр
// уведомлений; соседние файлы ссылаются на него как на ADR-0065, номер
// разъехался с файлом решения ещё в #252 и чинится отдельно).
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { NotificationDto } from '@xuanxue/shared';
import { stubViewerTimeZone } from '../test-support/viewerTimeZone';
import { NotificationRow } from './NotificationRow';

stubViewerTimeZone();

const NOW = '2026-09-20T10:00:00.000Z'; // 13:00 в Москве (зритель теста)

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
function renderRow(
  item: NotificationDto,
  { isLast, onRead }: { isLast: boolean; onRead: () => void },
) {
  return render(
    <MemoryRouter>
      <ul>
        <NotificationRow item={item} nowIso={NOW} isLast={isLast} onRead={onRead} />
      </ul>
    </MemoryRouter>,
  );
}

describe('NotificationRow — непрочитанная', () => {
  it('строка — кнопка, клик зовёт onRead', async () => {
    const onRead = vi.fn();
    const user = userEvent.setup();
    renderRow(makeItem(), { isLast: false, onRead });

    await user.click(screen.getByRole('button'));

    expect(onRead).toHaveBeenCalledTimes(1);
  });

  it('«Не прочитано» слышно скринридеру', () => {
    renderRow(makeItem(), { isLast: false, onRead: vi.fn() });

    expect(screen.getByText('Не прочитано')).toBeInTheDocument();
  });
});

describe('NotificationRow — прочитанная', () => {
  const READ = makeItem({ readAt: '2026-09-20T09:05:00.000Z' });

  it('кнопки нет', () => {
    renderRow(READ, { isLast: false, onRead: vi.fn() });

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
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

    const li = screen.getByRole('button').closest('li');
    expect(li?.style.borderBottom).toBe('');
  });

  it('не последняя — волосяная линия снизу', () => {
    renderRow(makeItem(), { isLast: false, onRead: vi.fn() });

    const li = screen.getByRole('button').closest('li');
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

  it('exam_result прочитанная — ссылка есть, onRead не зовётся (кнопки нет)', async () => {
    const onRead = vi.fn();
    const user = userEvent.setup();
    renderRow(makeItem({ kind: 'exam_result', readAt: '2026-09-20T09:05:00.000Z' }), {
      isLast: false,
      onRead,
    });

    await user.click(screen.getByRole('link'));

    expect(onRead).not.toHaveBeenCalled();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('attempt_submitted с attemptId «a1» — ссылка на «/grading/a1»', () => {
    renderRow(makeItem({ kind: 'attempt_submitted', attemptId: 'a1' }), {
      isLast: false,
      onRead: vi.fn(),
    });

    expect(screen.getByRole('link')).toHaveAttribute('href', '/grading/a1');
  });

  it('attempt_submitted без attemptId — ссылки нет, осталась кнопка', () => {
    renderRow(makeItem({ kind: 'attempt_submitted' }), {
      isLast: false,
      onRead: vi.fn(),
    });

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('вид без своего экрана (payments) — ссылки нет', () => {
    renderRow(makeItem({ kind: 'payments' }), { isLast: false, onRead: vi.fn() });

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
