// Подписи формата занятия — один источник для карточки слота и формы
// (CLAUDE.md «Без магических чисел и строк»: повторяющийся текст — константа).
import type { ClassFormat } from '@xuanxue/shared';

export const CLASS_FORMAT_LABELS_RU: Record<ClassFormat, string> = {
  online: 'Онлайн',
  offline: 'Офлайн',
  both: 'Офлайн + онлайн',
};
