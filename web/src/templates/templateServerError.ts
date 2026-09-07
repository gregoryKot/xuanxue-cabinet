// Разбор ошибки `PATCH /settings` по редакторам (pr-k3-fixes.md п.5):
// `assertKnownPlaceholders` (api/src/settings/settings-templates.ts) кладёт
// ключ шаблона (lesson_link/recording) прямо в `message` — «В шаблоне
// «lesson_link» неизвестные подстановки...». Учитель не знает эти ключи,
// поэтому подставляем подпись по-русски (TEMPLATE_KIND_LABELS_RU) и
// показываем сообщение под тем редактором, которому оно принадлежит.
// Ошибку без узнаваемого ключа (общий текст ValidationPipe, сбой сети) никуда
// не относим — она остаётся общей, под формой (FormServerError), как раньше:
// details class-validator по умолчанию не несут имени поля, привязать их к
// конкретному редактору нечем.
import { TEMPLATE_KINDS, type TemplateKind } from '@xuanxue/shared';
import type { FormError } from '../components/FormServerError';
import { TEMPLATE_KIND_LABELS_RU } from './templateKindLabels';

function kindIn(text: string): TemplateKind | null {
  return TEMPLATE_KINDS.find((kind) => text.includes(kind)) ?? null;
}

function withLabels(text: string): string {
  return TEMPLATE_KINDS.reduce(
    (result, kind) => result.split(kind).join(TEMPLATE_KIND_LABELS_RU[kind]),
    text,
  );
}

export interface TemplateServerErrors {
  /** Сообщение под конкретным редактором, ключ уже заменён на подпись. */
  byKind: Partial<Record<TemplateKind, string>>;
  /** Не удалось привязать к шаблону — общая ошибка под формой. */
  general: FormError | null;
}

export function distributeTemplateServerError(error: FormError): TemplateServerErrors {
  const kind = kindIn(error.message);
  if (!kind) return { byKind: {}, general: error };
  return { byKind: { [kind]: withLabels(error.message) }, general: null };
}
