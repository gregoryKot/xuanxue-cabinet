// Прогон CreateExamDto без HTTP (ТЗ 4б.4, docs/PLAN.md §12) — учитель
// собирает экзамен в боте через ExamBotService.createAndPublishExam, минуя
// ValidationPipe (тот стоит только перед контроллером): лимиты названия,
// числа вопросов и попыток проверяет тот же DTO, что и POST /exams — бот не
// пишет вторую копию (CLAUDE.md «Одна механика — один компонент»). Тот же
// приём, что exam-item-draft-validate.ts у диалога «Новый вопрос» (ТЗ 4б.3).
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { CreateExamInput } from '@xuanxue/shared';
import { formatValidationErrors } from '../common/validation-messages';
import { CreateExamDto } from './dto/create-exam.dto';

/** `skipUndefinedProperties` — черновик неполон до последнего шага (лимит
 * времени и число попыток появляются только к середине диалога): непереданное
 * поле не должно считаться пустым и падать раньше своего шага. `null` —
 * ошибок нет. Правило «хотя бы один вопрос»/«вопрос опубликован» сюда не
 * входит — оно в ExamsService (assertPublishable), не в DTO. */
export async function validateExamDraftInput(
  input: Partial<CreateExamInput>,
): Promise<string[] | null> {
  const instance = plainToInstance(CreateExamDto, input);
  const errors = await validate(instance, {
    whitelist: true,
    skipUndefinedProperties: true,
  });
  return errors.length > 0 ? formatValidationErrors(errors) : null;
}
