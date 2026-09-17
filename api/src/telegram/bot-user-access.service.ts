// Единственная точка «узнать человека по chatId бота» для входов, открытых
// ученику (экзамены — ТЗ 4б.2, ADR-0023/0024): то же правило доступа по
// статусу, что у AuthGuard в вебе (api/src/auth/auth.guard.ts) — `blocked`
// отказывает всегда, `active` пропускает. Найдена аудитом: UsersService.findByTelegramId
// статус не фильтрует (это просто чтение документа), а хендлеры бота брали
// пользователя напрямую им и статус нигде не смотрели — заблокированный или
// неподтверждённый продолжал сдавать экзамены через бота, хотя веб его уже
// не пускал (нарушение ADR-0026, SECURITY §9).
//
// Отдельный сервис здесь, в telegram/, а не метод на UsersService: правило
// «что показать и как ответить» — часть контракта бота (текст, молчание для
// незнакомца), а UsersService — только CRUD без бизнес-правил (никакой другой
// его метод не решает, что видит вызывающий). В вебе то же правило живёт в
// Nest-гварде, но HTTP-гварды `CanActivate` на апдейты Telegraf не
// накладываются — Telegraf вызывает хендлеры напрямую, поэтому правило здесь
// продублировано явным вызовом в начале каждого входа, а не унаследовано от
// гварда автоматически. Каждый новый вход бота в данные ученика обязан
// начинаться с `resolve()` — из этого одного места, не второй проверкой.
import { Injectable } from '@nestjs/common';
import { ACCESS_MESSAGE } from '@xuanxue/shared';
import { UsersService, type UserLean } from '../users/users.service';

/** `unknown` — в users нет записи с таким telegramId: бот отвечает
 * молчанием, как и раньше (SECURITY §4 — чужой/незнакомый chatId). `denied` —
 * человек известен, но `blocked`: `message` — готовый текст по VOICE, тихо
 * игнорировать нельзя (CLAUDE.md «тихий отказ — самая дорогая ошибка»).
 * `active` — пропускаем, дальше идёт обычный `UserLean`. */
export type BotUserAccess =
  | { readonly kind: 'unknown' }
  | { readonly kind: 'denied'; readonly message: string }
  | { readonly kind: 'active'; readonly user: UserLean };

@Injectable()
export class BotUserAccessService {
  constructor(private readonly usersService: UsersService) {}

  async resolve(telegramId: number): Promise<BotUserAccess> {
    const user = await this.usersService.findByTelegramId(telegramId);
    if (!user) return { kind: 'unknown' };
    if (user.status === 'blocked') return { kind: 'denied', message: ACCESS_MESSAGE };
    return { kind: 'active', user };
  }
}
