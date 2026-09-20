// Поле «Теги» и его даталист-подсказка (ADR-0058) — остальные поля уже
// покрыты через MaterialEditorScreen.test.tsx, здесь только то, что не
// проверить без прямого контроля над useMaterialTagOptions.ts: сам список
// подсказок в даталисте, который экран собирает из живой сети.
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { MaterialDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { apiFetch } from '../api/http';
import { MaterialFormFields } from './MaterialFormFields';
import type { MaterialFormState } from './materialFormInput';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

function makeMaterial(overrides: Partial<MaterialDto> = {}): MaterialDto {
  return {
    id: 'm1',
    title: 'Ван Пэйшэн — форма 24',
    url: 'https://example.com/book',
    kind: 'book',
    classIds: [],
    lessonIds: [],
    access: 'all',
    tags: [],
    createdBy: 'u1',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
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
  it('уже заведённые теги приходят опциями в даталист поля', async () => {
    mockedApiFetch.mockResolvedValue([
      makeMaterial({ tags: ['старшая', 'база'] }),
      makeMaterial({ id: 'm2', tags: ['база', 'разминка'] }),
    ]);

    renderFields();

    const input = await screen.findByLabelText('Теги');
    const datalistId = input.getAttribute('list');
    const datalist = document.getElementById(datalistId ?? '');

    await vi.waitFor(() => {
      const options = datalist ? datalist.querySelectorAll('option') : [];
      expect(options.length).toBeGreaterThan(0);
    });
  });

  it('сбой подсказки — поле остаётся обычным текстовым вводом', async () => {
    mockedApiFetch.mockRejectedValue(new Error('нет сети'));

    renderFields(makeState({ tagsText: 'ян, база' }));

    const input = await screen.findByLabelText('Теги');
    expect(input).toHaveValue('ян, база');
  });
});
