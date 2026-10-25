// Какие плитки на главной ученика (ADR-0178): чистая функция, без DOM и сети.
// Главное правило — нет экзамена к сдаче или занятия, нет и слова о них.
import { describe, expect, it } from 'vitest';
import type { MyExamDto, MyLessonDto, MyPaymentsPageDto } from '@xuanxue/shared';
import { makeSchoolEvent } from '../test-support/schoolEventFixture';
import {
  buildStudentHome,
  isHomeLoading,
  type SourceState,
  type StudentHomeInput,
} from './studentHomeView';

function ready<T>(data: T): SourceState<T> {
  return { data, loading: false, error: null };
}
const LOADING: SourceState<never> = { data: null, loading: true, error: null };
function failed(error = 'Не удалось загрузить.'): SourceState<never> {
  return { data: null, loading: false, error };
}

const EXAM: MyExamDto = {
  id: 'e1',
  title: 'Форма первого уровня',
  description: '',
  level: '',
  attemptsAllowed: 1,
  attemptsUsed: 0,
};
const EXAM_DONE: MyExamDto = { ...EXAM, id: 'e2', attemptsUsed: 1 };
const LESSON: MyLessonDto = {
  id: 'l1',
  startsAt: '2030-09-08T16:00:00.000Z',
  durationMin: 60,
  classTitle: 'Тайцзицюань',
  groupLabel: '',
  format: 'online',
  topic: '',
  status: 'scheduled',
  tags: [],
};
const PAGE: MyPaymentsPageDto = { month: '2026-10', rows: [], contact: 'Маше' };

/** Всё загружено, показывать нечего. */
function quiet(overrides: Partial<StudentHomeInput> = {}): StudentHomeInput {
  return {
    board: ready({ notice: null }),
    exams: ready([]),
    payments: ready(PAGE),
    paymentVisible: false,
    events: ready([]),
    lessons: ready([]),
    firstLoadDone: true,
    hidden: [],
    ...overrides,
  };
}

describe('buildStudentHome — релевантное', () => {
  it('ничего нет: статус empty и ни одной плитки', () => {
    const view = buildStudentHome(quiet());

    expect(view.status).toBe('empty');
    expect(view.notice).toBeNull();
    expect(view.toDo).toEqual([]);
    expect(view.payment).toBeNull();
    expect(view.events).toEqual([]);
    expect(view.nextLesson).toBeNull();
  });

  it('экзамены есть, но сдавать нечего — плитки экзаменов нет, главная пустая', () => {
    const view = buildStudentHome(quiet({ exams: ready([EXAM_DONE]) }));

    expect(view.toDo).toEqual([]);
    expect(view.status).toBe('empty');
  });

  it('экзамен к сдаче — в toDo только он, сданное не попадает', () => {
    const view = buildStudentHome(quiet({ exams: ready([EXAM, EXAM_DONE]) }));

    expect(view.toDo.map((exam) => exam.id)).toEqual(['e1']);
    expect(view.status).toBe('ready');
  });

  it('занятие — ближайшее первое из списка', () => {
    const later = { ...LESSON, id: 'l2' };
    const view = buildStudentHome(quiet({ lessons: ready([LESSON, later]) }));

    expect(view.nextLesson?.id).toBe('l1');
    expect(view.status).toBe('ready');
  });

  it('оплата — только когда карточка положена, иначе игнорируем и данные', () => {
    expect(buildStudentHome(quiet({ paymentVisible: true })).payment?.heading).toBe(
      'Оплата за октябрь 2026',
    );
    expect(buildStudentHome(quiet({ paymentVisible: false })).payment).toBeNull();
  });

  it('объявление и события тоже делают главную непустой', () => {
    const withNotice = buildStudentHome(
      quiet({ board: ready({ notice: { text: 'Ретрит', until: '2026-10-20' } }) }),
    );
    expect(withNotice.notice?.text).toBe('Ретрит');
    expect(withNotice.status).toBe('ready');

    const withEvent = buildStudentHome(quiet({ events: ready([makeSchoolEvent()]) }));
    expect(withEvent.events).toHaveLength(1);
    expect(withEvent.status).toBe('ready');
  });
});

describe('buildStudentHome — загрузка и сбои', () => {
  it('пока что-то грузится впервые — loading, даже если часть плиток готова', () => {
    const view = buildStudentHome(
      quiet({ lessons: ready([LESSON]), exams: LOADING, firstLoadDone: false }),
    );

    expect(view.status).toBe('loading');
  });

  it('оплата не ждётся, когда её не показывают', () => {
    const input = quiet({
      payments: LOADING,
      paymentVisible: false,
      firstLoadDone: false,
    });

    expect(isHomeLoading(input)).toBe(false);
    expect(buildStudentHome(input).status).toBe('empty');
  });

  it('оплату ждём, когда её показывают', () => {
    expect(isHomeLoading(quiet({ payments: LOADING, paymentVisible: true }))).toBe(true);
  });

  it('после первой загрузки повтор одного источника скелетон не возвращает', () => {
    const view = buildStudentHome(quiet({ lessons: LOADING, exams: ready([EXAM]) }));

    expect(view.status).toBe('ready');
    expect(view.toDo).toHaveLength(1);
  });

  it('сбой источника — текст ошибки у него, остальные плитки живут', () => {
    const view = buildStudentHome(
      quiet({
        exams: failed('Не удалось загрузить экзамены.'),
        lessons: ready([LESSON]),
      }),
    );

    expect(view.errors).toEqual({ exams: 'Не удалось загрузить экзамены.' });
    expect(view.nextLesson).not.toBeNull();
    expect(view.status).toBe('ready');
  });

  it('сбой и больше ничего — не «ничего не ждут»: это было бы неправдой', () => {
    const view = buildStudentHome(quiet({ lessons: failed() }));

    expect(view.status).toBe('ready');
    expect(view.errors.lessons).toBeDefined();
  });

  it('сбой оплаты не считается, когда оплата ученику не положена', () => {
    const view = buildStudentHome(quiet({ payments: failed(), paymentVisible: false }));

    expect(view.errors).toEqual({});
    expect(view.status).toBe('empty');
  });
});

// ADR-0179: плитку, скрытую человеком, функция не отдаёт и не ждёт.
describe('buildStudentHome — скрытые плитки', () => {
  const FULL = quiet({
    board: ready({ notice: { text: 'Ретрит', until: '2026-10-20' } }),
    exams: ready([EXAM]),
    payments: ready(PAGE),
    paymentVisible: true,
    events: ready([makeSchoolEvent()]),
    lessons: ready([LESSON]),
  });

  it('ничего не скрыто — все пять плиток на месте', () => {
    const view = buildStudentHome(FULL);

    expect(view.nextLesson).not.toBeNull();
    expect(view.notice).not.toBeNull();
    expect(view.toDo).toHaveLength(1);
    expect(view.payment).not.toBeNull();
    expect(view.events).toHaveLength(1);
    expect(view.hasHidden).toBe(false);
  });

  it.each([
    ['nextLesson', (view: ReturnType<typeof buildStudentHome>) => view.nextLesson],
    ['notice', (view: ReturnType<typeof buildStudentHome>) => view.notice],
    ['payment', (view: ReturnType<typeof buildStudentHome>) => view.payment],
  ] as const)('скрыта %s — плитки нет, остальные на месте', (key, pick) => {
    const view = buildStudentHome({ ...FULL, hidden: [key] });

    expect(pick(view)).toBeNull();
    expect(view.status).toBe('ready');
    expect(view.hasHidden).toBe(true);
  });

  it('скрыты экзамены и события — списки пустые', () => {
    const view = buildStudentHome({ ...FULL, hidden: ['exams', 'events'] });

    expect(view.toDo).toEqual([]);
    expect(view.events).toEqual([]);
    expect(view.nextLesson).not.toBeNull();
  });

  it('скрыто всё — empty, и это не «загрузка»: hasHidden подскажет, как вернуть', () => {
    const view = buildStudentHome({
      ...FULL,
      hidden: ['nextLesson', 'notice', 'exams', 'payment', 'events'],
    });

    expect(view.status).toBe('empty');
    expect(view.hasHidden).toBe(true);
  });

  it('ничего нет и ничего не скрыто — hasHidden false: подсказки не будет', () => {
    expect(buildStudentHome(quiet()).hasHidden).toBe(false);
  });

  it('ключ штата в списке ученику не мешает и «скрытым» для него не считается', () => {
    const view = buildStudentHome({ ...FULL, hidden: ['grading'] });

    expect(view.hasHidden).toBe(false);
    expect(view.nextLesson).not.toBeNull();
  });

  it('скелетон не ждёт скрытый источник', () => {
    const input = quiet({
      lessons: LOADING,
      firstLoadDone: false,
      hidden: ['nextLesson'],
    });

    expect(isHomeLoading(input)).toBe(false);
    expect(buildStudentHome(input).status).toBe('empty');
  });

  it('сбой скрытого источника баннера не рисует, видимого — рисует', () => {
    const hiddenFails = buildStudentHome(
      quiet({ lessons: failed(), exams: failed('Экзамены.'), hidden: ['nextLesson'] }),
    );

    expect(hiddenFails.errors).toEqual({ exams: 'Экзамены.' });
  });

  it('сбой скрытых экзаменов не показывается: плитки, где стоял бы баннер, нет', () => {
    const view = buildStudentHome(quiet({ exams: failed(), hidden: ['exams'] }));

    expect(view.errors).toEqual({});
    expect(view.status).toBe('empty');
  });
});
