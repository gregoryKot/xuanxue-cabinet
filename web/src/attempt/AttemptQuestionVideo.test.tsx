// Непривязанному Telegram компонент показывает кнопку связки (ADR-0034), а
// та живёт внутри AuthProvider и ходит в /auth/telegram/link-code — поэтому
// здесь мок http и провайдер вокруг рендера, хотя сам компонент остаётся
// обычным без сети (кроме самого addMediaLink, который приходит пропсом).
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EXAM_MEDIA_ATTEMPT_GRADED_MESSAGE, type ExamMediaDto } from '@xuanxue/shared';
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
    offersTelegramLink: false,
    acceptsAnswers: true,
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
    renderVideo(makeVideo({ telegramLinked: false, offersTelegramLink: true }));

    expect(
      screen.queryByRole('link', { name: /Отправить видео боту/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/вы вошли по почте/)).toBeInTheDocument();
    expect(screen.getByLabelText('Ссылка на видео')).toBeInTheDocument();
  });

  // ADR-0034: на месте кнопки бота — связка, а не тупик.
  it('Telegram не привязан — на месте кнопки бота кнопка связки', () => {
    renderVideo(makeVideo({ telegramLinked: false, offersTelegramLink: true }));

    expect(screen.getByRole('button', { name: 'Связать Telegram' })).toBeInTheDocument();
    expect(
      screen.getByText(/Свяжите его — и видео можно будет прислать одним сообщением/),
    ).toBeInTheDocument();
  });

  // ADR-0067: отметка «у меня нет Telegram» гасит предложение на всех
  // экранах, и видео-вопрос был последним местом, где оно оставалось. Форма
  // ссылки при этом никуда не девается — это и есть его путь ответить.
  it('отметка «у меня нет Telegram» — кнопки связки нет, форма ссылки на месте', () => {
    renderVideo(makeVideo({ telegramLinked: false, offersTelegramLink: false }));

    expect(
      screen.queryByRole('button', { name: 'Связать Telegram' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Свяжите его — и видео можно будет прислать одним сообщением/),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('Ссылка на видео')).toBeInTheDocument();
  });

  it('Telegram привязан — кнопки связки нет', () => {
    renderVideo(makeVideo());

    expect(
      screen.queryByRole('button', { name: 'Связать Telegram' }),
    ).not.toBeInTheDocument();
  });

  // ADR-0084: ссылка — основной путь для всех, подсказка про неё не зависит
  // от того, привязан Telegram или нет имени бота вовсе.
  it('подсказка про ссылку видна независимо от бота', () => {
    renderVideo(makeVideo());

    expect(
      screen.getByText(
        'Выложите запись на YouTube, во ВКонтакте, на Rutube или Яндекс.Диск и вставьте сюда ссылку.',
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

  // ADR-0084: ссылка — основной путь ответа, бот остаётся вторым; кнопка
  // бота при этом никуда не девается — она просто ниже формы, не выше.
  it('форма ссылки идёт раньше кнопки бота, кнопка бота остаётся на месте', () => {
    renderVideo(makeVideo());

    const form = screen.getByLabelText('Ссылка на видео');
    const botLink = screen.getByRole('link', { name: 'Отправить видео боту в Telegram' });

    expect(
      form.compareDocumentPosition(botLink) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  // Read-after-write (CLAUDE.md): отметка о получении обновится сама
  // (useAttemptVideoPoll.ts, ADR-0076) — строка рядом с кнопкой бота
  // говорит об этом прямо, перезагружать страницу вручную не нужно.
  it('рядом с кнопкой бота есть строка, что отметка появится сама', () => {
    renderVideo(makeVideo());

    expect(
      screen.getByText(
        'Отправите боту — здесь появится отметка, что видео дошло. Обновлять страницу не нужно.',
      ),
    ).toBeInTheDocument();
  });

  it('Telegram не привязан — строки про автообновление нет, кнопки бота тоже нет', () => {
    renderVideo(makeVideo({ telegramLinked: false, offersTelegramLink: true }));

    expect(
      screen.queryByText(/здесь появится отметка, что видео дошло/),
    ).not.toBeInTheDocument();
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

  // Снимок владельца 2026-09-21: по строке «Видео получено 21 сентября,
  // 19:46» нельзя было понять, ТА ли ссылка ушла — самой ссылки на экране не
  // было. Теперь первым делом виден сам ответ.
  it('сама ссылка видна и открывается в новой вкладке, время — тихой подписью', () => {
    renderVideo(makeVideo({ media: [RECEIVED] }));

    expect(screen.getByText('Вы прислали ссылку')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'https://example.com/v' });
    expect(link).toHaveAttribute('href', 'https://example.com/v');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByText(/Получено.*19:30/)).toBeInTheDocument();
    expect(screen.queryByText(/Ответ на этот вопрос — видео/)).not.toBeInTheDocument();
  });

  // ADR-0099: запись видно не уходя со страницы, но фрейм появляется только
  // по нажатию — до него наружу не уходит ни одного запроса.
  it('ссылка на YouTube — кнопка плеера, фрейма до нажатия нет', () => {
    renderVideo(
      makeVideo({
        media: [{ ...RECEIVED, url: 'https://youtu.be/dQw4w9WgXcQ' }],
      }),
    );

    expect(screen.getByRole('button', { name: 'Смотреть здесь' })).toBeInTheDocument();
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('ссылка на невстраиваемый хостинг — плеера нет вовсе, только сама ссылка', () => {
    renderVideo(
      makeVideo({ media: [{ ...RECEIVED, url: 'https://disk.yandex.ru/i/abc' }] }),
    );

    expect(
      screen.queryByRole('button', { name: 'Смотреть здесь' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'https://disk.yandex.ru/i/abc' }),
    ).toBeInTheDocument();
  });

  // ADR-0086 в силе: заменить ошибочную ссылку по-прежнему можно, но форма
  // ждёт под тихим действием, а не спорит с ответом за внимание.
  it('форма замены — под «Прислать другую ссылку», не раскрыта сразу', async () => {
    const user = userEvent.setup();
    renderVideo(makeVideo({ media: [RECEIVED] }));

    expect(screen.queryByLabelText('Ссылка на видео')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Прислать другую ссылку' }));

    expect(screen.getByLabelText('Ссылка на видео')).toBeInTheDocument();
    expect(screen.getByText('Новая ссылка заменит прежнюю.')).toBeInTheDocument();
  });

  // Видео из Telegram заменить нельзя (их может быть несколько на один
  // вопрос, ADR-0023) — звать туда второй раз незачем.
  it('кнопки бота и связки Telegram нет, даже если Telegram привязан', () => {
    renderVideo(makeVideo({ media: [RECEIVED], telegramLinked: true }));

    expect(
      screen.queryByRole('link', { name: /Отправить видео боту/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Связать Telegram' }),
    ).not.toBeInTheDocument();
  });

  it('отправка новой ссылки зовёт addMediaLink с тем же itemId', async () => {
    const addMediaLink = vi.fn().mockResolvedValue(true);
    const user = userEvent.setup();
    renderVideo(makeVideo({ media: [RECEIVED], addMediaLink }));

    await user.click(screen.getByRole('button', { name: 'Прислать другую ссылку' }));
    await user.type(
      screen.getByLabelText('Ссылка на видео'),
      'https://example.com/fixed',
    );
    await user.click(screen.getByRole('button', { name: 'Сохранить ссылку' }));

    expect(addMediaLink).toHaveBeenCalledWith('q3', 'https://example.com/fixed');
  });

  it('запись относится к другому вопросу — у этого форма остаётся', () => {
    renderVideo(makeVideo({ media: [{ ...RECEIVED, itemId: 'q4' }] }), 'q3');

    expect(screen.getByLabelText('Ссылка на видео')).toBeInTheDocument();
    expect(screen.queryByText(/Вы прислали/)).not.toBeInTheDocument();
  });

  // ADR-0037 «Последствия»: старый инстанс мог записать видео без itemId во
  // время деплоя (expand → contract) — такая запись не относится ни к
  // одному вопросу, форма вопроса её не показывает.
  it('запись без itemId к вопросу не относится', () => {
    const { itemId: _itemId, ...withoutItemId } = RECEIVED;
    renderVideo(makeVideo({ media: [withoutItemId] }), 'q3');

    expect(screen.getByLabelText('Ссылка на видео')).toBeInTheDocument();
    expect(screen.queryByText(/Вы прислали/)).not.toBeInTheDocument();
  });
});

// ADR-0086: после проверки работы бэкенд ссылку уже не примет. Форма, которая
// всегда получает отказ, — та же болезнь, от которой лечит этот ADR, поэтому
// на проверенной работе её нет вовсе, как и кнопки бота.
describe('AttemptQuestionVideo — работу уже проверили', () => {
  const graded = () => makeVideo({ acceptsAnswers: false });

  it('формы ссылки нет, вместо неё — честная строка, что ответ уже не примут', () => {
    renderVideo(graded());

    expect(screen.queryByLabelText('Ссылка на видео')).not.toBeInTheDocument();
    expect(screen.getByText(EXAM_MEDIA_ATTEMPT_GRADED_MESSAGE)).toBeInTheDocument();
  });

  it('кнопки бота нет — звать отвечать туда, где ответ уже не нужен, нельзя', () => {
    renderVideo(graded());

    expect(
      screen.queryByRole('link', { name: /Отправить видео боту/ }),
    ).not.toBeInTheDocument();
  });

  it('полученное видео показывается по-прежнему — ответ не прячем', () => {
    renderVideo(
      makeVideo({
        acceptsAnswers: false,
        media: [
          {
            id: 'm9',
            attemptId: 'a1',
            itemId: 'q3',
            kind: 'link',
            url: 'https://example.com/v',
            receivedAt: '2026-09-12T16:30:00.000Z',
          },
        ],
      }),
    );

    expect(screen.getByText('Вы прислали ссылку')).toBeInTheDocument();
    expect(screen.getByText(/Получено.*19:30/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Ссылка на видео')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Прислать другую ссылку' }),
    ).not.toBeInTheDocument();
  });
});
