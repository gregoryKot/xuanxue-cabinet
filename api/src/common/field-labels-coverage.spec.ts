// Гейт CLAUDE.md «Ошибки»: у каждого поля каждого DTO — русская подпись в
// FIELD_LABELS_RU (shared/src/field-labels.ts), иначе validation-messages.ts
// молча покажет в форме голое имя поля camelCase/snake_case вместо текста.
// Список DTO ниже — явный: getMetadataStorage() умеет перечислить поля уже
// известного класса, не «все DTO проекта» сам по себе (образец подхода —
// encryption-coverage.spec.ts с MODEL_DEFINITIONS). Новый DTO — допиши в
// список, иначе его поля тест не увидит.
import { getMetadataStorage } from 'class-validator';
import { FIELD_LABELS_RU } from '@xuanxue/shared';
import { TelegramLoginDto } from '../auth/telegram-login.dto';
import { CreateBroadcastDto } from '../broadcasts/dto/create-broadcast.dto';
import { ListBroadcastsDto } from '../broadcasts/dto/list-broadcasts.dto';
import { CreateChannelDto } from '../channels/dto/create-channel.dto';
import { ListChannelsDto } from '../channels/dto/list-channels.dto';
import { UpdateChannelDto } from '../channels/dto/update-channel.dto';
import { ClassFieldsDto } from '../classes/dto/class-fields.dto';
import { CreateClassDto } from '../classes/dto/create-class.dto';
import { ListClassesDto } from '../classes/dto/list-classes.dto';
import { ScheduleRuleDto } from '../classes/dto/schedule-rule.dto';
import { UpdateClassDto } from '../classes/dto/update-class.dto';
import { ListDeliveriesDto } from '../deliveries/dto/list-deliveries.dto';
import { AddRecordingDto } from '../lessons/dto/add-recording.dto';
import { CreateLessonDto } from '../lessons/dto/create-lesson.dto';
import { ListLessonsDto } from '../lessons/dto/list-lessons.dto';
import { UpdateLessonDto } from '../lessons/dto/update-lesson.dto';
import { PreviewSettingsDto } from '../settings/dto/preview-settings.dto';
import {
  UpdateSettingsDto,
  UpdateTemplatesDto,
} from '../settings/dto/update-settings.dto';
import { ListUsersDto } from '../users/dto/list-users.dto';
import { UpdateUserRolesDto } from '../users/dto/update-user-roles.dto';

type DtoConstructor = new (...args: never[]) => object;

// ScheduleRuleDto и UpdateTemplatesDto — не тела запросов сами по себе, а
// вложенные классы (`@ValidateNested() @Type(() => …)`): у class-validator
// их метаданные лежат под собственным классом, наследование (как у
// CreateClassDto/UpdateClassDto от ClassFieldsDto) их не подтягивает —
// добавлены отдельной строкой.
const DTO_CLASSES: DtoConstructor[] = [
  TelegramLoginDto,
  CreateBroadcastDto,
  ListBroadcastsDto,
  CreateChannelDto,
  ListChannelsDto,
  UpdateChannelDto,
  ClassFieldsDto,
  CreateClassDto,
  ListClassesDto,
  ScheduleRuleDto,
  UpdateClassDto,
  ListDeliveriesDto,
  AddRecordingDto,
  CreateLessonDto,
  ListLessonsDto,
  UpdateLessonDto,
  PreviewSettingsDto,
  UpdateSettingsDto,
  UpdateTemplatesDto,
  ListUsersDto,
  UpdateUserRolesDto,
];

function fieldsOf(dtoClass: DtoConstructor): string[] {
  const metadatas = getMetadataStorage().getTargetValidationMetadatas(
    dtoClass,
    '',
    true,
    false,
    undefined,
  );
  return [...new Set(metadatas.map((metadata) => metadata.propertyName))];
}

describe('field-labels-coverage', () => {
  for (const dtoClass of DTO_CLASSES) {
    it(`${dtoClass.name}: у каждого поля есть подпись в FIELD_LABELS_RU`, () => {
      const missing = fieldsOf(dtoClass).filter((field) => !(field in FIELD_LABELS_RU));
      expect(missing).toEqual([]);
    });
  }

  it('в списке нет пустых подписей (опечатка не дыра)', () => {
    const blank = Object.entries(FIELD_LABELS_RU)
      .filter(([, label]) => label.trim() === '')
      .map(([field]) => field);
    expect(blank).toEqual([]);
  });
});
