// Склонение числительных по-русски — общий примитив для любого текста с
// числом (дни, минуты, часы, …). Intl.PluralRules('ru'), не самодельное
// правило по остатку от 10 — такое правило ошибается на 111–114/211–214
// («111 минута» вместо «111 минут», CLAUDE.md «Зависимости»: встроенное
// вместо своего). Раньше жило только в format-duration.ts — теперь общее,
// summary.format.ts (api) склоняет так же дни периода.
const RU_PLURAL_RULES = new Intl.PluralRules('ru');

export interface PluralForms {
  readonly one: string;
  readonly few: string;
  readonly many: string;
  readonly other: string;
}

export function pluralRu(n: number, forms: PluralForms): string {
  const category = RU_PLURAL_RULES.select(n);
  switch (category) {
    case 'one':
      return forms.one;
    case 'few':
      return forms.few;
    case 'many':
      return forms.many;
    case 'zero':
    case 'two':
    case 'other':
      return forms.other;
  }
}
