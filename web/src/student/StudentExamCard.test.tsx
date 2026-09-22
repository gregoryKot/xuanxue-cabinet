import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { MyExamDto } from '@xuanxue/shared';
import { stubViewerTimeZone } from '../test-support/viewerTimeZone';
import { StudentExamCard } from './StudentExamCard';

function makeExam(overrides: Partial<MyExamDto> = {}): MyExamDto {
  return {
    id: 'e1',
    title: 'Форма первого уровня',
    description: '',
    level: '',
    attemptsAllowed: 1,
    attemptsUsed: 0,
    ...overrides,
  };
}

describe('StudentExamCard', () => {
  it('попытки не было — кнопка «Начать»', () => {
    render(
      <StudentExamCard
        exam={makeExam()}
        pending={false}
        error={null}
        onStart={vi.fn()}
      />,
    );

    expect(screen.getByText('Форма первого уровня')).toBeInTheDocument();
    expect(screen.getByText('Осталось 1 попытка')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Начать' })).toBeInTheDocument();
  });

  it('попытка в работе — кнопка «Продолжить»', () => {
    const exam = makeExam({
      lastAttempt: { id: 'a1', status: 'in_progress', expired: false },
    });
    render(
      <StudentExamCard exam={exam} pending={false} error={null} onStart={vi.fn()} />,
    );

    expect(screen.getByRole('button', { name: 'Продолжить' })).toBeInTheDocument();
  });

  it('последняя попытка отправлена — без кнопки, честная строка', () => {
    const exam = makeExam({
      attemptsAllowed: 1,
      attemptsUsed: 1,
      lastAttempt: { id: 'a1', status: 'submitted', expired: false },
    });
    render(
      <StudentExamCard exam={exam} pending={false} error={null} onStart={vi.fn()} />,
    );

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('Отправлено, ждём проверки')).toBeInTheDocument();
  });

  // Решение владельца 2026-09-21 (ADR-0091): «Пройти ещё раз» появляется, раз
  // попытку закрыло время, а не сам ученик, — рядом с кнопкой строка-
  // объяснение тем же metaStyle, что «Осталось N попыток» (CLAUDE.md: «каждая
  // фича объясняет, откуда это и зачем»).
  it('попытку закрыло время, есть ещё попытки — кнопка и строка-объяснение рядом', () => {
    const exam = makeExam({
      attemptsAllowed: 2,
      attemptsUsed: 1,
      lastAttempt: { id: 'a1', status: 'submitted', expired: true },
    });
    render(
      <StudentExamCard exam={exam} pending={false} error={null} onStart={vi.fn()} />,
    );

    expect(screen.getByRole('button', { name: 'Пройти ещё раз' })).toBeInTheDocument();
    expect(screen.getByText('Прошлую попытку закрыло время')).toBeInTheDocument();
  });

  // Пара к тесту выше: тот же остаток попыток, но сдал сам — ни кнопки, ни
  // строки про дедлайн: вторая попытка тут была бы обходом проверки, а не
  // доработкой (та же граница, что у getMyExamAction, shared).
  it('сдана вручную, есть ещё попытки — ни кнопки, ни строки про дедлайн', () => {
    const exam = makeExam({
      attemptsAllowed: 2,
      attemptsUsed: 1,
      lastAttempt: { id: 'a1', status: 'submitted', expired: false },
    });
    render(
      <StudentExamCard exam={exam} pending={false} error={null} onStart={vi.fn()} />,
    );

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByText('Прошлую попытку закрыло время')).not.toBeInTheDocument();
    expect(screen.getByText('Отправлено, ждём проверки')).toBeInTheDocument();
  });

  it('клик по кнопке зовёт onStart', () => {
    const onStart = vi.fn();
    render(
      <StudentExamCard
        exam={makeExam()}
        pending={false}
        error={null}
        onStart={onStart}
      />,
    );

    screen.getByRole('button', { name: 'Начать' }).click();
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('описание формы, если учитель его заполнил', () => {
    const exam = makeExam({ description: 'Форма стойки и базовые связки.' });
    render(
      <StudentExamCard exam={exam} pending={false} error={null} onStart={vi.fn()} />,
    );

    expect(screen.getByText('Форма стойки и базовые связки.')).toBeInTheDocument();
  });

  it('ошибка старта попытки видна рядом с кнопкой', () => {
    render(
      <StudentExamCard
        exam={makeExam()}
        pending={false}
        error="Нет связи с сервером."
        onStart={vi.fn()}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Нет связи с сервером.');
  });

  it('работа проверена — вместо кнопки итог и комментарий учителя', () => {
    const exam = makeExam({
      attemptsAllowed: 1,
      attemptsUsed: 1,
      lastAttempt: {
        id: 'a1',
        status: 'graded',
        expired: false,
        outcome: 'needs_work',
        comment: 'Проверьте стойку в начале формы.',
      },
    });
    render(
      <StudentExamCard exam={exam} pending={false} error={null} onStart={vi.fn()} />,
    );

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('Нужно доработать')).toBeInTheDocument();
    expect(screen.getByText(/Проверьте стойку в начале формы\./)).toBeInTheDocument();
    expect(screen.queryByText('Экзамен проверен')).not.toBeInTheDocument();
  });

  // Слой 4.7: «нужно доработать» без кнопки — тупик. Попытка ещё есть —
  // значит, ученик может пройти заново прямо с этой карточки. Строки про
  // дедлайн тут нет: причина повтора — итог учителя, не время (в отличие от
  // теста «попытку закрыло время» выше).
  it('работу вернули на доработку, попытка осталась — кнопка «Пройти ещё раз» рядом с итогом', async () => {
    const onStart = vi.fn();
    const user = userEvent.setup();
    const exam = makeExam({
      attemptsAllowed: 2,
      attemptsUsed: 1,
      lastAttempt: {
        id: 'a1',
        status: 'graded',
        expired: false,
        outcome: 'needs_work',
        comment: 'Проверьте стойку в начале формы.',
      },
    });
    render(
      <StudentExamCard exam={exam} pending={false} error={null} onStart={onStart} />,
    );

    expect(screen.getByText('Нужно доработать')).toBeInTheDocument();
    expect(screen.queryByText('Прошлую попытку закрыло время')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Пройти ещё раз' }));

    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('работа отправлена, но ещё не проверена — оценки и итога нет', () => {
    const exam = makeExam({
      attemptsAllowed: 1,
      attemptsUsed: 1,
      lastAttempt: { id: 'a1', status: 'submitted', expired: false },
    });
    render(
      <StudentExamCard exam={exam} pending={false} error={null} onStart={vi.fn()} />,
    );

    expect(screen.getByText('Отправлено, ждём проверки')).toBeInTheDocument();
    expect(screen.queryByText(/из \d+$/)).not.toBeInTheDocument();
  });

  it('помечено проверенным, но оценка ещё не пришла — запасной текст, не «мусор»', () => {
    const exam = makeExam({
      attemptsAllowed: 1,
      attemptsUsed: 1,
      lastAttempt: { id: 'a1', status: 'graded', expired: false },
    });
    render(
      <StudentExamCard exam={exam} pending={false} error={null} onStart={vi.fn()} />,
    );

    expect(screen.getByText('Экзамен проверен')).toBeInTheDocument();
  });
});

// Отзыв владельца 2026-09-22: на карточке должно стоять время. Время попытки
// идёт, пока ученик вышел, и просроченную попытку сервер закрывает сам
// (ADR-0120) — остаток он обязан увидеть до того, как тот кончится. Пояс
// зрителя — stubViewerTimeZone (Europe/Moscow), не пояс машины.
describe('StudentExamCard — время попытки', () => {
  stubViewerTimeZone();

  it('попытки не было — сколько времени даётся на попытку', () => {
    render(
      <StudentExamCard
        exam={makeExam({ timeLimitMin: 40 })}
        pending={false}
        error={null}
        onStart={vi.fn()}
      />,
    );

    expect(screen.getByText('На попытку даётся 40 минут')).toBeInTheDocument();
  });

  it('попытка идёт — остаток и час закрытия по часам зрителя', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-22T16:15:00Z'));
    const exam = makeExam({
      timeLimitMin: 40,
      attemptsAllowed: 2,
      attemptsUsed: 1,
      lastAttempt: {
        id: 'a1',
        status: 'in_progress',
        expired: false,
        deadlineAt: '2026-09-22T16:40:00Z',
      },
    });

    render(
      <StudentExamCard exam={exam} pending={false} error={null} onStart={vi.fn()} />,
    );

    expect(
      screen.getByText(
        'Осталось 25 мин, попытка закроется в 19:40 по вашим часам ' +
          '(школа живёт по Asia/Jerusalem)',
      ),
    ).toBeInTheDocument();
    vi.useRealTimers();
  });

  it('форма без лимита времени — строки про время нет вовсе', () => {
    render(
      <StudentExamCard
        exam={makeExam()}
        pending={false}
        error={null}
        onStart={vi.fn()}
      />,
    );

    expect(screen.queryByText(/попытку даётся|Осталось \d+ мин/)).not.toBeInTheDocument();
  });
});
