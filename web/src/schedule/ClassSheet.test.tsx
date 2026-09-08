// ClassSheet напрямую, с фейковыми onCreate/onUpdate/onRemove — быстрее и
// точнее, чем гонять apiFetch через весь ScheduleScreen: здесь проверяются
// поля формы (ClassFormFields), список правил (RuleFields) и диалог-a11y.
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type {
  ChannelDto,
  ClassDto,
  CreateClassInput,
  TeacherOptionDto,
  UpdateClassInput,
} from '@xuanxue/shared';
import { ApiError } from '../api/http';
import { ClassSheet } from './ClassSheet';

function makeChannel(overrides: Partial<ChannelDto> = {}): ChannelDto {
  return {
    id: 'ch1',
    type: 'vk',
    title: 'ВК школы',
    active: true,
    target: '777',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeClass(overrides: Partial<ClassDto> = {}): ClassDto {
  return {
    id: 'c1',
    title: 'Тайцзицюань',
    groupLabel: 'средняя группа',
    format: 'online',
    zoomLink: 'https://zoom.example/1',
    zoomPassword: '1234',
    rules: [{ id: 'r1', weekday: 2, time: '19:00', durationMin: 60 }],
    tz: 'Asia/Jerusalem',
    channelIds: [],
    leadMinutes: 30,
    active: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

interface RenderSheetOverrides {
  onCreate?: (input: CreateClassInput) => Promise<void>;
  onUpdate?: (id: string, input: UpdateClassInput) => Promise<void>;
  onRemove?: (id: string) => Promise<void>;
  channels?: ChannelDto[];
  teachers?: TeacherOptionDto[];
}

function renderSheet(classDto: ClassDto | null, overrides: RenderSheetOverrides = {}) {
  const onClose = vi.fn();
  const onCreate = overrides.onCreate ?? vi.fn().mockResolvedValue(undefined);
  const onUpdate = overrides.onUpdate ?? vi.fn().mockResolvedValue(undefined);
  const onRemove = overrides.onRemove ?? vi.fn().mockResolvedValue(undefined);
  const channels = overrides.channels ?? [];
  const teachers = overrides.teachers ?? [];

  render(
    <MemoryRouter initialEntries={['/schedule']}>
      <ClassSheet
        classDto={classDto}
        channels={channels}
        teachers={teachers}
        onClose={onClose}
        onCreate={onCreate}
        onUpdate={onUpdate}
        onRemove={onRemove}
      />
    </MemoryRouter>,
  );

  return { onClose, onCreate, onUpdate, onRemove };
}

describe('ClassSheet — диалог (ревью п.9)', () => {
  it('role=dialog, aria-modal, подписан заголовком, заголовок в фокусе', () => {
    renderSheet(makeClass());

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    const heading = screen.getByRole('heading', { name: 'Занятие' });
    expect(dialog).toHaveAttribute('aria-labelledby', heading.id);
    expect(heading).toHaveFocus();
  });

  it('Esc закрывает лист', async () => {
    const { onClose } = renderSheet(makeClass());

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});

describe('ClassSheet — поля формы', () => {
  it('меняет подпись группы, формат, ссылку, пароль Zoom, минуты и переключатель', async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderSheet(makeClass());

    await user.clear(screen.getByLabelText('Подпись группы'));
    await user.type(screen.getByLabelText('Подпись группы'), 'старшая группа');
    await user.selectOptions(screen.getByLabelText('Формат'), 'offline');
    await user.clear(screen.getByLabelText('Пароль Zoom'));
    await user.type(screen.getByLabelText('Пароль Zoom'), '4321');
    await user.clear(screen.getByLabelText('За сколько минут слать ссылку'));
    await user.type(screen.getByLabelText('За сколько минут слать ссылку'), '15');
    await user.click(screen.getByLabelText('Занятие активно'));

    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onUpdate).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({
        groupLabel: 'старшая группа',
        format: 'offline',
        zoomPassword: '4321',
        leadMinutes: 15,
        active: false,
      }),
    );
  });

  it('очистка ссылки/пароля у существующего занятия — PATCH с null (ревью п.8)', async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderSheet(makeClass());

    await user.clear(screen.getByLabelText('Ссылка Zoom'));
    await user.clear(screen.getByLabelText('Пароль Zoom'));
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onUpdate).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({ zoomLink: null, zoomPassword: null }),
    );
  });

  it('создание: пустая ссылка/пароль — поля не отправляются (undefined, не null)', async () => {
    const user = userEvent.setup();
    const { onCreate } = renderSheet(null);

    await user.type(screen.getByLabelText('Название'), 'Новое занятие');
    await user.click(screen.getByRole('button', { name: 'Добавить время' }));
    fireEvent.change(screen.getByLabelText('Время начала'), {
      target: { value: '19:00' },
    });

    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({ zoomLink: undefined, zoomPassword: undefined }),
    );
  });
});

describe('ClassSheet — ведущий (аудит В4)', () => {
  it('выбор ведущего уходит в leaderId при сохранении', async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderSheet(makeClass(), {
      teachers: [
        { id: 't1', name: 'Дмитрий' },
        { id: 't2', name: 'Мария' },
      ],
    });

    await user.selectOptions(screen.getByLabelText('Ведущий'), 't2');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onUpdate).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({ leaderId: 't2' }),
    );
  });

  it('«— не указан —» у занятия с ведущим — PATCH с leaderId: null', async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderSheet(makeClass({ leaderId: 't1' }), {
      teachers: [{ id: 't1', name: 'Дмитрий' }],
    });

    await user.selectOptions(screen.getByLabelText('Ведущий'), '— не указан —');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onUpdate).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({ leaderId: null }),
    );
  });
});

describe('ClassSheet — правила расписания (ревью п.11)', () => {
  it('без единого правила — «Сохранить» недоступна', () => {
    renderSheet(makeClass({ rules: [] }));

    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeDisabled();
    expect(screen.getByText(/хотя бы один день/)).toBeInTheDocument();
  });

  it('добавляет новую строку правила и меняет её поля', async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderSheet(makeClass({ rules: [] }));

    await user.click(screen.getByRole('button', { name: 'Добавить время' }));
    await user.selectOptions(screen.getByLabelText('День недели'), '4');
    fireEvent.change(screen.getByLabelText('Время начала'), {
      target: { value: '20:00' },
    });
    const durationField = screen.getByLabelText(/Длительность, минут/);
    await user.clear(durationField);
    await user.type(durationField, '45');

    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onUpdate).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({
        rules: [expect.objectContaining({ weekday: 4, time: '20:00', durationMin: 45 })],
      }),
    );
  });

  it('убирает строку правила — при пустом списке «Сохранить» снова недоступна', async () => {
    const user = userEvent.setup();
    renderSheet(makeClass());

    await user.click(screen.getByRole('button', { name: 'Убрать' }));

    expect(screen.queryByLabelText('День недели')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeDisabled();
  });
});

describe('ClassSheet — каналы рассылки (ревью п.1)', () => {
  it('нет ни одного канала — подсказка со ссылкой на «Каналы»', () => {
    renderSheet(makeClass(), { channels: [] });

    expect(screen.getByText(/Каналов пока нет/)).toBeInTheDocument();
  });

  it('отметка канала уходит в channelIds при сохранении', async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderSheet(makeClass({ channelIds: [] }), {
      channels: [makeChannel({ id: 'ch1' })],
    });

    await user.click(screen.getByLabelText('ВК · ВК школы'));
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onUpdate).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({ channelIds: ['ch1'] }),
    );
  });

  it('снятие отметки убирает канал из channelIds при сохранении', async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderSheet(makeClass({ channelIds: ['ch1'] }), {
      channels: [makeChannel({ id: 'ch1' })],
    });

    await user.click(screen.getByLabelText('ВК · ВК школы'));
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onUpdate).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({ channelIds: [] }),
    );
  });
});

describe('ClassSheet — удаление занятия', () => {
  it('кнопка «Удалить» видна только для существующего занятия и вызывает onRemove', async () => {
    const user = userEvent.setup();
    const { onRemove } = renderSheet(makeClass());

    await user.click(screen.getByRole('button', { name: 'Удалить' }));

    expect(onRemove).toHaveBeenCalledWith('c1');
  });

  it('новое занятие — кнопки «Удалить» нет', () => {
    renderSheet(null);

    expect(screen.queryByRole('button', { name: 'Удалить' })).not.toBeInTheDocument();
  });

  it('409 при удалении — текст сервера остаётся на листе', async () => {
    const user = userEvent.setup();
    const onRemove = vi
      .fn()
      .mockRejectedValue(new ApiError('Есть запланированные занятия.', 409, 'conflict'));
    renderSheet(makeClass(), { onRemove });

    await user.click(screen.getByRole('button', { name: 'Удалить' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Есть запланированные занятия.',
    );
  });

  it('ошибка с details — список подробностей под сообщением', async () => {
    const user = userEvent.setup();
    const onUpdate = vi
      .fn()
      .mockRejectedValue(
        new ApiError('Проверьте поля.', 400, 'invalid_input', [
          'title: обязательное поле',
          'rules: минимум одно правило',
        ]),
      );
    renderSheet(makeClass(), { onUpdate });

    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Проверьте поля.');
    expect(alert).toHaveTextContent('title: обязательное поле');
    expect(alert).toHaveTextContent('rules: минимум одно правило');
  });
});
