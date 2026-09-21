// Непривязанному Telegram компонент показывает кнопку связки (ADR-0034), а
// та живёт внутри AuthProvider и ходит в /auth/telegram/link-code — поэтому
// здесь мок http и провайдер вокруг рендера, хотя сам компонент остаётся
// обычным без сети (кроме самого addMediaLink, который приходит пропсом).
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
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
    offersTelegramLink: false,
    canChangeAnswer: true,
    addMediaLink: vi.fn().mockResolvedValue(true),
    linkStateFor: () => ({ pending: false, error: null }),
    removeMedia: vi.fn().mockResolvedValue(true),
    removeStateFor: () => ({ pending: false, error: null }),
    ...overrides,
  };
}

// MemoryRouter — «Убрать» открывает ConfirmDialog, а тот закрывается через
// useHistorySheet (useNavigate). Возвращает результат render(): тесту
// «Заменить» нужен rerender — подделать media так, как его вернул бы
// перечитанный после удаления ответ сервера.
function renderVideo(video: AttemptVideoControls, itemId = 'q3') {
  mockApiByPath({ '/auth/me': new Promise(() => {}) });
  return render(
    <MemoryRouter>
      <AuthProvider>
        <AttemptQuestionVideo itemId={itemId} video={video} />
      </AuthProvider>
    </MemoryRouter>,
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

// ADR-0086: снять ошибочную ссылку может тот, кто её прислал — только свою
// запись kind: 'link' и только пока попытку не оценили.
describe('AttemptQuestionVideo — «Заменить»/«Убрать» у своей ссылки (ADR-0086)', () => {
  const LINK: ExamMediaDto = {
    id: 'm1',
    attemptId: 'a1',
    itemId: 'q3',
    kind: 'link',
    url: 'https://example.com/v',
    receivedAt: '2026-09-12T16:30:00.000Z',
  };
  const FROM_BOT: ExamMediaDto = {
    id: 'm2',
    attemptId: 'a1',
    itemId: 'q3',
    kind: 'telegram',
    durationSec: 40,
    receivedAt: '2026-09-12T16:31:00.000Z',
  };
  const MANUAL: ExamMediaDto = {
    id: 'm3',
    attemptId: 'a1',
    itemId: 'q3',
    kind: 'manual',
    note: 'Показал на занятии',
    receivedAt: '2026-09-12T16:32:00.000Z',
  };

  it('у своей ссылки видны «Заменить» и «Убрать», у записи бота и ручной отметки — нет', () => {
    renderVideo(makeVideo({ media: [LINK, FROM_BOT, MANUAL] }));

    expect(screen.getAllByRole('button', { name: 'Заменить' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Убрать' })).toHaveLength(1);
  });

  it('попытку оценили (canChangeAnswer: false) — кнопок нет ни у какой записи', () => {
    renderVideo(makeVideo({ media: [LINK, FROM_BOT], canChangeAnswer: false }));

    expect(screen.queryByRole('button', { name: 'Заменить' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Убрать' })).not.toBeInTheDocument();
  });

  it('«Убрать» → подтверждение → зовёт removeMedia с id этой записи', async () => {
    const removeMedia = vi.fn().mockResolvedValue(true);
    const user = userEvent.setup();
    renderVideo(makeVideo({ media: [LINK], removeMedia }));

    await user.click(screen.getByRole('button', { name: 'Убрать' }));
    expect(
      screen.getByRole('dialog', { name: 'Убрать ссылку на видео?' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Убрать ссылку' }));

    expect(removeMedia).toHaveBeenCalledWith('m1');
  });

  // Read-after-write: в реальном экране media после removeMedia приходит из
  // перечитанной попытки (useAttemptMedia.ts), здесь этот ответ подделан
  // через rerender — форма ссылки должна вернуться на место записи.
  it('«Заменить» → после успеха на месте записи снова форма ссылки', async () => {
    const removeMedia = vi.fn().mockResolvedValue(true);
    const user = userEvent.setup();
    const { rerender } = renderVideo(makeVideo({ media: [LINK], removeMedia }));

    await user.click(screen.getByRole('button', { name: 'Заменить' }));
    expect(removeMedia).toHaveBeenCalledWith('m1');

    rerender(
      <MemoryRouter>
        <AuthProvider>
          <AttemptQuestionVideo
            itemId="q3"
            video={makeVideo({ media: [], removeMedia })}
          />
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(screen.getByLabelText('Ссылка на видео')).toBeInTheDocument();
  });

  it('ошибка удаления видна пользователю', () => {
    renderVideo(
      makeVideo({
        media: [LINK],
        removeStateFor: (mediaId) =>
          mediaId === 'm1'
            ? {
                pending: false,
                error: { message: 'Работу уже проверили, менять ответ поздно.' },
              }
            : { pending: false, error: null },
      }),
    );

    expect(
      screen.getByText('Работу уже проверили, менять ответ поздно.'),
    ).toBeInTheDocument();
  });
});
