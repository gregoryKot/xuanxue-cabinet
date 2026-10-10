// Решения для выгрузки данных (ADR-0160) по нативному входу Daychi (ADR-0181).
// Вынесено из user-export.registry.ts: файл выше потолка храповика, а эти две
// записи про одну механику. Ключи — модели из USER_OWNED_COLLECTIONS; полноту
// держат `tsc` (Record<ExportedModel, …>) и user-export.registry.spec.ts.
import { Duration } from 'luxon';
import { NATIVE_CREDENTIAL_LIFETIME_SEC, formatDaysRu } from '@xuanxue/shared';
import type { ExportSectionSpec } from '../users/user-export.registry';

const LIFETIME_DAYS = Duration.fromObject({
  seconds: NATIVE_CREDENTIAL_LIFETIME_SEC,
}).as('days');

export const NATIVE_AUTH_EXPORT_SECTIONS: Record<
  'NativeGrantRecord' | 'NativeCredentialRecord',
  ExportSectionSpec
> = {
  NativeGrantRecord: {
    title: 'Входы приложения Daychi',
    retention: `Пока жив хоть один ключ входа, и до ${formatDaysRu(LIFETIME_DAYS)} после его последнего продления`,
    include: ['clientId', 'revokedAt'],
    omit: {
      purgeAt: 'служебный срок, до которого запись нужна для проверки отзыва',
    },
  },
  NativeCredentialRecord: {
    title: 'Ключи входа приложения Daychi (сами ключи не хранятся)',
    retention: `${formatDaysRu(LIFETIME_DAYS)} с выдачи`,
    include: ['issuedAt', 'expiresAt', 'grantId'],
    omit: { tokenHash: 'хеш секрета входа, не данные человека' },
  },
};
