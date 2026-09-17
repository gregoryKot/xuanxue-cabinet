// MemoryRouter — ConfirmDialog внутри списка держит useHistorySheet
// (react-router), тем же приёмом, что PersonRow.test.tsx.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { GradingCommentPresetDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { ApiError } from '../api/http';
import {
  mockApiByPath,
  mockedApiFetch,
  resetApiFetchBetweenTests,
} from '../test-support/apiFetchMock';
import { GradingCommentPresets } from './GradingCommentPresets';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

function makePreset(
  overrides: Partial<GradingCommentPresetDto> = {},
): GradingCommentPresetDto {
  return {
    id: 'p1',
    text: 'Держите центр тяжести',
    createdBy: 't1',
    createdAt: '2026-09-01T00:00:00Z',
    ...overrides,
  };
}

function renderPresets(comment = '', onInsert = vi.fn()) {
  render(
    <MemoryRouter>
      <GradingCommentPresets comment={comment} onInsert={onInsert} />
    </MemoryRouter>,
  );
  return { onInsert };
}

describe('GradingCommentPresets — список пуст', () => {
  it('объяснение, зачем это и что нажать первым', async () => {
    mockApiByPath({ '/grading-presets': [] });
    renderPresets();

    expect(
      await screen.findByText(/Заготовок пока нет\. Наберите комментарий/),
    ).toBeInTheDocument();
  });
});

describe('GradingCommentPresets — список заготовок', () => {
  it('клик по заготовке вызывает onInsert с её текстом', async () => {
    mockApiByPath({ '/grading-presets': [makePreset()] });
    const { onInsert } = renderPresets();

    const button = await screen.findByRole('button', { name: 'Держите центр тяжести' });
    await userEvent.click(button);

    expect(onInsert).toHaveBeenCalledWith('Держите центр тяжести');
  });

  it('длинный текст обрезается на кнопке', async () => {
    const longText =
      'Очень длинный комментарий о стойке, дыхании, координации рук и внимании к деталям формы';
    mockApiByPath({ '/grading-presets': [makePreset({ text: longText })] });
    renderPresets();

    const button = await screen.findByRole('button', { name: /…$/ });
    expect(button.textContent?.length).toBeLessThan(longText.length);
  });
});

describe('GradingCommentPresets — сохранить как заготовку', () => {
  it('пустой комментарий — кнопка выключена', async () => {
    mockApiByPath({ '/grading-presets': [] });
    renderPresets('');

    const button = await screen.findByRole('button', { name: 'Сохранить как заготовку' });
    expect(button).toBeDisabled();
  });

  it('непустой комментарий — клик отправляет POST и обновляет список', async () => {
    mockedApiFetch.mockResolvedValueOnce([]);
    const { rerender } = render(
      <MemoryRouter>
        <GradingCommentPresets comment="Хорошая работа" onInsert={vi.fn()} />
      </MemoryRouter>,
    );
    await screen.findByText(/Заготовок пока нет/);

    mockedApiFetch.mockResolvedValueOnce(makePreset({ text: 'Хорошая работа' }));
    mockedApiFetch.mockResolvedValueOnce([makePreset({ text: 'Хорошая работа' })]);

    await userEvent.click(
      screen.getByRole('button', { name: 'Сохранить как заготовку' }),
    );

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        '/grading-presets',
        expect.objectContaining({
          method: 'POST',
          body: { text: 'Хорошая работа' },
        }),
      ),
    );
    rerender(
      <MemoryRouter>
        <GradingCommentPresets comment="Хорошая работа" onInsert={vi.fn()} />
      </MemoryRouter>,
    );
  });

  it('сбой сохранения — alert с текстом ошибки', async () => {
    mockedApiFetch.mockResolvedValueOnce([]);
    render(
      <MemoryRouter>
        <GradingCommentPresets comment="Хорошая работа" onInsert={vi.fn()} />
      </MemoryRouter>,
    );
    await screen.findByText(/Заготовок пока нет/);

    mockedApiFetch.mockRejectedValueOnce(
      new ApiError('Не удалось сохранить.', 500, 'unknown'),
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Сохранить как заготовку' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось сохранить.');
  });
});

describe('GradingCommentPresets — удаление', () => {
  it('клик по «Удалить» открывает подтверждение, подтверждение зовёт DELETE', async () => {
    mockedApiFetch.mockResolvedValueOnce([makePreset()]);
    render(
      <MemoryRouter>
        <GradingCommentPresets comment="" onInsert={vi.fn()} />
      </MemoryRouter>,
    );
    await screen.findByRole('button', { name: 'Держите центр тяжести' });

    await userEvent.click(screen.getByRole('button', { name: /Удалить заготовку/ }));
    const dialog = screen.getByRole('dialog', { name: 'Удалить заготовку?' });

    mockedApiFetch.mockResolvedValueOnce(undefined);
    mockedApiFetch.mockResolvedValueOnce([]);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Удалить' }));

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        '/grading-presets/p1',
        expect.objectContaining({ method: 'DELETE' }),
      ),
    );
  });

  it('отмена в диалоге — DELETE не вызван', async () => {
    mockedApiFetch.mockResolvedValueOnce([makePreset()]);
    render(
      <MemoryRouter>
        <GradingCommentPresets comment="" onInsert={vi.fn()} />
      </MemoryRouter>,
    );
    await screen.findByRole('button', { name: 'Держите центр тяжести' });

    await userEvent.click(screen.getByRole('button', { name: /Удалить заготовку/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Отмена' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mockedApiFetch).not.toHaveBeenCalledWith(
      '/grading-presets/p1',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });
});
