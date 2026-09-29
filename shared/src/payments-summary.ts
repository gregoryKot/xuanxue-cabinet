// Число раздела «Оплаты» (docs/PLAN.md §15 слой 2.6, CLAUDE.md «Продуктовая
// фича = число в своём разделе», ADR-0025) — сколько учеников оплатили месяц,
// сколько ждут подтверждения, сколько молчат и скольким ушло напоминание.
//
// Считаем людей, а не суммы: сумма необязательна (ADR-0049 — перевод можно
// отметить без числа), и сложить только введённые значит показать Маше
// половину правды под видом итога.
//
// Считается из уже загруженного `PaymentsPageDto`: экран «Оплаты» грузит месяц
// целиком (limit = `PAYMENT_LIMITS.listLimitMax`), отдельный эндпоинт ради
// четырёх чисел не нужен, а второй источник правды разошёлся бы со списком.
//
// В `shared/src/index.ts` этого файла пока нет: экран «Оплаты» ещё в открытом
// PR, а имя из барабана без потребителя в api/web роняет
// `scripts/check-shared-exports.mjs`. Реэкспорт добавит PR, который выводит
// число на экран.
//
// Маркера `**` в строках нет (`check-text-accents.mjs`: shared уходит и в
// Telegram) — выделение числа рисует экран.
import type { PaymentDto, PaymentsPageDto } from './payments';
import { formatMonthNameRu } from './month-key';
import { pluralRu, type PluralForms } from './plural-ru';

type PaymentsSummaryKey = 'paid' | 'awaiting' | 'unpaid' | 'reminded';

export interface PaymentsSummaryItem {
  key: PaymentsSummaryKey;
  caption: string;
  /** Люди, не суммы. */
  count: number;
  /** Готовая строка для экрана: '12 учеников' или 'пока никто'. */
  value: string;
}

export type PaymentsSummary =
  | { heading: string; isEmpty: true; emptyText: string }
  | { heading: string; isEmpty: false; items: readonly PaymentsSummaryItem[] };

const EMPTY_TEXT = 'Пока нечего показать — в списке нет ни одного ученика.';

// Именительный — «Оплатили — 12 учеников».
const STUDENT_FORMS: PluralForms = {
  one: 'ученик',
  few: 'ученика',
  many: 'учеников',
  other: 'учеников',
};
// Дательный — «Напомнили — 21 ученику»: глагол требует кому, не кто.
const STUDENT_DATIVE_FORMS: PluralForms = {
  one: 'ученику',
  few: 'ученикам',
  many: 'ученикам',
  other: 'ученикам',
};

interface ItemSpec {
  key: PaymentsSummaryKey;
  caption: string;
  forms: PluralForms;
  /** Слово при нуле — «0 учеников» на экране читается как сбой, а не как факт. */
  zeroText: string;
  isCounted: (row: PaymentDto) => boolean;
}

// Порядок массива — порядок на экране: сначала хорошее, потом то, что ждёт
// действия, потом справочный счёт напоминаний.
const ITEM_SPECS: readonly ItemSpec[] = [
  {
    key: 'paid',
    caption: 'Оплатили',
    forms: STUDENT_FORMS,
    zeroText: 'пока никто',
    isCounted: (row) => row.status === 'paid',
  },
  {
    key: 'awaiting',
    caption: 'Ждут подтверждения',
    forms: STUDENT_FORMS,
    zeroText: 'никто',
    isCounted: (row) => row.status === 'awaiting',
  },
  {
    key: 'unpaid',
    caption: 'Без оплаты',
    forms: STUDENT_FORMS,
    zeroText: 'никого',
    isCounted: (row) => row.status === 'unpaid',
  },
  {
    // Пересекается со статусами: напоминание получил тот, кто не оплатил, и
    // тот, кто заплатил уже после него. Это отдельный счёт, не часть суммы.
    key: 'reminded',
    caption: 'Напомнили',
    forms: STUDENT_DATIVE_FORMS,
    zeroText: 'никому',
    isCounted: (row) => Boolean(row.reminderSentAt),
  },
];

function buildItem(spec: ItemSpec, rows: readonly PaymentDto[]): PaymentsSummaryItem {
  const count = rows.filter(spec.isCounted).length;
  const value = count > 0 ? `${count} ${pluralRu(count, spec.forms)}` : spec.zeroText;
  return { key: spec.key, caption: spec.caption, count, value };
}

/**
 * Число раздела «Оплаты» за месяц страницы. Пустой список (нет ни одного
 * активного ученика) — честное «пока нечего показать» (VOICE.md), не «0 из 0».
 */
export function formatPaymentsSummary(page: PaymentsPageDto): PaymentsSummary {
  const heading = `За ${formatMonthNameRu(page.month)}`;
  if (page.rows.length === 0) {
    return { heading, isEmpty: true, emptyText: EMPTY_TEXT };
  }
  return {
    heading,
    isEmpty: false,
    items: ITEM_SPECS.map((spec) => buildItem(spec, page.rows)),
  };
}
