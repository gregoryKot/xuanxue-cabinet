// Число заготовок частых комментариев для раздела «Экзамены» (CLAUDE.md
// «Продуктовая фича = число в своём разделе», ADR-0041) — чистая функция,
// юнит-тест без DOM, включая пустую базу.
import { pluralRu } from '@xuanxue/shared';

const PRESET_FORMS = {
  one: 'заготовка',
  few: 'заготовки',
  many: 'заготовок',
  other: 'заготовки',
};

/** `null` — список ещё грузится или сбой загрузки: подпись без числа. */
export function formatGradingPresetsHint(count: number | null): string {
  if (count === null) return 'Готовые фразы для комментария при проверке.';
  if (count === 0) return 'Пока нет заготовок — добавьте первую на карточке проверки.';
  return `${count} ${pluralRu(count, PRESET_FORMS)} для комментария.`;
}
