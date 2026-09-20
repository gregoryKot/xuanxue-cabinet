// Тело POST /client-errors — отчёт браузера о сбое (ADR-0071). Общий
// контракт с web — ReportClientErrorInput (shared/src/client-errors.ts):
// `implements` ловит tsc'ом расхождение полей (CLAUDE.md «Слои»). Формат
// `path` проверяется здесь же — адрес экрана, а не внешняя ссылка; сам
// query сервер всё равно вырезает при обработке (ClientErrorsService), но
// произвольный URL в этом поле не нужен и на входе.
import { IsIn, IsString, Matches, MaxLength } from 'class-validator';
import {
  CLIENT_ERROR_KINDS,
  CLIENT_ERROR_LIMITS,
  CLIENT_ERROR_PATH_RE,
  type ClientErrorKind,
  type ReportClientErrorInput,
} from '@xuanxue/shared';

export class ReportClientErrorDto implements ReportClientErrorInput {
  @IsIn(CLIENT_ERROR_KINDS)
  kind!: ClientErrorKind;

  @IsString()
  @MaxLength(CLIENT_ERROR_LIMITS.fieldHardMax)
  message!: string;

  @IsString()
  @MaxLength(CLIENT_ERROR_LIMITS.fieldHardMax)
  @Matches(CLIENT_ERROR_PATH_RE)
  path!: string;
}
