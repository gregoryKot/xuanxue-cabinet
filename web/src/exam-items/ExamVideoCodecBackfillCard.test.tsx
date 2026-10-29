import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/http';
import type * as HttpModule from '../api/http';
import {
  mockApiByPath,
  mockedApiFetch,
  resetApiFetchBetweenTests,
} from '../test-support/apiFetchMock';
import type { VideoProbe } from '../video-upload/probeVideoCodec';
import { makeCodecBackfillDeps } from './examVideoCodecBackfillDeps';
import { ExamVideoCodecBackfillCard } from './ExamVideoCodecBackfillCard';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});
// Настоящие шаги ждут WebCodecs и сеть; здесь проверяется карточка, а не они.
vi.mock('./examVideoCodecBackfillDeps', () => ({ makeCodecBackfillDeps: vi.fn() }));

resetApiFetchBetweenTests();

const BUTTON = { name: 'Перегнать видео' };
const HEVC: VideoProbe = { codec: 'hevc', canConvert: true };

function useDeps(overrides: Partial<ReturnType<typeof makeCodecBackfillDeps>> = {}) {
  vi.mocked(makeCodecBackfillDeps).mockReturnValue({
    probe: vi.fn(() => Promise.resolve(HEVC)),
    convert: vi.fn(() => Promise.resolve<Blob | null>(new Blob([new Uint8Array(4)]))),
    upload: vi.fn((file: Blob) => Promise.resolve({ id: 'new', sizeBytes: file.size })),
    ...overrides,
  });
}

function renderCard(count: number | null, onFinished = vi.fn()) {
  render(
    <ExamVideoCodecBackfillCard codecPendingCount={count} onFinished={onFinished} />,
  );
  return onFinished;
}

describe('ExamVideoCodecBackfillCard — когда показывается', () => {
  it.each([null, 0])('число ждущих перегона %s — карточки нет', (count) => {
    const { container } = render(
      <ExamVideoCodecBackfillCard codecPendingCount={count} onFinished={vi.fn()} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('есть что перегонять — объяснение с числом, местом запуска и одна кнопка', () => {
    renderCard(12);

    expect(screen.getByText('12 видео').tagName).toBe('STRONG');
    expect(screen.getByText('Mac или iPhone').tagName).toBe('STRONG');
    expect(screen.getByText(/Оригиналы остаются на месте/)).toBeInTheDocument();
    expect(screen.getByRole('button', BUTTON)).toBeEnabled();
  });
});

describe('ExamVideoCodecBackfillCard — прогон', () => {
  it('нажатие перегоняет видео, показывает итог и просит экран перечитать сводку', async () => {
    const user = userEvent.setup();
    useDeps();
    mockApiByPath({
      '/exam-videos/codec-pending': [{ id: 'a' }, { id: 'b' }],
      '/exam-videos/a/replace': { id: 'a' },
      '/exam-videos/b/replace': { id: 'b' },
    });
    const onFinished = renderCard(2);

    await user.click(screen.getByRole('button', BUTTON));

    expect(await screen.findByText(/Готово: перегнано/)).toHaveTextContent(
      'Готово: перегнано 2',
    );
    expect(onFinished).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', BUTTON)).not.toBeInTheDocument();
    expect(screen.queryByText(/Оригиналы остаются/)).not.toBeInTheDocument();
  });

  it('прогон оборвался отказом в доступе — текст ошибки, кнопка остаётся', async () => {
    const user = userEvent.setup();
    useDeps();
    mockApiByPath({
      '/exam-videos/codec-pending': [{ id: 'a' }],
      '/exam-videos/a/replace': new ApiError('Нет прав', 403, 'forbidden'),
    });
    renderCard(1);

    await user.click(screen.getByRole('button', BUTTON));

    const error = await screen.findByText(/Войдите заново/);
    expect(error.closest('p')).toHaveStyle({ color: 'var(--danger)' });
    expect(screen.getByRole('button', BUTTON)).toBeInTheDocument();
  });

  it('браузер не умеет перегонять — итог с причиной, оригиналы целы, кнопка остаётся', async () => {
    const user = userEvent.setup();
    useDeps({
      probe: vi.fn(() =>
        Promise.resolve<VideoProbe>({ codec: 'hevc', canConvert: false }),
      ),
    });
    mockApiByPath({
      '/exam-videos/codec-pending': [{ id: 'a' }],
      '/exam-videos/a/codec': { id: 'a' },
    });
    renderCard(1);

    await user.click(screen.getByRole('button', BUTTON));

    expect(await screen.findByText(/не умеет читать HEVC/)).toHaveTextContent(
      'Не вышло 1 — оригиналы целы. Этот браузер не умеет читать HEVC. Запустите с Mac или iPhone.',
    );
    expect(screen.getByRole('button', BUTTON)).toBeEnabled();
  });

  it('пока идёт прогон, кнопка занята и показывает счётчик', async () => {
    const user = userEvent.setup();
    const convert = vi.fn(() => new Promise<Blob | null>(() => {}));
    useDeps({ convert });
    mockApiByPath({ '/exam-videos/codec-pending': [{ id: 'a' }] });
    renderCard(12);

    await user.click(screen.getByRole('button', BUTTON));

    await waitFor(() => expect(convert).toHaveBeenCalled());
    expect(screen.getByRole('button', BUTTON)).toBeDisabled();
    expect(screen.getByText(/Перегнано/)).toHaveTextContent('Перегнано 0 из 12');
    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
  });
});
