import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AppErrorDto } from '@xuanxue/shared';
import { stubViewerTimeZone } from '../test-support/viewerTimeZone';
import { DevErrorCard } from './DevErrorCard';

stubViewerTimeZone('Asia/Jerusalem');

function makeError(overrides: Partial<AppErrorDto> = {}): AppErrorDto {
  return {
    id: 'e1',
    source: 'browser',
    kind: 'render',
    path: '/schedule',
    text: 'TypeError: cannot read foo',
    occurredAt: '2026-09-27T11:03:00Z',
    ...overrides,
  };
}

describe('DevErrorCard', () => {
  it('строка браузера — время, вид, источник, путь и текст', () => {
    render(
      <ul>
        <DevErrorCard error={makeError()} />
      </ul>,
    );

    expect(screen.getByText(/Экран не нарисовался/)).toBeInTheDocument();
    expect(screen.getByText(/Браузер/)).toBeInTheDocument();
    expect(screen.getByText('/schedule')).toBeInTheDocument();
    expect(screen.getByText('TypeError: cannot read foo')).toBeInTheDocument();
  });

  it('серверный сбой — метод перед путём', () => {
    render(
      <ul>
        <DevErrorCard
          error={makeError({
            source: 'server',
            kind: 'server',
            method: 'POST',
            path: '/exams',
          })}
        />
      </ul>,
    );

    expect(screen.getByText('POST /exams')).toBeInTheDocument();
    expect(screen.getByText(/Сервер/)).toBeInTheDocument();
  });

  it('код обращения и userAgent — только когда есть', () => {
    const { rerender } = render(
      <ul>
        <DevErrorCard error={makeError()} />
      </ul>,
    );
    expect(screen.queryByText(/Код обращения/)).not.toBeInTheDocument();

    rerender(
      <ul>
        <DevErrorCard
          error={makeError({ requestId: 'req-42', userAgent: 'Mozilla/5.0 (iPhone)' })}
        />
      </ul>,
    );
    expect(screen.getByText('Код обращения: req-42')).toBeInTheDocument();
    expect(screen.getByText('Mozilla/5.0 (iPhone)')).toBeInTheDocument();
  });
});
