// LessonSheet напрямую, с фейковыми onCreate/onUpdate/onAddRecording — по
// образцу schedule/ClassSheet.test.tsx.
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type {
  AddRecordingInput,
  ClassDto,
  CreateLessonInput,
  LessonDto,
  TeacherOptionDto,
  UpdateLessonInput,
} from '@xuanxue/shared';
import { ApiError } from '../api/http';
import { LessonSheet } from './LessonSheet';

function makeClass(overrides: Partial<ClassDto> = {}): ClassDto {
  return {
    id: 'c1',
    title: 'Тайцзицюань, средняя группа',
    groupLabel: '',
    format: 'online',
    rules: [],
    tz: 'Asia/Jerusalem',
    channelIds: [],
    leadMinutes: 30,
    active: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeLesson(overrides: Partial<LessonDto> = {}): LessonDto {
  return {
    id: 'l1',
    classId: 'c1',
    startsAt: '2026-09-08T16:00:00.000Z',
    durationMin: 60,
    topic: 'Пятое занятие цикла',
    status: 'scheduled',
    recordings: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

interface RenderSheetOverrides {
  onCreate?: (input: CreateLessonInput) => Promise<void>;
  onUpdate?: (id: string, input: UpdateLessonInput) => Promise<void>;
  onAddRecording?: (id: string, input: AddRecordingInput) => Promise<void>;
  onSendNow?: (id: string) => Promise<void>;
}

interface RenderSheetOptions extends RenderSheetOverrides {
  classes?: ClassDto[];
  teachers?: TeacherOptionDto[];
}

function renderSheet(lessonDto: LessonDto | null, overrides: RenderSheetOptions = {}) {
  const onClose = vi.fn();
  const onCreate = overrides.onCreate ?? vi.fn().mockResolvedValue(undefined);
  const onUpdate = overrides.onUpdate ?? vi.fn().mockResolvedValue(undefined);
  const onAddRecording = overrides.onAddRecording ?? vi.fn().mockResolvedValue(undefined);
  const onSendNow = overrides.onSendNow ?? vi.fn().mockResolvedValue(undefined);

  render(
    <MemoryRouter initialEntries={['/planning']}>
      <LessonSheet
        lessonDto={lessonDto}
        classes={overrides.classes ?? [makeClass()]}
        teachers={overrides.teachers ?? []}
        onClose={onClose}
        onCreate={onCreate}
        onUpdate={onUpdate}
        onAddRecording={onAddRecording}
        onSendNow={onSendNow}
      />
    </MemoryRouter>,
  );

  return { onClose, onCreate, onUpdate, onAddRecording, onSendNow };
}

describe('LessonSheet — создание разового занятия', () => {
  it('заголовок «Разовое занятие», classId выбирается из списка', async () => {
    const user = userEvent.setup();
    const { onCreate } = renderSheet(null, {
      classes: [makeClass(), makeClass({ id: 'c2', title: 'Цигун для глаз' })],
    });

    expect(screen.getByRole('heading', { name: 'Разовое занятие' })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Занятие расписания'), 'c2');
    await user.type(screen.getByLabelText('Тема'), 'Открытое занятие');
    await user.type(screen.getByLabelText('Дата и время начала'), '2026-09-08T19:00');
    const durationField = screen.getByLabelText('Длительность, минут');
    await user.clear(durationField);
    await user.type(durationField, '45');

    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          classId: 'c2',
          topic: 'Открытое занятие',
          durationMin: 45,
        }),
      ),
    );
  });

  it('без даты начала — «Сохранить» не отправляет запрос, показывает ошибку', async () => {
    const user = userEvent.setup();
    const { onCreate } = renderSheet(null);

    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByText(/дату и время/)).toBeInTheDocument();
    expect(onCreate).not.toHaveBeenCalled();
  });
});

describe('LessonSheet — правка занятия', () => {
  it('сохранение шлёт PATCH с темой, датой, длительностью и сбросом zoom/note', async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderSheet(makeLesson());

    await user.clear(screen.getByLabelText('Тема'));
    await user.type(screen.getByLabelText('Тема'), 'Новая тема');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith(
        'l1',
        expect.objectContaining({
          topic: 'Новая тема',
          zoomLinkOverride: null,
          zoomPasswordOverride: null,
          note: null,
        }),
      ),
    );
  });

  it('заполненные zoom-override и заметка уходят в PATCH как есть', async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderSheet(makeLesson());

    const durationField = screen.getByLabelText('Длительность, минут');
    await user.clear(durationField);
    await user.type(durationField, '90');
    await user.type(
      screen.getByLabelText('Ссылка Zoom на это занятие'),
      'https://zoom.example/once',
    );
    await user.type(screen.getByLabelText('Пароль Zoom на это занятие'), '9999');
    await user.type(screen.getByLabelText('Заметка'), 'Взять новый плейлист');

    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith(
        'l1',
        expect.objectContaining({
          durationMin: 90,
          zoomLinkOverride: 'https://zoom.example/once',
          zoomPasswordOverride: '9999',
          note: 'Взять новый плейлист',
        }),
      ),
    );
  });

  it('ошибка сервера с details — список под формой', async () => {
    const user = userEvent.setup();
    const onUpdate = vi
      .fn()
      .mockRejectedValue(
        new ApiError('Проверьте поля.', 400, 'invalid_input', ['topic: слишком длинная']),
      );
    renderSheet(makeLesson(), { onUpdate });

    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Проверьте поля.');
    expect(alert).toHaveTextContent('topic: слишком длинная');
  });

  it('ведущий — select с подсказкой про расписание, выбор уходит в leaderId', async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderSheet(makeLesson(), {
      teachers: [{ id: 't1', name: 'Дмитрий' }],
    });

    expect(
      screen.getByText('Если не указан — ведущий занятия из расписания'),
    ).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Ведущий'), 't1');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith(
        'l1',
        expect.objectContaining({ leaderId: 't1' }),
      ),
    );
  });

  it('«— не указан —» у занятия с ведущим — PATCH с leaderId: null', async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderSheet(makeLesson({ leaderId: 't1' }), {
      teachers: [{ id: 't1', name: 'Дмитрий' }],
    });

    await user.selectOptions(screen.getByLabelText('Ведущий'), '— не указан —');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith(
        'l1',
        expect.objectContaining({ leaderId: null }),
      ),
    );
  });

  it('создание разового занятия — поля «Ведущий» нет (наследуется от расписания)', () => {
    renderSheet(null);
    expect(screen.queryByLabelText('Ведущий')).not.toBeInTheDocument();
  });

  it('не-ApiError сбой при сохранении — общий текст', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn().mockRejectedValue(new Error('boom'));
    renderSheet(makeLesson(), { onUpdate });

    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось сохранить. Попробуйте ещё раз.',
    );
  });
});

describe('LessonSheet — отмена и возврат в расписание', () => {
  it('«Отменить занятие» открывает подтверждение, подтверждение шлёт PATCH status=cancelled', async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderSheet(makeLesson());

    await user.click(screen.getByRole('button', { name: 'Отменить занятие' }));
    expect(screen.getByRole('dialog', { name: 'Отменить занятие?' })).toBeInTheDocument();

    await user.click(
      screen.getAllByRole('button', { name: 'Отменить занятие' })[1] as HTMLElement,
    );

    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith('l1', { status: 'cancelled' }),
    );
  });

  it('Esc с открытым подтверждением закрывает только его, не лист занятия (ревью п.8)', async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderSheet(makeLesson());

    await user.click(screen.getByRole('button', { name: 'Отменить занятие' }));
    expect(screen.getByRole('dialog', { name: 'Отменить занятие?' })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(
      screen.queryByRole('dialog', { name: 'Отменить занятие?' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Дата занятия' })).toBeInTheDocument();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('отменённое занятие — «Вернуть в расписание» шлёт PATCH status=scheduled', async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderSheet(makeLesson({ status: 'cancelled' }));

    expect(
      screen.queryByRole('button', { name: 'Отменить занятие' }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Вернуть в расписание' }));

    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith('l1', { status: 'scheduled' }),
    );
  });

  it('сбой при отмене — текст ошибки на листе, лист не закрывается', async () => {
    const user = userEvent.setup();
    const onUpdate = vi
      .fn()
      .mockRejectedValue(new ApiError('Занятие уже отменено.', 409, 'conflict'));
    const { onClose } = renderSheet(makeLesson(), { onUpdate });

    await user.click(screen.getByRole('button', { name: 'Отменить занятие' }));
    await user.click(
      screen.getAllByRole('button', { name: 'Отменить занятие' })[1] as HTMLElement,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('Занятие уже отменено.');
    expect(screen.getByRole('heading', { name: 'Дата занятия' })).toBeInTheDocument();
    // Регрессия: открытие/закрытие вложенного ConfirmDialog не должно само по
    // себе закрывать внешний лист (useHistorySheet — ревью п.18).
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('LessonSheet — секция «Запись» встроена', () => {
  it('лист занятия рендерит секцию «Запись» с существующими записями (детали — RecordingSection.test.tsx)', () => {
    renderSheet(
      makeLesson({
        recordings: [{ id: 'r1', title: 'Часть 1', url: 'https://youtu.be/1' }],
      }),
    );
    expect(screen.getByRole('heading', { name: 'Запись' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Часть 1' })).toHaveAttribute(
      'href',
      'https://youtu.be/1',
    );
  });

  it('создание занятия — секции «Запись» нет', () => {
    renderSheet(null);
    expect(screen.queryByText('Запись')).not.toBeInTheDocument();
  });
});

describe('LessonSheet — «Отправить ссылку сейчас» (аудит В12)', () => {
  it('есть у обычного занятия, подтверждение зовёт onSendNow с id', async () => {
    const user = userEvent.setup();
    const { onSendNow } = renderSheet(makeLesson());

    await user.click(screen.getByRole('button', { name: 'Отправить ссылку сейчас' }));
    await user.click(screen.getByRole('button', { name: 'Отправить сейчас' }));

    await waitFor(() => expect(onSendNow).toHaveBeenCalledWith('l1'));
  });

  it('отменённое занятие — кнопки нет', () => {
    renderSheet(makeLesson({ status: 'cancelled' }));
    expect(
      screen.queryByRole('button', { name: 'Отправить ссылку сейчас' }),
    ).not.toBeInTheDocument();
  });

  it('создание разового занятия — кнопки нет (нечего отправлять до сохранения)', () => {
    renderSheet(null);
    expect(
      screen.queryByRole('button', { name: 'Отправить ссылку сейчас' }),
    ).not.toBeInTheDocument();
  });
});
