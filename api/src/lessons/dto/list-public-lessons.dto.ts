// Query GET /public/lessons (ADR-0170, контракт Workshop). Структуру проверяет
// только формат: «либо limit, либо оба from+to», смещение и ширину окна —
// `resolvePublicLessonsWindow` (одно место, как у resolveLessonsWindow).
// Неизвестный параметр и повтор параметра (массив не проходит IsInt/IsISO8601)
// режет глобальный ValidationPipe (`forbidNonWhitelisted`) — здесь не дублируем.
import { IsISO8601, IsOptional } from 'class-validator';
import { PUBLIC_LESSONS_LIMIT_MAX, type ApiRouteQuery } from '@xuanxue/shared';
import { ListLimit } from '../../common/validation';

export class ListPublicLessonsDto implements ApiRouteQuery<'GET /public/lessons'> {
  @ListLimit(PUBLIC_LESSONS_LIMIT_MAX)
  limit?: number;

  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;
}
