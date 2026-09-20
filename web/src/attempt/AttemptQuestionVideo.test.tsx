// Непривязанному Telegram компонент показывает кнопку связки (ADR-0034), а
// та живёт внутри AuthProvider и ходит в /auth/telegram/link-code — поэтому
// здесь мок http и провайдер вокруг рендера, хотя сам компонент остаётся
// обычным без сети (кроме самого addMediaLink, который приходит пропсом).
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ExamMediaDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { AuthProvider } from '../auth/AuthProvider';
import { mockApiByPath, resetApiFetchBetweenTests } from '../test-support/apiFetchMock';
import { stubViewerTimeZone } from '../test-support/viewerTimeZone';
import { AttemptQuestionVideo } from './AttemptQuestionVideo';
import type { AttemptVideoControls } from './useAttemptMedia';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();
stubViewerTimeZone();

function makeVideo(overrides: Partial<AttemptVideoControls> = {}): AttemptVideoControls {
  return {
    attemptId: 'a1',
    media: [],
    telegramBotUsername: 'xuanxue_bot',
    telegramLinked: true,
    acceptsTelegramOffer: true,
    addMediaLink: vi.fn().mockResolvedValue(true),
    linkStateFor: () => ({ pending: false, error: null }),
    ...overrides,
  };
}

function renderVideo(video: AttemptVideoControls, itemId = 'q3') {
  mockApiByPath({ '/auth/me': new Promise(() => {}) });
  render(
    <AuthProvider>
      <AttemptQuestionVideo itemId={itemId} video={video} />
    </AuthProvider>,
  );
}

describe('AttemptQuestionVideo — видео ещё не получено', () => {
  it('объяснение и форма ссылки видны, кнопки в Telegram нет без имени бота', () => {
    renderVideo(makeVideo({ telegramBotUsername: undefined }));

    expect(screen.getByText(/Ответ на этот вопрос — видео/)).toBeInTheDocument();
    expect(screen.getByLabelText('Ссылка на видео')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /Отправить видео боту/ }),
    ).not.toBeInTheDocument();
  });

  it('имя бота есть — кнопка-ссылка на чат с deep link на этот вопрос', () => {
    renderVideo(makeVideo());

    const link = screen.getByRole('link', { name: 'Отправить видео боту в Telegram' });
    expect(link).toHaveAttribute('href', 'https://t.me/xuanxue_bot?start=exam_a1_q3');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  // Инцидент 2026-09-16 (RUNBOOK §8.17): вошедший по почте прошёл по кнопке,
  // снял «кружок» и получил «не нашли эту попытку» — бот узнаёт человека
  // только по telegramId, поэтому кнопки на этом пути быть не должно.
  it('Telegram не привязан — кнопки бота нет даже при известном имени бота', () => {
    renderVideo(makeVideo({ telegramLinked: false }));

    expect(
      screen.queryByRole('link', { name: /Отправить видео боту/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/вы вошли по почте/)).toBeInTheDocument();
    expect(screen.getByLabelText('Ссылка на видео')).toBeInTheDocument();
  });

  // ADR-0034: на месте кнопки бота — связка, а не тупик.
  it('Telegram не привязан — на месте кнопки бота кнопка связки', () => {
    renderVideo(makeVideo({ telegramLinked: false }));

    expect(screen.getByRole('button', { name: 'Связать Telegram' })).toBeInTheDocument();
    expect(
      screen.getByText(/Свяжите его — и запись уйдёт одним сообщением/),
    ).toBeInTheDocument();
  });

  it('Telegram привязан — кнопки связки нет', () => {
    renderVideo(makeVideo());

    expect(
      screen.queryByRole('button', { name: 'Связать Telegram' }),
    ).not.toBeInTheDocument();
  });

  // ADR-0067: отметка «у меня нет Telegram» гасит и это предложение связки,
  // хотя условие здесь своё (`acceptsTelegramOffer`, не showsTelegramOffer,
  // ADR-0066 «Последствия») — запасной путь (форма ссылки) остаётся на месте.
  it('отметка «у меня нет Telegram» гасит кнопку связки', () => {
    renderVideo(makeVideo({ telegramLinked: false, acceptsTelegramOffer: false }));

    expect(
      screen.queryByRole('button', { name: 'Связать Telegram' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Свяжите его — и запись уйдёт одним сообщением/),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('Ссылка на видео')).toBeInTheDocument();
  });

  // Кнопку бота решает `telegramLinked`, не отметка предложения связки:
  // ADR-0067 прямо запрещает делать из неё рубильник отправки, она гасит
  // только предложение (ADR-0066 «Последствия»), а не приём уже привязанных.
  it('отметка не трогает кнопку бота у связанного', () => {
    renderVideo(makeVideo({ acceptsTelegramOffer: false }));

    expect(
      screen.getByRole('link', { name: 'Отправить видео боту в Telegram' }),
    ).toBeInTheDocument();
  });

  it('бота нет — прежняя подсказка про ссылку', () => {
    renderVideo(makeVideo({ telegramBotUsername: undefined }));

    expect(
      screen.getByText(
        'Нет Telegram — оставьте ссылку на видео: VK Видео, Rutube или Яндекс.Диск.',
      ),
    ).toBeInTheDocument();
  });

  it('отправка ссылки зовёт addMediaLink с itemId этого вопроса', async () => {
    const addMediaLink = vi.fn().mockResolvedValue(true);
    const user = userEvent.setup();
    renderVideo(makeVideo({ addMediaLink }));

    await user.type(screen.getByLabelText('Ссылка на видео'), 'https://example.com/v');
    await user.click(screen.getByRole('button', { name: 'Сохранить ссылку' }));

    expect(addMediaLink).toHaveBeenCalledWith('q3', 'https://example.com/v');
  });
});

describe('AttemptQuestionVideo — видео уже получено', () => {
  const RECEIVED: ExamMediaDto = {
    id: 'm1',
    attemptId: 'a1',
    itemId: 'q3',
    kind: 'link',
    url: 'https://example.com/v',
    receivedAt: '2026-09-12T16:30:00.000Z',
  };

  it('вместо формы — честная строка со временем, что и когда пришло', () => {
    renderVideo(makeVideo({ media: [RECEIVED] }));

    expect(screen.getByText(/Видео получено.*19:30/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Ссылка на видео')).not.toBeInTheDocument();
    expect(screen.queryByText(/Ответ на этот вопрос — видео/)).not.toBeInTheDocument();
  });

  it('запись относится к другому вопросу — у этого форма остаётся', () => {
    renderVideo(makeVideo({ media: [{ ...RECEIVED, itemId: 'q4' }] }), 'q3');

    expect(screen.getByLabelText('Ссылка на видео')).toBeInTheDocument();
    expect(screen.queryByText(/Видео получено/)).not.toBeInTheDocument();
  });

  // ADR-0037 «Последствия»: старый инстанс мог записать видео без itemId во
  // время деплоя (expand → contract) — такая запись не относится ни к
  // одному вопросу, форма вопроса её не показывает.
  it('запись без itemId к вопросу не относится', () => {
    const { itemId: _itemId, ...withoutItemId } = RECEIVED;
    renderVideo(makeVideo({ media: [withoutItemId] }), 'q3');

    expect(screen.getByLabelText('Ссылка на видео')).toBeInTheDocument();
    expect(screen.queryByText(/Видео получено/)).not.toBeInTheDocument();
  });
});
