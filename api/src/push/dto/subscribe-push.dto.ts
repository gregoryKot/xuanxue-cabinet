// Тело POST /me/push-subscriptions — то, что браузер отдаёт из
// `pushManager.subscribe().toJSON()` (ADR-0092). userId в DTO нет и не будет:
// владелец — сессия (@CurrentUser в контроллере), не поле формы.
import { IsString, IsUrl, Matches, MaxLength } from 'class-validator';
import {
  PUSH_SUBSCRIPTION_KEY_RE,
  PUSH_SUBSCRIPTION_LIMITS,
  type SubscribePushInput,
} from '@xuanxue/shared';

export class SubscribePushDto implements SubscribePushInput {
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(PUSH_SUBSCRIPTION_LIMITS.endpoint)
  endpoint!: string;

  @IsString()
  @Matches(PUSH_SUBSCRIPTION_KEY_RE, { message: 'должен быть строкой в base64url.' })
  @MaxLength(PUSH_SUBSCRIPTION_LIMITS.p256dh)
  p256dh!: string;

  @IsString()
  @Matches(PUSH_SUBSCRIPTION_KEY_RE, { message: 'должен быть строкой в base64url.' })
  @MaxLength(PUSH_SUBSCRIPTION_LIMITS.auth)
  auth!: string;
}
