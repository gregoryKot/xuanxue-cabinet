// Тело POST /broadcasts — разовая рассылка (docs/PLAN.md §6 «Рассылки»).
// `scheduledAt` без смещения (offset) отсеивает не class-validator, а сервис
// через `parseUtcIso` (lesson-dates.ts) — тот же приём, что у /lessons.
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsISO8601,
  IsMongoId,
  IsNotEmpty,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import {
  BROADCAST_LIMITS,
  IDEMPOTENCY_KEY_LIMITS,
  IDEMPOTENCY_KEY_RE,
  type CreateBroadcastInput,
} from '@xuanxue/shared';
import { OptionalNotNull, TrimString } from '../../common/validation';

export class CreateBroadcastDto implements CreateBroadcastInput {
  @TrimString()
  @IsString()
  @IsNotEmpty()
  @MaxLength(BROADCAST_LIMITS.text)
  text!: string;

  @ArrayNotEmpty()
  @ArrayMaxSize(BROADCAST_LIMITS.channelsMax)
  // Дубль в теле раньше падал на insertMany доставок с той же (broadcastId,
  // channelId) — 400 здесь понятнее 500 от драйвера.
  @ArrayUnique()
  @IsMongoId({ each: true })
  channelIds!: string[];

  @OptionalNotNull()
  @IsISO8601({ strict: true })
  scheduledAt?: string;

  // Ключ двойного клика/ретрая (CLAUDE.md «API»): без него повтор POST
  // создавал бы вторую рассылку и второй пост в канале.
  @IsString()
  // Тексты — продолжение «Ключ повтора: …» (formatValidationErrors добавляет
  // подпись поля из FIELD_LABELS_RU); `isLength` в словаре constraintText нет.
  @Length(IDEMPOTENCY_KEY_LIMITS.min, IDEMPOTENCY_KEY_LIMITS.max, {
    message: `от ${IDEMPOTENCY_KEY_LIMITS.min} до ${IDEMPOTENCY_KEY_LIMITS.max} символов.`,
  })
  @Matches(IDEMPOTENCY_KEY_RE, { message: 'только латинские буквы, цифры и дефис.' })
  idempotencyKey!: string;
}
