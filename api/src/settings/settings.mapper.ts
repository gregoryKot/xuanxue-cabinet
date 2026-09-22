// Единственный маппер SettingsRecord (lean) → SettingsDto (CLAUDE.md,
// раздел «API»: документ Mongoose наружу не возвращается) — вынесен из
// settings.service.ts ради лимита файла (CLAUDE.md «Храповики», 150 строк).
import {
  DEFAULT_NEWCOMER_CONTACT,
  DEFAULT_PREVIEW_MINUTES,
  type SettingsDto,
} from '@xuanxue/shared';
import { toIsoUtc } from '../common/iso-date';
import type { SettingsRecord } from './settings.schema';

export type LeanSettings = Pick<
  SettingsRecord,
  'templates' | 'tz' | 'schoolSiteUrl' | 'previewMinutes' | 'newcomerContact'
> & {
  updatedAt: Date;
};

export function toSettingsDto(doc: LeanSettings): SettingsDto {
  return {
    templates: {
      lesson_link: doc.templates.lessonLink,
      recording: doc.templates.recording,
    },
    tz: doc.tz,
    schoolSiteUrl: doc.schoolSiteUrl,
    // Старая база без поля (до этой настройки) — дефолт, не undefined/NaN
    // (docs/PLAN.md §6, CLAUDE.md «Кабинет учителя: всё настраивается в
    // интерфейсе» — значение живёт в БД, но пустая база не должна ломать
    // поведение, которое раньше держала константа).
    previewMinutes: doc.previewMinutes ?? DEFAULT_PREVIEW_MINUTES,
    // Та же причина, что у previewMinutes выше: старая база без поля —
    // дефолт (DEFAULT_NEWCOMER_CONTACT, domain.ts), не undefined.
    newcomerContact: doc.newcomerContact ?? DEFAULT_NEWCOMER_CONTACT,
    updatedAt: toIsoUtc(doc.updatedAt),
  };
}
