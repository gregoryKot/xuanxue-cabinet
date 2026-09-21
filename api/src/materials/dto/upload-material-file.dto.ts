// Query POST /api/materials/:id/file (ADR-0057). Тело запроса — сырые байты
// файла, поэтому имя, под которым браузер его потом сохранит, приезжает
// отдельным параметром: в байтах имени нет.
import { IsString, Length } from 'class-validator';
import { MATERIAL_FILE_LIMITS } from '@xuanxue/shared';

export class UploadMaterialFileDto {
  @IsString({ message: 'Имя файла обязательно' })
  @Length(1, MATERIAL_FILE_LIMITS.name, {
    message: `Имя файла — от 1 до ${MATERIAL_FILE_LIMITS.name} символов`,
  })
  name!: string;
}
