// Чистый форматтер сводки (docs/PLAN.md §6 «Сводка», CLAUDE.md «Продуктовая
// фича = число в „Сводке“») — период и «пока нечего показать» на пустой базе,
// без Mongo и DI (юнит-тест без Mongo, CLAUDE.md «Тесты»).
import type { DateTime } from 'luxon';
import {
  pluralRu,
  SUMMARY_PERIOD_DAYS,
  type PluralForms,
  type SummaryDto,
} from '@xuanxue/shared';
import { toIsoUtc } from '../common/iso-date';

export interface SummaryCounts {
  broadcastsSent: number;
  broadcastsCancelled: number;
  deliveriesFailed: number;
  deliveriesPending: number;
  manualWaiting: number;
}

const DAY_FORMS: PluralForms = { one: 'день', few: 'дня', many: 'дней', other: 'дней' };

// SUMMARY_PERIOD_DAYS склоняется, а не зашит текстом «30 дней»: константа
// может измениться, и число без верного окончания читалось бы как опечатка.
function periodPhrase(): string {
  return `${SUMMARY_PERIOD_DAYS} ${pluralRu(SUMMARY_PERIOD_DAYS, DAY_FORMS)}`;
}

// VOICE.md: конкретика вместо «0/NaN/мусора» — честное «пока нечего
// показать», не молчаливые нули на чистой базе.
function noBroadcastsPhrase(): string {
  return `Пока нечего показать: ни одной рассылки за ${periodPhrase()}.`;
}

/** Все счётчики нулевые — по разделу «Рассылки» ещё нечего показать, а не
 * «всё сломано»: emptyMessage вместо нулей. Хоть один счётчик ненулевой —
 * без него, числа говорят сами за себя. */
export function formatSummary(counts: SummaryCounts, now: DateTime): SummaryDto {
  const period = {
    from: toIsoUtc(now.minus({ days: SUMMARY_PERIOD_DAYS }).toJSDate()),
    to: toIsoUtc(now.toJSDate()),
  };
  const allZero =
    counts.broadcastsSent === 0 &&
    counts.broadcastsCancelled === 0 &&
    counts.deliveriesFailed === 0 &&
    counts.deliveriesPending === 0 &&
    counts.manualWaiting === 0;
  if (allZero) {
    return {
      period,
      broadcastsSent: 0,
      broadcastsCancelled: 0,
      deliveriesFailed: 0,
      deliveriesPending: 0,
      manualWaiting: 0,
      emptyMessage: noBroadcastsPhrase(),
    };
  }
  return { period, ...counts };
}
