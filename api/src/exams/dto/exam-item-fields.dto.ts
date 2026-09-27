// Поля, общие для тела POST и PATCH /exam-items (создание и правка одной
// формой) — options не меняет ни обязательность, ни тип между create и
// update, поэтому декоратор не дублируется (метаданные class-validator
// наследуются по прототипу — тот же приём, что у ClassFieldsDto в
// classes/dto/class-fields.dto.ts).
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, ValidateNested } from 'class-validator';
import { EXAM_ITEM_LIMITS, type ExamItemOptionInput } from '@xuanxue/shared';
import { OptionalNotNull } from '../../common/validation';
import { ExamItemOptionDto } from './exam-item-option.dto';

export class ExamItemFieldsDto {
  // Размер массива (не больше optionsMax) — универсально безопасно на
  // уровне DTO; минимум и число отмеченных «верно» зависят от kind — это
  // сочетание полей, проверка в сервисе (ТЗ 4.2, п.2, exam-item-options.ts).
  @OptionalNotNull()
  @IsArray()
  @ArrayMaxSize(EXAM_ITEM_LIMITS.optionsMax)
  @ValidateNested({ each: true })
  @Type(() => ExamItemOptionDto)
  options?: ExamItemOptionInput[];
}
