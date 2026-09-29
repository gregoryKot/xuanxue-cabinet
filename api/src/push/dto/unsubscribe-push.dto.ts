// Тело DELETE /me/push-subscriptions — endpoint в теле, не в query/пути
// (ADR-0092: он длинный и с символами, которые пришлось бы кодировать).
import { IsUrl, MaxLength } from 'class-validator';
import { PUSH_SUBSCRIPTION_LIMITS, type ApiRouteBody } from '@xuanxue/shared';

export class UnsubscribePushDto implements ApiRouteBody<'DELETE /me/push-subscriptions'> {
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(PUSH_SUBSCRIPTION_LIMITS.endpoint)
  endpoint!: string;
}
