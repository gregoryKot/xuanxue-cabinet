// Поле «Теги» и его подсказки (ADR-0058) — остальные поля уже покрыты через
// MaterialEditorScreen.test.tsx, здесь только то, что не проверить без
// прямого контроля над useTagOptions.ts: сам список подсказок (даталист и
// ряд пилюль), который форма собирает из живой сети.
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { TagSummaryDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { apiFetch } from '../api/http';
import { MaterialFormFields } from './MaterialFormFields';
import type { MaterialFormState } from './materialFormInput';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

function makeTagSummary(overrides: Partial<TagSummaryDto> = {}): TagSummaryDto {
  return {
    tag: 'старшая',
    lessonCount: 0,
    materialCount: 0,
    channelCount: 0,
    examItemCount: 0,
    ...overrides,
  };
}

function makeState(overrides: Partial<MaterialFormState> = {}): MaterialFormState {
  return {
    title: '',
    url: '',
    kind: 'book',
    classIds: [],
    access: 'all',
    tagsText: '',
    ...overrides,
  };
}

function renderFields(state: MaterialFormState = makeState()) {
  render(
    <MemoryRouter>
      <MaterialFormFields state={state} setField={vi.fn()} error={null} classes={[]} />
    </MemoryRouter>,
  );
}

describe('MaterialFormFields — подсказка тегов (ADR-0058)', () => {
  it('уже заведённые теги приходят опциями в даталист и ряд пилюль поля', async () => {
    mockedApiFetch.mockResolvedValue([
      makeTagSummary({ tag: 'старшая' }),
      makeTagSummary({ tag: 'база' }),
    ]);

    renderFields();

    const input = await screen.findByLabelText('Теги');
    const datalistId = input.getAttribute('list');
    const datalist = document.getElementById(datalistId ?? '');

    await vi.waitFor(() => {
      const options = datalist ? datalist.querySelectorAll('option') : [];
      expect(options.length).toBeGreaterThan(0);
    });
    expect(screen.getByRole('button', { name: 'старшая' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'база' })).toBeInTheDocument();
  });

  it('сбой подсказки — поле остаётся обычным текстовым вводом', async () => {
    mockedApiFetch.mockRejectedValue(new Error('нет сети'));

    renderFields(makeState({ tagsText: 'ян, база' }));

    const input = await screen.findByLabelText('Теги');
    expect(input).toHaveValue('ян, база');
  });
});
