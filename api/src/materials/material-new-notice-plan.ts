// Кому и о каком материале написать (ADR-0162). Чистая функция, без Mongo: тик
// читает материалы, получателей и уже записанные строки ленты, здесь только
// решает. Как у `planLessonNotices`, времени у вида нет — сообщать надо сразу, —
// поэтому решение короткое: материал касается выбора человека («о каких
// занятиях», `isMaterialInScope`) и строки о нём у человека ещё нет.
import { lessonRowKey } from '../lessons/lesson-notice-queries';
import type { LessonPrefs } from '../notifications/lesson-scope.service';
import { isMaterialInScope } from './material-audience';
import type { PlanMaterial } from './material-new-notice-queries';

export interface PlannedMaterialNotice {
  userId: string;
  materialId: string;
  materialTitle: string;
}

export interface MaterialNoticePlanInput {
  materials: readonly PlanMaterial[];
  recipients: readonly { id: string }[];
  /** Выбор людей; у кого записи нет — «обо всех занятиях». */
  prefs: ReadonlyMap<string, LessonPrefs>;
  /** Пары «человек × материал», по которым строка ленты уже есть (`lessonRowKey`). */
  existing: ReadonlySet<string>;
}

/** Пары «человек × материал», которым надо сообщить. Порядок — материалы как
 * пришли, внутри материала — получатели как пришли. */
export function planMaterialNotices(
  input: MaterialNoticePlanInput,
): PlannedMaterialNotice[] {
  const { materials, recipients, prefs, existing } = input;
  const planned: PlannedMaterialNotice[] = [];
  for (const material of materials) {
    for (const { id: userId } of recipients) {
      const own = prefs.get(userId);
      if (own && !isMaterialInScope(own.scope, material.audience)) continue;
      if (existing.has(lessonRowKey(userId, material.id))) continue;
      planned.push({ userId, materialId: material.id, materialTitle: material.title });
    }
  }
  return planned;
}
