// Запись занятия файлом (ADR-0180): выбор файла в форме «Добавить запись», ход
// загрузки общим загрузчиком и один запрос с файлом и/или ссылкой. Сеть — через
// `mockApiByPath` (не очередь `…Once`, check-once-mock-ratchet.mjs): путь
// отвечает одинаково, сколько бы раз и в каком порядке его ни спросили.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AddRecordingInput, LessonVideoDto } from '@xuanxue/shared';
import { ApiError } from '../api/http';
import type * as HttpModule from '../api/http';
import { mockApiByPath, resetApiFetchBetweenTests } from '../test-support/apiFetchMock';
import { RecordingSection } from './RecordingSection';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

const START_PATH = '/lesson-videos/uploads';
const PART_PATH = '/lesson-videos/u1/parts';
const COMPLETE_PATH = '/lesson-videos/u1/complete';
const EIGHT_MIB = 8 * 1024 * 1024;

const VIDEO: LessonVideoDto = {
  id: 'v1',
  contentType: 'video/mp4',
  sizeBytes: 20,
  createdAt: '2026-10-10T10:00:00Z',
};

function session(receivedParts: number[]) {
  return { id: 'u1', partBytes: EIGHT_MIB, partCount: 1, receivedParts };
}

/** Загрузка из одной части проходит до конца. */
function serverAcceptsUpload(): void {
  mockApiByPath({
    [START_PATH]: session([]),
    [PART_PATH]: session([1]),
    [COMPLETE_PATH]: VIDEO,
  });
}

function makeFile(): File {
  return new File([new Uint8Array(20)], 'zanyatie.mp4', { type: 'video/mp4' });
}

function renderSection() {
  const onAdd = vi
    .fn<(lessonId: string, input: AddRecordingInput) => Promise<void>>()
    .mockResolvedValue(undefined);
  render(<RecordingSection lessonId="l1" recordings={[]} onAdd={onAdd} />);
  return { onAdd, user: userEvent.setup() };
}

async function pickFile(user: ReturnType<typeof userEvent.setup>) {
  await user.upload(screen.getByLabelText('Выбрать файл записи'), makeFile());
}

describe('RecordingSection — файл записи', () => {
  it('только файл: после загрузки «Добавить запись» шлёт videoId без ссылки', async () => {
    serverAcceptsUpload();
    const { onAdd, user } = renderSection();

    await pickFile(user);
    expect(await screen.findByText('zanyatie.mp4')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Добавить запись' }));

    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));
    expect(onAdd).toHaveBeenCalledWith('l1', {
      title: undefined,
      url: undefined,
      videoId: 'v1',
    });
  });

  it('файл и ссылка вместе уходят одним запросом — одна запись', async () => {
    serverAcceptsUpload();
    const { onAdd, user } = renderSection();

    await user.type(screen.getByLabelText('Название записи'), 'Занятие целиком');
    await user.type(screen.getByLabelText('Ссылка на запись'), 'https://youtu.be/2');
    await pickFile(user);
    await screen.findByText('zanyatie.mp4');
    await user.click(screen.getByRole('button', { name: 'Добавить запись' }));

    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));
    expect(onAdd).toHaveBeenCalledWith('l1', {
      title: 'Занятие целиком',
      url: 'https://youtu.be/2',
      videoId: 'v1',
    });
  });

  it('пока файл грузится, «Добавить запись» недоступна и есть полоса прогресса', async () => {
    // Часть не отвечает: загрузка стоит на полпути.
    mockApiByPath({ [START_PATH]: session([]), [PART_PATH]: new Promise(() => {}) });
    const { onAdd, user } = renderSection();

    await user.type(screen.getByLabelText('Ссылка на запись'), 'https://youtu.be/2');
    await pickFile(user);

    expect(await screen.findByRole('progressbar')).toBeInTheDocument();
    const add = screen.getByRole('button', { name: 'Добавить запись' });
    expect(add).toBeDisabled();
    expect(screen.queryByLabelText('Выбрать файл записи')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Отменить' })).toBeInTheDocument();
    await user.click(add);
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('отказ сервера при загрузке — его текст на экране, ссылкой запись добавить можно', async () => {
    mockApiByPath({
      [START_PATH]: new ApiError(
        'Этот формат не подойдёт. Нужен mp4.',
        400,
        'invalid_input',
      ),
    });
    const { onAdd, user } = renderSection();

    await pickFile(user);
    expect(await screen.findByText('Этот формат не подойдёт. Нужен mp4.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Добавить запись' })).toBeEnabled();

    await user.type(screen.getByLabelText('Ссылка на запись'), 'https://youtu.be/2');
    await user.click(screen.getByRole('button', { name: 'Добавить запись' }));

    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));
    expect(onAdd).toHaveBeenCalledWith('l1', {
      title: undefined,
      url: 'https://youtu.be/2',
    });
  });

  it('«Убрать файл» снимает загруженное: без ссылки запись не добавится', async () => {
    serverAcceptsUpload();
    const { onAdd, user } = renderSection();

    await pickFile(user);
    await screen.findByText('zanyatie.mp4');
    await user.click(screen.getByRole('button', { name: 'Убрать файл' }));
    await user.click(screen.getByRole('button', { name: 'Добавить запись' }));

    expect(
      await screen.findByText('Выберите файл записи или укажите ссылку.'),
    ).toBeInTheDocument();
    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Выбрать файл записи')).toBeInTheDocument();
  });

  it('после успешного добавления форма пуста: можно выбрать следующий файл', async () => {
    serverAcceptsUpload();
    const { user } = renderSection();

    await pickFile(user);
    await screen.findByText('zanyatie.mp4');
    await user.click(screen.getByRole('button', { name: 'Добавить запись' }));

    expect(await screen.findByLabelText('Выбрать файл записи')).toBeInTheDocument();
    expect(screen.queryByText('zanyatie.mp4')).not.toBeInTheDocument();
  });

  it('объяснение на пути: куда попадёт файл и что нужно для каналов', () => {
    renderSection();

    expect(
      screen.getByText(/ученики увидят запись в «Записях занятий»/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Без ссылки запись видна/)).toBeInTheDocument();
  });
});
