// Решения для выгрузки данных (ADR-0160) по нативному входу Daychi (ADR-0181).
// Вынесено из user-export.registry.ts: файл выше потолка храповика, а эти
// записи про одну механику. Ключи — модели из USER_OWNED_COLLECTIONS; полноту
// держат `tsc` (Record<ExportedModel, …>) и user-export.registry.spec.ts.
import { Duration } from 'luxon';
import {
  NATIVE_ATTEMPT_LIFETIME_SEC,
  NATIVE_CODE_LIFETIME_SEC,
  NATIVE_CREDENTIAL_LIFETIME_SEC,
  formatDaysRu,
  formatDurationRu,
} from '@xuanxue/shared';
import type { ExportSectionSpec } from '../users/user-export.registry';

const LIFETIME_DAYS = Duration.fromObject({
  seconds: NATIVE_CREDENTIAL_LIFETIME_SEC,
}).as('days');
const ATTEMPT_RECORD_MINUTES = Duration.fromObject({
  seconds: NATIVE_ATTEMPT_LIFETIME_SEC + NATIVE_CODE_LIFETIME_SEC,
}).as('minutes');

const ATTEMPT_PARAMETER = 'параметр запроса приложения, не данные человека';
const ATTEMPT_TIMING = 'служебный срок попытки входа';
const SECRET_HASH = 'хеш секрета входа, не данные человека';

export const NATIVE_AUTH_EXPORT_SECTIONS: Record<
  'NativeGrantRecord' | 'NativeCredentialRecord' | 'NativeAuthorizationRecord',
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
    omit: { tokenHash: SECRET_HASH },
  },
  // Попытка — след входа из браузера, а не сведения о человеке: в выгрузку идёт
  // только факт и время записи, поля попытки — нет (ADR-0181 «Данные»).
  NativeAuthorizationRecord: {
    title: 'Попытки входа приложения Daychi',
    retention: `${formatDurationRu(ATTEMPT_RECORD_MINUTES)} с начала входа, потом удаляется сама`,
    include: [],
    omit: {
      issuer: ATTEMPT_PARAMETER,
      clientId: ATTEMPT_PARAMETER,
      redirectUri: ATTEMPT_PARAMETER,
      scope: ATTEMPT_PARAMETER,
      state: ATTEMPT_PARAMETER,
      codeChallenge: ATTEMPT_PARAMETER,
      bindingHash: 'хеш привязки браузера, не данные человека',
      codeHash: SECRET_HASH,
      expiresAt: ATTEMPT_TIMING,
      completedAt: ATTEMPT_TIMING,
      codeExpiresAt: ATTEMPT_TIMING,
      codeConsumedAt: ATTEMPT_TIMING,
      purgeAt: ATTEMPT_TIMING,
    },
  },
};
