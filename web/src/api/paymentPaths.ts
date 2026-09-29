// Пути абонемента ученика (docs/PLAN.md §15, слой 2.4) — отдельным файлом:
// apiPaths.ts уже больше 150 строк и может только уменьшаться (файловый
// храповик, CLAUDE.md §5). Месяц — `YYYY-MM`, кодируется как любой сегмент.
export const MY_PAYMENTS_PATH = '/me/payments';

export function myPaymentScreenshotPath(month: string): string {
  return `${MY_PAYMENTS_PATH}/${encodeURIComponent(month)}/screenshot`;
}
