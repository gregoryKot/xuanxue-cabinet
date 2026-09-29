// Срок хранения, объявленный в PLAN, не может остаться без исполнителя.
//
// Почему этот тест есть (правило 1д CLAUDE.md, ADR-0153): срок «3 года после
// результата» стоял в таблице PLAN §11 и в шапке схемы `exam_attempts`, а
// уборщика не было — попытки жили вечно, и никакой гейт этого не видел: срок
// был словами. Здесь слова сверяются с кодом: каждая коллекция, у которой в
// таблице PLAN названа конечная давность, обязана стоять в списке ниже вместе с
// тем, что срок исполняет (шаг тика или TTL-индекс), а число в PLAN — совпадать
// с константой кода.
//
// Что тест НЕ ловит: PR только в docs/ не запускает api-джобы (фильтр путей
// CI), поэтому новая строка PLAN без записи здесь покраснеет на пуше в main или
// в первом же PR, тронувшем api/shared. Не идеально, но дешевле отдельного
// храповика в scripts/ — и всё-таки красное, а не тишина.
import { readFileSync } from 'fs';
import { join } from 'path';
import type { Schema } from 'mongoose';
import {
  ANSWER_VIDEO_RETENTION,
  EXAM_ATTEMPT_RETENTION_YEARS,
  PAYMENT_SCREENSHOT_TTL_AFTER_CONFIRM_DAYS,
} from '@xuanxue/shared';
import { AnswerVideoSweepService } from '../answer-videos/answer-video-sweep.service';
import { ExamAttemptRetentionSweepService } from '../exams/exam-attempt-retention-sweep.service';
import { NotificationSchema } from '../notifications/notification.schema';
import { PaymentScreenshotSweepService } from '../payments/payment-screenshot-sweep.service';
import { SchedulerService } from './scheduler.service';

const PLAN_PATH = join(__dirname, '..', '..', '..', 'docs', 'PLAN.md');
const SECONDS_IN_DAY = 24 * 60 * 60;

type Enforcer =
  | { kind: 'sweeper'; service: new (...args: never[]) => object }
  | { kind: 'ttl'; schema: Schema; expireAfterSeconds: number };

interface DeclaredRetention {
  collection: string;
  /** Число, которое PLAN обещает в строке коллекции; берём из кода, не литералом. */
  promised: number;
  enforcer: Enforcer;
}

// Новая коллекция с конечным сроком: строка в PLAN + запись здесь + исполнитель.
const DECLARED: readonly DeclaredRetention[] = [
  {
    collection: 'exam_attempts',
    promised: EXAM_ATTEMPT_RETENTION_YEARS,
    enforcer: { kind: 'sweeper', service: ExamAttemptRetentionSweepService },
  },
  {
    collection: 'answer_videos',
    promised: ANSWER_VIDEO_RETENTION.afterGradedDays,
    enforcer: { kind: 'sweeper', service: AnswerVideoSweepService },
  },
  {
    collection: 'payment_screenshots',
    promised: PAYMENT_SCREENSHOT_TTL_AFTER_CONFIRM_DAYS,
    enforcer: { kind: 'sweeper', service: PaymentScreenshotSweepService },
  },
  {
    collection: 'notifications',
    promised: 90,
    enforcer: {
      kind: 'ttl',
      schema: NotificationSchema,
      expireAfterSeconds: 90 * SECONDS_IN_DAY,
    },
  },
];

// «90 дней», «3 года», «12 мес.» — конечная давность в строке таблицы. «Живёт,
// пока школа жива» и «вместе с попыткой» срока не называют — исполнителя не
// требуют (их убирает каскад или удаление аккаунта).
const FINITE_PERIOD_RE = /\d+\s*(дн|год|лет|мес)/i;
const TABLE_ROW_RE = /^\|\s*`([a-z_]+)`\s*\|/;

function planRowsWithFinitePeriod(plan: string): Map<string, string> {
  const rows = new Map<string, string>();
  for (const line of plan.split('\n')) {
    const match = TABLE_ROW_RE.exec(line);
    const collection = match?.[1];
    if (collection && FINITE_PERIOD_RE.test(line)) rows.set(collection, line);
  }
  return rows;
}

describe('срок хранения из PLAN исполняется кодом', () => {
  const plan = readFileSync(PLAN_PATH, 'utf8');
  const planRows = planRowsWithFinitePeriod(plan);

  it('каждая коллекция с конечным сроком в таблицах PLAN названа в списке исполнителей', () => {
    const declared = new Set(DECLARED.map((entry) => entry.collection));
    const withoutEnforcer = [...planRows.keys()].filter((name) => !declared.has(name));

    expect(withoutEnforcer).toEqual([]);
  });

  it('в списке нет коллекций, у которых PLAN срока уже не называет', () => {
    const stale = DECLARED.map((entry) => entry.collection).filter(
      (name) => !planRows.has(name),
    );

    expect(stale).toEqual([]);
  });

  it.each(DECLARED)(
    '$collection: число в строке PLAN совпадает с константой кода ($promised)',
    ({ collection, promised }) => {
      expect(planRows.get(collection)).toMatch(new RegExp(`\\b${promised}\\s`));
    },
  );

  it.each(DECLARED.filter((entry) => entry.enforcer.kind === 'sweeper'))(
    '$collection: уборщик подключён к тику планировщика',
    ({ enforcer }) => {
      if (enforcer.kind !== 'sweeper') throw new Error('фильтр выше оставляет уборщиков');
      const injected = Reflect.getMetadata('design:paramtypes', SchedulerService) as
        unknown[] | undefined;

      expect(injected).toContain(enforcer.service);
    },
  );

  it.each(DECLARED.filter((entry) => entry.enforcer.kind === 'ttl'))(
    '$collection: TTL-индекс стоит на нужный срок',
    ({ enforcer }) => {
      if (enforcer.kind !== 'ttl') throw new Error('фильтр выше оставляет TTL');
      const ttls = enforcer.schema
        .indexes()
        .map(([, options]) => options?.expireAfterSeconds)
        .filter((seconds): seconds is number => typeof seconds === 'number');

      expect(ttls).toEqual([enforcer.expireAfterSeconds]);
    },
  );
});
