// Непривязанному Telegram блок показывает кнопку связки (ADR-0034), а та
// живёт внутри AuthProvider и ходит в /auth/telegram/link-code — поэтому
// здесь мок http и провайдер вокруг рендера, хотя сам блок остаётся обычным
// компонентом без сети.
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ExamAttemptDto, ExamMediaDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { AuthProvider } from '../auth/AuthProvider';
import { mockApiByPath, resetApiFetchBetweenTests } from '../test-support/apiFetchMock';
import { AttemptMediaPrompt } from './AttemptMediaPrompt';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

function makeAttempt(overrides: Partial<ExamAttemptDto> = {}): ExamAttemptDto {
  return {
    id: 'a1',
    examId: 'e1',
    examTitle: 'Форма первого уровня',
    userId: 'u1',
    status: 'submitted',
    blocks: [],
    answers: [],
    startedAt: '2026-09-01T00:00:00Z',
    expired: false,
    ...overrides,
  };
}

function renderPrompt(overrides: Partial<Parameters<typeof AttemptMediaPrompt>[0]> = {}) {
  const onAddMediaLink = vi.fn().mockResolvedValue(true);
  mockApiByPath({ '/auth/me': new Promise(() => {}) });
  render(
    <AuthProvider>
      <AttemptMediaPrompt
        attempt={makeAttempt()}
        telegramLinked
        onAddMediaLink={onAddMediaLink}
        addingMediaLink={false}
        addMediaLinkError={null}
        {...overrides}
      />
    </AuthProvider>,
  );
  return { onAddMediaLink };
}

describe('AttemptMediaPrompt — видео ещё не получено', () => {
  it('объяснение и форма ссылки видны, кнопки в Telegram нет без имени бота', () => {
    renderPrompt();

    expect(
      screen.getByText(
        'Учитель смотрит форму по видео — пришлите запись, как вы её выполнили.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Ссылка на видео')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /Отправить видео боту/ }),
    ).not.toBeInTheDocument();
  });

  it('имя бота есть — кнопка-ссылка на чат с правильным deep link', () => {
    renderPrompt({ telegramBotUsername: 'xuanxue_bot' });

    const link = screen.getByRole('link', { name: 'Отправить видео боту в Telegram' });
    expect(link).toHaveAttribute('href', 'https://t.me/xuanxue_bot?start=exam_a1');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  // Инцидент 2026-09-16 (RUNBOOK §8.17): вошедший по почте прошёл по кнопке,
  // снял «кружок» и получил «не нашли эту попытку» — бот узнаёт человека
  // только по telegramId, поэтому кнопки на этом пути быть не должно.
  it('Telegram не привязан — кнопки бота нет даже при известном имени бота', () => {
    renderPrompt({ telegramBotUsername: 'xuanxue_bot', telegramLinked: false });

    expect(
      screen.queryByRole('link', { name: /Отправить видео боту/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/вы вошли по почте/)).toBeInTheDocument();
    expect(screen.getByLabelText('Ссылка на видео')).toBeInTheDocument();
  });

  // ADR-0034: на месте кнопки бота — связка, а не тупик. Кнопка ведёт в
  // чат с ботом по одноразовому коду, после связки кнопка бота появляется
  // сама (MeDto.telegramLinked).
  it('Telegram не привязан — на месте кнопки бота кнопка связки', () => {
    renderPrompt({ telegramBotUsername: 'xuanxue_bot', telegramLinked: false });

    expect(screen.getByRole('button', { name: 'Связать Telegram' })).toBeInTheDocument();
    expect(
      screen.getByText(/Свяжите его — и запись уйдёт одним сообщением/),
    ).toBeInTheDocument();
  });

  it('Telegram привязан — кнопки связки нет', () => {
    renderPrompt({ telegramBotUsername: 'xuanxue_bot' });

    expect(
      screen.queryByRole('button', { name: 'Связать Telegram' }),
    ).not.toBeInTheDocument();
  });

  it('Telegram привязан, но бота нет — прежняя подсказка про ссылку', () => {
    renderPrompt();

    expect(
      screen.getByText('Нет Telegram — оставьте ссылку на видео.'),
    ).toBeInTheDocument();
  });
});

describe('AttemptMediaPrompt — видео уже получено', () => {
  const RECEIVED: ExamMediaDto = {
    id: 'm1',
    attemptId: 'a1',
    kind: 'link',
    url: 'https://example.com/v',
    receivedAt: '2026-09-12T00:00:00Z',
  };

  it('вместо формы — честная строка, что и когда пришло', () => {
    renderPrompt({ attempt: makeAttempt({ media: [RECEIVED] }) });

    expect(screen.getByText(/Видео получено/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Ссылка на видео')).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        'Учитель смотрит форму по видео — пришлите запись, как вы её выполнили.',
      ),
    ).not.toBeInTheDocument();
  });
});
