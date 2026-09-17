import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { ExamGradingDto, GradingCommentPresetDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { mockApiByPath, resetApiFetchBetweenTests } from '../test-support/apiFetchMock';
import { GradingForm } from './GradingForm';

// Заготовки (GradingCommentPresets.tsx, ADR-0041) грузятся сами по себе
// внутри формы — без мока сети список остался бы вечно в ошибке загрузки,
// не влияя на остальные тесты этого файла (они его не проверяют), но тест
// вставки заготовки ниже нужен реальный ответ. MemoryRouter — ConfirmDialog
// удаления заготовки держит useHistorySheet (react-router).
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

function makeGrading(overrides: Partial<ExamGradingDto> = {}): ExamGradingDto {
  return {
    id: 'g1',
    attemptId: 'a1',
    examId: 'e1',
    userId: 'u1',
    graderId: 't1',
    outcome: 'passed',
    gradedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function renderForm(overrides: Partial<Parameters<typeof GradingForm>[0]> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(true);
  render(
    <GradingForm
      grading={undefined}
      onSubmit={onSubmit}
      saving={false}
      saveError={null}
      {...overrides}
    />,
  );
  return { onSubmit };
}

describe('GradingForm — новая оценка', () => {
  it('поля пустые, кнопка «Сохранить оценку»', () => {
    renderForm();

    expect(screen.getByLabelText('Комментарий')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Сохранить оценку' })).toBeInTheDocument();
  });

  it('отправка без выбранного итога — валидная ошибка, onSubmit не звался', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await user.click(screen.getByRole('button', { name: 'Сохранить оценку' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Выберите итог проверки.');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('заполненная валидная форма — onSubmit с правильным телом запроса', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await user.type(screen.getByLabelText('Комментарий'), 'Хорошо сдал');
    await user.selectOptions(screen.getByLabelText('Итог'), 'passed');
    await user.click(screen.getByRole('button', { name: 'Сохранить оценку' }));

    expect(onSubmit).toHaveBeenCalledWith({
      comment: 'Хорошо сдал',
      outcome: 'passed',
    });
  });

  it('без комментария — уходит undefined, не пустая строка', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await user.selectOptions(screen.getByLabelText('Итог'), 'failed');
    await user.click(screen.getByRole('button', { name: 'Сохранить оценку' }));

    expect(onSubmit).toHaveBeenCalledWith({ comment: undefined, outcome: 'failed' });
  });
});

describe('GradingForm — оценка уже стоит', () => {
  it('поля заполнены прежней оценкой, кнопка «Переписать оценку»', () => {
    renderForm({ grading: makeGrading({ comment: 'В целом сдал' }) });

    expect(screen.getByLabelText('Комментарий')).toHaveValue('В целом сдал');
    expect(screen.getByLabelText('Итог')).toHaveValue('passed');
    expect(screen.getByRole('button', { name: 'Переписать оценку' })).toBeInTheDocument();
  });
});

describe('GradingForm — ошибка сервера', () => {
  it('показывается под формой', () => {
    renderForm({ saveError: { message: 'Не удалось сохранить оценку.' } });

    expect(screen.getByRole('alert')).toHaveTextContent('Не удалось сохранить оценку.');
  });
});

describe('GradingForm — заготовка комментария (ADR-0041)', () => {
  it('клик по заготовке дописывает её текст в поле «Комментарий»', async () => {
    mockApiByPath({ '/grading-presets': [makePreset()] });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <GradingForm
          grading={undefined}
          onSubmit={vi.fn().mockResolvedValue(true)}
          saving={false}
          saveError={null}
        />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText('Комментарий'), 'Хорошая работа');
    await user.click(
      await screen.findByRole('button', { name: 'Держите центр тяжести' }),
    );

    expect(screen.getByLabelText('Комментарий')).toHaveValue(
      'Хорошая работа\nДержите центр тяжести',
    );
  });
});
