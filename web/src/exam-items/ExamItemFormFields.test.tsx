// Ряд подсказок тегов вопроса экзамена — по образцу
// materials/MaterialFormFields.test.tsx: сеть тегов мокается напрямую, без
// прохождения через весь ExamItemEditorScreen.
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TagSummaryDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { apiFetch } from '../api/http';
import { ExamItemFormFields } from './ExamItemFormFields';
import { initialExamItemFormState } from './examItemFormInput';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

function makeTagSummary(overrides: Partial<TagSummaryDto> = {}): TagSummaryDto {
  return {
    tag: 'база',
    lessonCount: 0,
    materialCount: 0,
    channelCount: 0,
    examItemCount: 0,
    ...overrides,
  };
}

describe('ExamItemFormFields — подсказка тегов', () => {
  it('уже заведённые теги школы приходят пилюлями под полем', async () => {
    mockedApiFetch.mockResolvedValue([makeTagSummary()]);

    render(
      <ExamItemFormFields
        state={initialExamItemFormState(null)}
        setField={vi.fn()}
        error={null}
      />,
    );

    expect(await screen.findByRole('button', { name: 'база' })).toBeInTheDocument();
  });
});
