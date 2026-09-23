import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MyExamDto } from '@xuanxue/shared';
import { stubViewerTimeZone } from '../test-support/viewerTimeZone';
import { StudentExamCard } from './StudentExamCard';

// Порядок строк на карточке — отзыв владельца 2026-09-22 (ADR-0120): сначала
// то, что происходит сейчас, остаток попыток — только там, где попытку правда
// можно начать. Оба правила проверяются ниже своими тестами.

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

interface RenderCardProps {
  exam: MyExamDto;
  pending?: boolean;
  error?: string | null;
  onStart?: () => void;
}

// Карточка несёт <Link> (ссылка «Посмотреть свою работу») — без роутера
// вокруг react-router-dom падает, поэтому каждый рендер идёт через этот
// хелпер, а не голый render().
function renderCard({
  exam,
  pending = false,
  error = null,
  onStart = vi.fn(),
}: RenderCardProps) {
  return render(
    <MemoryRouter>
      <StudentExamCard exam={exam} pending={pending} error={error} onStart={onStart} />
    </MemoryRouter>,
  );
}

describe('StudentExamCard', () => {
  it('попытки не было — кнопка «Начать»', () => {
    renderCard({ exam: makeExam() });

    expect(screen.getByText('Форма первого уровня')).toBeInTheDocument();
    expect(screen.getByText('Осталось 1 попытка')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Начать' })).toBeInTheDocument();
  });

  // Остаток попыток стоит у кнопки, а не первой строкой над состоянием:
  // ровно та путаница, на которую пожаловался владелец («Осталось 6 попыток»
  // над «Отправлено, ждём проверки»).
  it('остаток попыток идёт после названия, прямо перед кнопкой', () => {
    renderCard({ exam: makeExam({ attemptsAllowed: 3 }) });

    const card = screen.getByText('Форма первого уровня').parentElement;
    const texts = Array.from(card?.querySelectorAll('span, p, button') ?? [])
      .map((node) => node.textContent)
      .filter((text): text is string => Boolean(text));
    expect(texts).toEqual([
      'Экзамен',
      'Форма первого уровня',
      'Осталось 3 попытки',
      'Начать',
    ]);
  });

  it('попытка в работе — кнопка «Продолжить»', () => {
    const exam = makeExam({
      lastAttempt: { id: 'a1', status: 'in_progress', expired: false },
    });
    renderCard({ exam });

    expect(screen.getByRole('button', { name: 'Продолжить' })).toBeInTheDocument();
    expect(screen.getByText('Попытка не закончена')).toBeInTheDocument();
    // «Продолжить» открывает начатую попытку — новую оно не тратит, и
    // остаток попыток рядом с ним не при чём.
    expect(screen.queryByText(/Осталось/)).not.toBeInTheDocument();
  });

  it('последняя попытка отправлена — без кнопки, честная строка', () => {
    const exam = makeExam({
      attemptsAllowed: 1,
      attemptsUsed: 1,
      lastAttempt: { id: 'a1', status: 'submitted', expired: false },
    });
    renderCard({ exam });

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('Отправлено, ждём проверки')).toBeInTheDocument();
    expect(screen.queryByText(/Осталось/)).not.toBeInTheDocument();
  });

  // Решение владельца 2026-09-21 (ADR-0091): «Пройти ещё раз» появляется, раз
  // попытку закрыло время, а не сам ученик. Строка про время теперь стоит
  // первой — это и есть «что происходит сейчас» (ADR-0120), — и говорит, куда
  // ушла работа: иначе она читалась бы как потеря сделанного.
  it('попытку закрыло время, есть ещё попытки — кнопка и строка-объяснение рядом', () => {
    const exam = makeExam({
      attemptsAllowed: 2,
      attemptsUsed: 1,
      lastAttempt: { id: 'a1', status: 'submitted', expired: true },
    });
    renderCard({ exam });

    expect(screen.getByRole('button', { name: 'Пройти ещё раз' })).toBeInTheDocument();
    expect(screen.getByText('Время вышло, попытка ушла на проверку')).toBeInTheDocument();
    expect(screen.getByText('Осталось 1 попытка')).toBeInTheDocument();
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
    renderCard({ exam });

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Время вышло, попытка ушла на проверку'),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Отправлено, ждём проверки')).toBeInTheDocument();
  });

  it('клик по кнопке зовёт onStart', () => {
    const onStart = vi.fn();
    renderCard({ exam: makeExam(), onStart });

    screen.getByRole('button', { name: 'Начать' }).click();
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('описание формы, если учитель его заполнил', () => {
    const exam = makeExam({ description: 'Форма стойки и базовые связки.' });
    renderCard({ exam });

    expect(screen.getByText('Форма стойки и базовые связки.')).toBeInTheDocument();
  });

  it('ошибка старта попытки видна рядом с кнопкой', () => {
    renderCard({ exam: makeExam(), error: 'Нет связи с сервером.' });

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
    renderCard({ exam });

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
    renderCard({ exam, onStart });

    expect(screen.getByText('Нужно доработать')).toBeInTheDocument();
    expect(
      screen.queryByText('Время вышло, попытка ушла на проверку'),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Пройти ещё раз' }));

    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('работа отправлена, но ещё не проверена — оценки и итога нет', () => {
    const exam = makeExam({
      attemptsAllowed: 1,
      attemptsUsed: 1,
      lastAttempt: { id: 'a1', status: 'submitted', expired: false },
    });
    renderCard({ exam });

    expect(screen.getByText('Отправлено, ждём проверки')).toBeInTheDocument();
    expect(screen.queryByText(/из \d+$/)).not.toBeInTheDocument();
  });

  it('помечено проверенным, но оценка ещё не пришла — запасной текст, не «мусор»', () => {
    const exam = makeExam({
      attemptsAllowed: 1,
      attemptsUsed: 1,
      lastAttempt: { id: 'a1', status: 'graded', expired: false },
    });
    renderCard({ exam });

    expect(screen.getByText('Экзамен проверен')).toBeInTheDocument();
  });
});

describe('StudentExamCard — ссылка на сданную работу', () => {
  it('попытка сдана — ссылка «Посмотреть свою работу» ведёт на экран сдачи', () => {
    const exam = makeExam({
      lastAttempt: { id: 'a1', status: 'submitted', expired: false },
    });
    renderCard({ exam });

    expect(screen.getByRole('link', { name: 'Посмотреть свою работу' })).toHaveAttribute(
      'href',
      '/attempts/a1',
    );
  });

  it('попытка проверена — ссылка есть рядом с итогом', () => {
    const exam = makeExam({
      attemptsAllowed: 1,
      attemptsUsed: 1,
      lastAttempt: { id: 'a1', status: 'graded', expired: false, outcome: 'passed' },
    });
    renderCard({ exam });

    expect(
      screen.getByRole('link', { name: 'Посмотреть свою работу' }),
    ).toBeInTheDocument();
  });

  it('попытка в работе — ссылки нет: вход уже даёт кнопка «Продолжить»', () => {
    const exam = makeExam({
      lastAttempt: { id: 'a1', status: 'in_progress', expired: false },
    });
    renderCard({ exam });

    expect(
      screen.queryByRole('link', { name: 'Посмотреть свою работу' }),
    ).not.toBeInTheDocument();
  });

  it('попытки не было — ссылки нет', () => {
    renderCard({ exam: makeExam() });

    expect(
      screen.queryByRole('link', { name: 'Посмотреть свою работу' }),
    ).not.toBeInTheDocument();
  });
});

// Отзыв владельца 2026-09-22: на карточке должно стоять время. Время попытки
// идёт, пока ученик вышел, и просроченную попытку сервер закрывает сам
// (ADR-0122) — остаток он обязан увидеть до того, как тот кончится. Пояс
// зрителя — stubViewerTimeZone (Europe/Moscow), не пояс машины.
describe('StudentExamCard — время попытки', () => {
  stubViewerTimeZone();

  it('попытки не было — сколько времени даётся на попытку', () => {
    renderCard({ exam: makeExam({ timeLimitMin: 40 }) });

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

    renderCard({ exam });

    expect(
      screen.getByText(
        'Осталось 25 мин, попытка закроется в 19:40 по вашим часам ' +
          '(школа живёт по Asia/Jerusalem)',
      ),
    ).toBeInTheDocument();
    vi.useRealTimers();
  });

  // ADR-0124: четыре строки одного кегля, цвета и веса — «всё сплошняком»
  // (снимок владельца 2026-09-23). Остаток времени идущей попытки — главный
  // факт карточки, и он обязан отличаться от соседних строк весом.
  it('остаток времени идущей попытки стоит весом 600, а не как соседние строки', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-22T16:15:00Z'));
    const exam = makeExam({
      timeLimitMin: 40,
      lastAttempt: {
        id: 'a1',
        status: 'in_progress',
        expired: false,
        deadlineAt: '2026-09-22T16:40:00Z',
      },
    });

    renderCard({ exam });

    const line = screen.getByText(/Осталось 25 мин/);
    expect(line.style.fontWeight).toBe('600');
    expect(screen.getByText('Попытка не закончена').style.fontWeight).toBe('');
    vi.useRealTimers();
  });

  // Описание пишет учитель, и оно идёт через RichText: выделить слово в
  // задании он может сам, без разработчика (ADR-0124).
  it('звёздочки в описании учителя становятся полужирным', () => {
    const exam = makeExam({ description: 'Стоять **45 минут** без опоры.' });

    renderCard({ exam });

    const accent = screen.getByText('45 минут');
    expect(accent.tagName).toBe('STRONG');
  });

  it('форма без лимита времени — строки про время нет вовсе', () => {
    renderCard({ exam: makeExam() });

    expect(screen.queryByText(/попытку даётся|Осталось \d+ мин/)).not.toBeInTheDocument();
  });
});

// ADR-0125: срок сдачи — второе, независимое от лимита времени ограничение.
// Прошедший срок закрывает только НОВУЮ попытку; уже идущую он не трогает
// никогда — решение владельца 2026-09-22, самая важная ветка этого набора.
describe('StudentExamCard — срок сдачи', () => {
  stubViewerTimeZone();

  afterEach(() => {
    vi.useRealTimers();
  });

  it('срок ещё не прошёл — дата видна до старта, кнопка на месте', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-20T00:00:00Z'));
    renderCard({ exam: makeExam({ dueAt: '2026-09-30T20:59:00Z' }) });

    expect(screen.getByText(/^Сдать до /)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Начать' })).toBeInTheDocument();
  });

  it('срок прошёл, попытки не было — честная строка вместо кнопки «Начать»', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-01T00:00:00Z'));
    renderCard({ exam: makeExam({ dueAt: '2026-09-30T20:59:00Z' }) });

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(
      screen.getByText(
        'Срок сдачи прошёл. Начать новую попытку нельзя — обратитесь к учителю.',
      ),
    ).toBeInTheDocument();
  });

  // Самое важное следствие правила (предупреждение владельца): ученик,
  // сдающий прямо сейчас, не должен получить отказ при перезагрузке
  // страницы после дедлайна. Кнопка «Продолжить» остаётся кнопкой.
  it('срок прошёл, попытка идёт — «Продолжить» остаётся кнопкой, без честной строки', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-01T00:00:00Z'));
    const exam = makeExam({
      dueAt: '2026-09-30T20:59:00Z',
      lastAttempt: { id: 'a1', status: 'in_progress', expired: false },
    });
    renderCard({ exam });

    expect(screen.getByRole('button', { name: 'Продолжить' })).toBeInTheDocument();
    expect(
      screen.queryByText(
        'Срок сдачи прошёл. Начать новую попытку нельзя — обратитесь к учителю.',
      ),
    ).not.toBeInTheDocument();
  });

  // Пара к тесту выше — та же честная строка встаёт и на месте «Пройти ещё
  // раз»: срок закрывает любую НОВУЮ попытку, не только самую первую.
  it('срок прошёл, есть право на «Пройти ещё раз» — честная строка вместо неё', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-01T00:00:00Z'));
    const exam = makeExam({
      dueAt: '2026-09-30T20:59:00Z',
      attemptsAllowed: 2,
      attemptsUsed: 1,
      lastAttempt: { id: 'a1', status: 'graded', expired: false, outcome: 'needs_work' },
    });
    renderCard({ exam });

    expect(
      screen.queryByRole('button', { name: 'Пройти ещё раз' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        'Срок сдачи прошёл. Начать новую попытку нельзя — обратитесь к учителю.',
      ),
    ).toBeInTheDocument();
  });

  it('без срока — ни строки про дату, ни честного отказа', () => {
    renderCard({ exam: makeExam() });

    expect(screen.queryByText(/^Сдать до /)).not.toBeInTheDocument();
    expect(screen.queryByText(/Срок сдачи прошёл/)).not.toBeInTheDocument();
  });
});
