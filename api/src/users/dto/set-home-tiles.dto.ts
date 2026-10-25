// Тело PUT /me/home-tiles — полный список скрытых плиток «Главной» (ADR-0179).
// userId в теле нет и не будет: владелец — сессия (@CurrentUser()), иначе один
// человек мог бы переставить плитки другому (SECURITY §2). Дубли не ошибка —
// их схлопывает сервис; а вот неизвестный ключ и длина больше числа плиток —
// 400, чтобы в базу не легло то, чего кабинет не нарисует. Лишнее поле — 400
// (`forbidNonWhitelisted`).
import { ArrayMaxSize, IsArray, IsIn } from 'class-validator';
import {
  HOME_TILES,
  HOME_TILES_MAX,
  type ApiRouteBody,
  type HomeTileKey,
} from '@xuanxue/shared';

export class SetHomeTilesDto implements ApiRouteBody<'PUT /me/home-tiles'> {
  @IsArray()
  @ArrayMaxSize(HOME_TILES_MAX)
  @IsIn(HOME_TILES, { each: true })
  hidden!: HomeTileKey[];
}
