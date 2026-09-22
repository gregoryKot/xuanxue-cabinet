// Ряд подсказок тегов отбора рассылки (ADR-0108) — по образцу
// materials/MaterialFormFields.test.tsx: сеть тегов мокается напрямую, без
// прохождения через весь ChannelEditorScreen.
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TagSummaryDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { apiFetch } from '../api/http';
import { ChannelFormFields } from './ChannelFormFields';
import { initialChannelFormState } from './channelFormInput';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

function makeTagSummary(overrides: Partial<TagSummaryDto> = {}): TagSummaryDto {
  return {
    tag: 'новички',
    lessonCount: 0,
    materialCount: 0,
    channelCount: 0,
    examItemCount: 0,
    ...overrides,
  };
}

describe('ChannelFormFields — подсказка тегов (ADR-0108)', () => {
  it('уже заведённые теги школы приходят пилюлями под полем', async () => {
    mockedApiFetch.mockResolvedValue([makeTagSummary()]);

    render(
      <ChannelFormFields
        state={initialChannelFormState(null)}
        setField={vi.fn()}
        error={null}
        isCreate
      />,
    );

    expect(await screen.findByRole('button', { name: 'новички' })).toBeInTheDocument();
  });
});
