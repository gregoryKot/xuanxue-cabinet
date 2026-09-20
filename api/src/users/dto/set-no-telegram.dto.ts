// Тело PUT /me/no-telegram — одна ручка на оба направления (ADR-0067):
// `true` ставит отметку «у меня нет Telegram», `false` снимает её, человек
// завёл Telegram позже. userId в теле нет и не будет: владелец — сессия
// (@CurrentUser() в контроллере), не поле формы — иначе один человек мог бы
// поставить отметку другому, просто прислав чужой id (SECURITY §2). Лишнее
// поле в теле не отбрасывается молча, а роняет запрос в 400:
// `forbidNonWhitelisted: true` в app.setup.ts — подмена владельца видна в
// ответе, а не проходит незамеченной (me-no-telegram.e2e-spec.ts).
import { IsBoolean } from 'class-validator';
import type { SetNoTelegramInput } from '@xuanxue/shared';

export class SetNoTelegramDto implements SetNoTelegramInput {
  @IsBoolean()
  noTelegram!: boolean;
}
