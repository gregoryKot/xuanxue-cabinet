// Прогон CreateExamItemDto без HTTP (ТЗ 4б.3, docs/PLAN.md §12) — бот заводит
// вопрос напрямую через ExamBotService.createExamItem, минуя ValidationPipe
// (тот стоит только перед контроллером), поэтому правила, которых нет в
// самом ExamItemsService (длина формулировки/критериев/варианта, размер
// массива вариантов — всё living в декораторах DTO), бот обязан проверить
// той же проверкой, не второй копией лимитов (CLAUDE.md «Одна механика —
// один компонент»). Вынесено из exam-bot.service.ts (файл-лимит 150 строк).
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { CreateExamItemInput } from '@xuanxue/shared';
import { formatValidationErrors } from '../common/validation-messages';
import { CreateExamItemDto } from './dto/create-exam-item.dto';

/** `skipUndefinedProperties` — черновик неполон до последнего шага (нет
 * тегов, часто нет ещё вариантов/критериев): непереданное поле не должно
 * считаться пустым `''`/`[]` и падать на `@IsNotEmpty()`/`@ArrayMaxSize()`,
 * которых при частичном шаге ещё рано спрашивать. `null` — ошибок нет. */
export async function validateExamItemDraftInput(
  input: Partial<CreateExamItemInput>,
): Promise<string[] | null> {
  const instance = plainToInstance(CreateExamItemDto, input);
  const errors = await validate(instance, {
    whitelist: true,
    skipUndefinedProperties: true,
  });
  return errors.length > 0 ? formatValidationErrors(errors) : null;
}
