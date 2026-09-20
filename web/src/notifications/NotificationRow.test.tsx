// Строка ленты уведомлений — кнопка у непрочитанной, обычная строка у
// прочитанной, итог экзамена нефритом только при «сдал» (ADR-0065).
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

describe('NotificationRow — непрочитанная', () => {
  it('строка — кнопка, клик зовёт onRead', async () => {
    const onRead = vi.fn();
    const user = userEvent.setup();
    render(
      <ul>
        <NotificationRow item={makeItem()} nowIso={NOW} isLast={false} onRead={onRead} />
      </ul>,
    );

    await user.click(screen.getByRole('button'));

    expect(onRead).toHaveBeenCalledTimes(1);
  });

  it('«Не прочитано» слышно скринридеру', () => {
    render(
      <ul>
        <NotificationRow item={makeItem()} nowIso={NOW} isLast={false} onRead={vi.fn()} />
      </ul>,
    );

    expect(screen.getByText('Не прочитано')).toBeInTheDocument();
  });
});

describe('NotificationRow — прочитанная', () => {
  const READ = makeItem({ readAt: '2026-09-20T09:05:00.000Z' });

  it('кнопки нет', () => {
    render(
      <ul>
        <NotificationRow item={READ} nowIso={NOW} isLast={false} onRead={vi.fn()} />
      </ul>,
    );

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('«Не прочитано» не звучит', () => {
    render(
      <ul>
        <NotificationRow item={READ} nowIso={NOW} isLast={false} onRead={vi.fn()} />
      </ul>,
    );

    expect(screen.queryByText('Не прочитано')).not.toBeInTheDocument();
  });
});

describe('NotificationRow — итог экзамена', () => {
  it('passed — нефрит', () => {
    render(
      <ul>
        <NotificationRow
          item={makeItem({ outcome: 'passed' })}
          nowIso={NOW}
          isLast={false}
          onRead={vi.fn()}
        />
      </ul>,
    );

    expect(screen.getByText('Экзамен сдан')).toHaveStyle({ color: 'var(--jade)' });
  });

  it('failed — обычный цвет текста, не нефрит', () => {
    render(
      <ul>
        <NotificationRow
          item={makeItem({ outcome: 'failed' })}
          nowIso={NOW}
          isLast={false}
          onRead={vi.fn()}
        />
      </ul>,
    );

    expect(screen.getByText('Экзамен не сдан')).toHaveStyle({ color: 'var(--ink)' });
  });

  it('без outcome — итога нет вовсе', () => {
    render(
      <ul>
        <NotificationRow item={makeItem()} nowIso={NOW} isLast={false} onRead={vi.fn()} />
      </ul>,
    );

    expect(screen.queryByText(/^Экзамен /)).not.toBeInTheDocument();
  });
});

describe('NotificationRow — время', () => {
  it('сегодняшнее событие — время в поясе зрителя', () => {
    render(
      <ul>
        <NotificationRow item={makeItem()} nowIso={NOW} isLast={false} onRead={vi.fn()} />
      </ul>,
    );

    expect(screen.getByText('12:00')).toBeInTheDocument();
  });
});

describe('NotificationRow — isLast', () => {
  it('последняя строка своей карточки — без линии снизу', () => {
    render(
      <ul>
        <NotificationRow item={makeItem()} nowIso={NOW} isLast onRead={vi.fn()} />
      </ul>,
    );

    const li = screen.getByRole('button').closest('li');
    expect(li?.style.borderBottom).toBe('');
  });

  it('не последняя — волосяная линия снизу', () => {
    render(
      <ul>
        <NotificationRow item={makeItem()} nowIso={NOW} isLast={false} onRead={vi.fn()} />
      </ul>,
    );

    const li = screen.getByRole('button').closest('li');
    expect(li?.style.borderBottom).toBe('1px solid var(--line)');
  });
});
