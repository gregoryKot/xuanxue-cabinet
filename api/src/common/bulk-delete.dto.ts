// Тело `POST /<коллекция>/bulk-delete` (ADR-0141) — общий для всех
// контроллеров с массовым удалением, не свой на exam-items/exams: строки id
// без формата ObjectId нарочно (`@IsString`, не `@IsMongoId`) — невалидный id
// должен дойти до `bulkRemove`/`assertObjectId` и попасть в `failed` с
// понятным текстом, а не тихо срезаться здесь 400-м без объяснения, какого
// из id это касается.
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsString } from 'class-validator';
import { BULK_DELETE_MAX_IDS, type BulkDeleteInput } from '@xuanxue/shared';

export class BulkDeleteDto implements BulkDeleteInput {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(BULK_DELETE_MAX_IDS)
  @IsString({ each: true })
  ids!: string[];
}
