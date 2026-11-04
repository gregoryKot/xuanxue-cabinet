// Ряд подсказок тегов курса (ADR-0072) — по образцу
// materials/MaterialFormFields.test.tsx: сеть тегов мокается напрямую, без
// прохождения через весь ClassEditorScreen.
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TagSummaryDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { apiFetch } from '../api/http';
import type { UseGroupsResult } from '../groups/useGroups';
import { ClassFormFields } from './ClassFormFields';
import { initialClassFormState } from './classFormInput';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

// Группы школы в этом файле не предмет проверки — список уже загружен и пуст.
const NO_GROUPS: UseGroupsResult = {
  groups: [],
  loading: false,
  error: null,
  reload: vi.fn(),
  create: vi.fn(),
  rename: vi.fn(),
  remove: vi.fn(),
};

function makeTagSummary(overrides: Partial<TagSummaryDto> = {}): TagSummaryDto {
  return {
    tag: 'начинающие',
    lessonCount: 0,
    materialCount: 0,
    ...overrides,
  };
}

describe('ClassFormFields — подсказка тегов (ADR-0072)', () => {
  it('уже заведённые теги школы приходят пилюлями под полем', async () => {
    mockedApiFetch.mockResolvedValue([makeTagSummary()]);

    render(
      <ClassFormFields
        state={initialClassFormState(null)}
        setField={vi.fn()}
        error={null}
        teachers={[]}
        teachersError={null}
        onRetryTeachers={vi.fn()}
        groups={NO_GROUPS}
      />,
    );

    expect(await screen.findByRole('button', { name: 'начинающие' })).toBeInTheDocument();
  });
});
