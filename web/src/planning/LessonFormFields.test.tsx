// Ряд подсказок тегов на дате занятия (ADR-0075) — по образцу
// materials/MaterialFormFields.test.tsx: сеть тегов мокается напрямую, без
// прохождения через весь LessonEditorScreen.
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TagSummaryDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { apiFetch } from '../api/http';
import { LessonFormFields } from './LessonFormFields';
import { initialLessonFormState } from './lessonFormInput';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

function makeTagSummary(overrides: Partial<TagSummaryDto> = {}): TagSummaryDto {
  return {
    tag: 'дракон',
    lessonCount: 0,
    materialCount: 0,
    channelCount: 0,
    examItemCount: 0,
    ...overrides,
  };
}

describe('LessonFormFields — подсказка тегов (ADR-0075)', () => {
  it('уже заведённые теги школы приходят пилюлями под полем (только при правке)', async () => {
    mockedApiFetch.mockResolvedValue([makeTagSummary({ tag: 'дракон' })]);

    render(
      <LessonFormFields
        state={initialLessonFormState(null, [])}
        setField={vi.fn()}
        error={null}
        isCreate={false}
        classes={[]}
        teachers={[]}
        teachersError={null}
        onRetryTeachers={vi.fn()}
      />,
    );

    expect(await screen.findByRole('button', { name: 'дракон' })).toBeInTheDocument();
  });
});
