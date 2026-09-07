// Первые N строк текста для превью карточки рассылки — переносы строк
// значимы в постах (docs/PLAN.md §6 «Шаблоны»), режем по ним, не по символам.
export function firstLines(text: string, n: number): string {
  return text.split('\n').slice(0, n).join('\n');
}
