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
import { captureVideoPoster } from '../video-upload/captureVideoPoster';
import { ExamVideoPosterBackfillCard } from './ExamVideoPosterBackfillCard';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});
// Настоящий снимок ждёт декодера и срока; здесь проверяется карточка, а не он.
vi.mock('../video-upload/captureVideoPoster', () => ({
  captureVideoPoster: vi.fn(),
}));

resetApiFetchBetweenTests();

const BUTTON = { name: 'Снять кадры' };

function renderCard(count: number | null, onFinished = vi.fn()) {
  render(
    <ExamVideoPosterBackfillCard withoutPosterCount={count} onFinished={onFinished} />,
  );
  return onFinished;
}

describe('ExamVideoPosterBackfillCard — когда показывается', () => {
  it.each([null, 0])('число без кадра %s — карточки нет', (count) => {
    const { container } = render(
      <ExamVideoPosterBackfillCard withoutPosterCount={count} onFinished={vi.fn()} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('есть видео без кадра — объяснение с числом и одна кнопка', () => {
    renderCard(54);

    expect(screen.getByText('54 видео').tagName).toBe('STRONG');
    expect(screen.getByText(/чёрную плитку/)).toBeInTheDocument();
    expect(screen.getByRole('button', BUTTON)).toBeEnabled();
  });
});

describe('ExamVideoPosterBackfillCard — прогон', () => {
  it('нажатие снимает кадры, показывает итог и просит экран перечитать сводку', async () => {
    const user = userEvent.setup();
    vi.mocked(captureVideoPoster).mockResolvedValue('AQID');
    mockApiByPath({
      '/exam-videos/without-poster': [{ id: 'a' }, { id: 'b' }],
      '/exam-videos/a/poster': { id: 'a' },
      '/exam-videos/b/poster': { id: 'b' },
    });
    const onFinished = renderCard(2);

    await user.click(screen.getByRole('button', BUTTON));

    expect(await screen.findByText(/Готово: снято/)).toHaveTextContent('Готово: снято 2');
    expect(onFinished).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', BUTTON)).not.toBeInTheDocument();
    expect(screen.queryByText(/чёрную плитку/)).not.toBeInTheDocument();
  });

  it('прогон оборвался отказом в доступе — текст ошибки, кнопка остаётся', async () => {
    const user = userEvent.setup();
    vi.mocked(captureVideoPoster).mockResolvedValue('AQID');
    mockApiByPath({
      '/exam-videos/without-poster': [{ id: 'a' }],
      '/exam-videos/a/poster': new ApiError('Нет прав', 403, 'forbidden'),
    });
    renderCard(1);

    await user.click(screen.getByRole('button', BUTTON));

    const error = await screen.findByText(/Войдите заново/);
    expect(error.closest('p')).toHaveStyle({ color: 'var(--danger)' });
    expect(screen.getByRole('button', BUTTON)).toBeInTheDocument();
  });

  it('часть не вышла — итог с причиной, кнопка остаётся для новой попытки', async () => {
    const user = userEvent.setup();
    vi.mocked(captureVideoPoster).mockResolvedValueOnce('AQID').mockResolvedValue(null);
    mockApiByPath({
      '/exam-videos/without-poster': [{ id: 'a' }, { id: 'b' }],
      '/exam-videos/a/poster': { id: 'a' },
    });
    renderCard(2);

    await user.click(screen.getByRole('button', BUTTON));

    expect(await screen.findByText(/не открывает их формат/)).toHaveTextContent(
      'Снято 1, не вышло 1 — этот браузер не открывает их формат. Попробуйте с Mac или iPhone.',
    );
    expect(screen.getByRole('button', BUTTON)).toBeEnabled();
  });

  it('пока идёт прогон, кнопка занята и показывает счётчик', async () => {
    const user = userEvent.setup();
    vi.mocked(captureVideoPoster).mockReturnValue(new Promise(() => {}));
    mockApiByPath({ '/exam-videos/without-poster': [{ id: 'a' }] });
    renderCard(54);

    await user.click(screen.getByRole('button', BUTTON));

    await waitFor(() => expect(captureVideoPoster).toHaveBeenCalled());
    expect(screen.getByRole('button', BUTTON)).toBeDisabled();
    expect(screen.getByText(/Снято/)).toHaveTextContent('Снято 0 из 54');
    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
  });
});
