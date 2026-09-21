// Кнопка «Прислать мне в Telegram» (AttemptReviewMediaItem.tsx) рендерит
// TelegramLinkButton, когда чата с ботом нет, а та живёт внутри AuthProvider
// и ходит в /auth/telegram/link-code (тот же приём, что
// attempt/AttemptQuestionVideo.test.tsx) — поэтому здесь мок http и
// провайдер вокруг рендера, хотя onMarkManual/onSendToMe сами остаются
// пропсами без сети.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ExamMediaDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { AuthProvider } from '../auth/AuthProvider';
import { mockApiByPath, resetApiFetchBetweenTests } from '../test-support/apiFetchMock';
import { stubViewerTimeZone } from '../test-support/viewerTimeZone';
import { AttemptReviewMedia } from './AttemptReviewMedia';
import type { SendMediaState } from './useAttemptReviewMedia';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();
stubViewerTimeZone();

const IDLE_SEND_STATE: SendMediaState = { pending: false, error: null, sent: false };

function makeMedia(overrides: Partial<ExamMediaDto> = {}): ExamMediaDto {
  return {
    id: 'm1',
    attemptId: 'a1',
    kind: 'telegram',
    receivedAt: '2026-09-12T00:00:00Z',
    ...overrides,
  };
}

function renderMedia(overrides: Partial<Parameters<typeof AttemptReviewMedia>[0]> = {}) {
  mockApiByPath({ '/auth/me': new Promise(() => {}) });
  const onMarkManual = vi.fn().mockResolvedValue(true);
  const onSendToMe = vi.fn().mockResolvedValue(true);
  render(
    <AuthProvider>
      <AttemptReviewMedia
        media={[]}
        onMarkManual={onMarkManual}
        marking={false}
        markError={null}
        onSendToMe={onSendToMe}
        sendStateFor={() => IDLE_SEND_STATE}
        botChatActive={true}
        offersTelegramLink={false}
        {...overrides}
      />
    </AuthProvider>,
  );
  return { onMarkManual, onSendToMe };
}

describe('AttemptReviewMedia — видео нет', () => {
  it('честная строка и кнопка «Отметить, что видео принято»', async () => {
    const user = userEvent.setup();
    const { onMarkManual } = renderMedia();

    expect(screen.getByText('Видео пока не получено.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Отметить, что видео принято' }));

    expect(onMarkManual).toHaveBeenCalled();
  });

  it('сбой ручной отметки — ошибка видна под кнопкой', () => {
    renderMedia({ markError: { message: 'Не удалось отметить видео.' } });

    expect(screen.getByText('Не удалось отметить видео.')).toBeInTheDocument();
  });

  it('без onMarkManual (блок «без вопроса») — кнопки нет, ничего не падает', () => {
    renderMedia({ onMarkManual: undefined });

    expect(screen.getByText('Видео пока не получено.')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Отметить, что видео принято' }),
    ).not.toBeInTheDocument();
  });
});

describe('AttemptReviewMedia — заголовок', () => {
  it('heading задан — заголовок виден', () => {
    renderMedia({ heading: 'Видео без вопроса' });

    expect(
      screen.getByRole('heading', { name: 'Видео без вопроса' }),
    ).toBeInTheDocument();
  });

  it('heading не задан (видео-вопрос) — заголовка нет', () => {
    renderMedia();

    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });
});

describe('AttemptReviewMedia — пояснение', () => {
  it('description задан — текст виден под заголовком', () => {
    renderMedia({ heading: 'Видео без вопроса', description: 'Посмотрите его сами.' });

    expect(screen.getByText('Посмотрите его сами.')).toBeInTheDocument();
  });

  it('description не задан (видео-вопрос) — пояснения нет', () => {
    renderMedia();

    expect(screen.queryByText('Посмотрите его сами.')).not.toBeInTheDocument();
  });
});

describe('AttemptReviewMedia — каждый вид получения', () => {
  it('kind: telegram — длительность, факт способа, без обещания «смотрите там же»', () => {
    renderMedia({ media: [makeMedia({ kind: 'telegram', durationSec: 220 })] });

    expect(screen.getByText(/3 мин 40 с/)).toBeInTheDocument();
    expect(screen.getByText('Прислано сообщением боту в Telegram.')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('kind: link — кликабельная ссылка, открывается в новой вкладке, кнопки «Прислать мне» нет', () => {
    renderMedia({
      media: [makeMedia({ kind: 'link', url: 'https://example.com/v' })],
    });

    const link = screen.getByRole('link', { name: 'Открыть ссылку на видео' });
    expect(link).toHaveAttribute('href', 'https://example.com/v');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(
      screen.queryByRole('button', { name: 'Прислать мне в Telegram' }),
    ).not.toBeInTheDocument();
  });

  it('kind: manual — подпись учителя видна, кнопки «Прислать мне» нет', () => {
    renderMedia({
      media: [makeMedia({ kind: 'manual', note: 'Прислал в личку ВКонтакте' })],
    });

    expect(
      screen.getByText('Отмечено вручную: Прислал в личку ВКонтакте'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Прислать мне в Telegram' }),
    ).not.toBeInTheDocument();
  });

  it('несколько записей — кнопка «Отметить вручную» не нужна и не видна', () => {
    renderMedia({ media: [makeMedia(), makeMedia({ id: 'm2' })] });

    expect(
      screen.queryByRole('button', { name: 'Отметить, что видео принято' }),
    ).not.toBeInTheDocument();
  });
});

describe('AttemptReviewMedia — прислать себе видео из Telegram (доп. к ADR-0023)', () => {
  it('активный чат — кнопка шлёт onSendToMe с id этой записи', async () => {
    const user = userEvent.setup();
    const { onSendToMe } = renderMedia({ media: [makeMedia({ id: 'm7' })] });

    await user.click(screen.getByRole('button', { name: 'Прислать мне в Telegram' }));

    expect(onSendToMe).toHaveBeenCalledWith('m7');
  });

  it('успех — короткая строка вместо кнопки', () => {
    renderMedia({
      media: [makeMedia()],
      sendStateFor: () => ({ pending: false, error: null, sent: true }),
    });

    expect(
      screen.getByText('Видео ушло в чат с ботом. Откройте Telegram — оно там.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Прислать мне в Telegram' }),
    ).not.toBeInTheDocument();
  });

  it('ошибка сервера — видна под кнопкой, кнопка остаётся (можно повторить)', () => {
    renderMedia({
      media: [makeMedia()],
      sendStateFor: () => ({
        pending: false,
        error: { message: 'У вас нет активного чата с ботом.' },
        sent: false,
      }),
    });

    expect(screen.getByText('У вас нет активного чата с ботом.')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Прислать мне в Telegram' }),
    ).toBeInTheDocument();
  });

  it('запрос идёт — кнопка занята (aria-busy)', () => {
    renderMedia({
      media: [makeMedia()],
      sendStateFor: () => ({ pending: true, error: null, sent: false }),
    });

    expect(
      screen.getByRole('button', { name: 'Прислать мне в Telegram' }),
    ).toHaveAttribute('aria-busy', 'true');
  });

  it('без botChatActive — кнопки нет, есть объяснение и связать Telegram можно тут же', () => {
    renderMedia({
      media: [makeMedia()],
      botChatActive: false,
      offersTelegramLink: true,
    });

    expect(
      screen.queryByRole('button', { name: 'Прислать мне в Telegram' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Связать Telegram' })).toBeInTheDocument();
    expect(
      screen.getByText(/тогда бот сможет прислать вам это видео/),
    ).toBeInTheDocument();
  });

  // ADR-0067: отметка «у меня нет Telegram» гасит и это предложение — кнопки
  // связки нет, но факт «почему видео не видно» остаётся честным.
  it('без botChatActive и без offersTelegramLink — только объяснение, без кнопок', () => {
    renderMedia({
      media: [makeMedia()],
      botChatActive: false,
      offersTelegramLink: false,
    });

    expect(
      screen.queryByRole('button', { name: 'Прислать мне в Telegram' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Связать Telegram' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('Бот пришлёт видео, когда у вас будет открыт чат с ним.'),
    ).toBeInTheDocument();
  });
});
