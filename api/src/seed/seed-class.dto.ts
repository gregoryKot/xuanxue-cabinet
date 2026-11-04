import { IsOptional, IsString, MaxLength } from 'class-validator';
import { GROUP_LIMITS } from '@xuanxue/shared';
import { CreateClassDto } from '../classes/dto/create-class.dto';

/** Занятие в файле сида: группа названа текстом (`groupLabel`), как её пишет
 * школа, — SeedService находит или заводит группу с таким названием
 * (ADR-0193). В теле POST /classes этого поля больше нет, поэтому оно живёт
 * только здесь, а не в CreateClassDto. */
export class SeedClassDto extends CreateClassDto {
  @IsOptional()
  @IsString()
  @MaxLength(GROUP_LIMITS.name)
  groupLabel?: string;
}
