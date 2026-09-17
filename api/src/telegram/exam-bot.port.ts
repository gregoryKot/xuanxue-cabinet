// Порт к сервисам экзаменов для бота (слой 4б.2, ADR-0024) — бот становится
// вторым клиентом ExamAttemptsService/MyExamsService, но api/src/telegram не
// может импортировать api/src/exams напрямую: ExamsModule уже импортирует
// TelegramModule ради EXAM_NOTIFIER (exams.module.ts) — обратный импорт
// закольцевал бы граф модулей (import-x/no-cycle, CLAUDE.md «Слои»).
// Интерфейс живёт здесь (как EXAM_NOTIFIER — в exams/, в обратную
// сторону); реализация (ExamBotService, exams/exam-bot.service.ts) кладёт
// себя в ExamBotPortRegistry при подъёме ExamsModule — см. комментарий
// там же, почему инверсия, а не обычный импорт.
import type { DateTime } from 'luxon';
import type {
  AttemptAnswerDto,
  CreateExamInput,
  CreateExamItemInput,
  ExamAttemptDto,
  ExamDto,
  ExamImageContentType,
  ExamItemDto,
  MyExamDto,
} from '@xuanxue/shared';
import type { UserLean } from '../users/users.service';

/** Картинка варианта для показа в боте (слой 4б.2, ADR-0035) —
 * `telegramFileId`, если эту картинку уже отправляли раньше: кэш экономит
 * трафик на повторный показ вопроса (exam-question-album-send.ts). */
export interface BotOptionImage {
  bytes: Buffer;
  contentType: ExamImageContentType;
  telegramFileId?: string;
}

export interface ExamBotPort {
  listMyExams(user: UserLean, now: DateTime): Promise<MyExamDto[]>;
  startAttempt(examId: string, user: UserLean, now: DateTime): Promise<ExamAttemptDto>;
  /** `null` — чужая или несуществующая попытка (SECURITY §3: не
   * подтверждаем даже факт существования чужой работы). */
  loadOwnAttempt(
    attemptId: string,
    user: UserLean,
    now: DateTime,
  ): Promise<ExamAttemptDto | null>;
  saveAnswer(
    attemptId: string,
    user: UserLean,
    answer: AttemptAnswerDto,
    now: DateTime,
  ): Promise<ExamAttemptDto>;
  submitAttempt(
    attemptId: string,
    user: UserLean,
    now: DateTime,
  ): Promise<ExamAttemptDto>;
  /** `null` — картинки нет или она не из снимка ЭТОЙ попытки (SECURITY §3):
   * ExamImagesService.load бросает NotFoundError, здесь это деградация —
   * экран вопроса показываем всё равно, кнопки «Вариант N» работают
   * (CLAUDE.md «Ноль нагрузки на ученика»), не отказ. */
  loadOptionImage(imageId: string, user: UserLean): Promise<BotOptionImage | null>;
  /** Кэш `file_id` после удачной отправки (см. BotOptionImage) — следующий
   * показ вопроса шлёт файл строкой, не байтами. */
  rememberTelegramFileId(imageId: string, fileId: string): Promise<void>;
  /** Учитель заводит вопрос в боте (ТЗ 4б.3, ADR-0024) — тот же
   * ExamItemsService.create(), что и кабинет; валидация формулировки,
   * вариантов и верного ответа — целиком в нём, бот своей не добавляет.
   * `authorId` — userId учителя (не chatId), сопоставленный ботом заранее. */
  createExamItem(input: CreateExamItemInput, authorId: string): Promise<ExamItemDto>;
  /** Правила, которые у POST /exam-items живут только в class-validator DTO
   * (длина формулировки/критериев/варианта, число вариантов) — вызов
   * ExamItemsService.create() их не проверяет вовсе: ValidationPipe стоит
   * только перед HTTP-контроллером, бот его не проходит. Бот прогоняет тот
   * же CreateExamItemDto, не пишет вторую проверку (ТЗ 4б.3, «не дублируй»).
   * `null` — ошибок нет; непереданные поля не проверяются (черновик неполон
   * до последнего шага). */
  validateExamItemDraft(input: Partial<CreateExamItemInput>): Promise<string[] | null>;
  /** Список вопросов для сборки экзамена (ТЗ 4б.4, ADR-0024) — только
   * опубликованные, тот же фильтр, что у правила «блок ссылается на
   * опубликованный вопрос» (exam-items-eligible.ts, ADR-0033): вопрос,
   * который нельзя поставить в форму, незачем видеть на шаге отметки. */
  listExamItemsToAssemble(): Promise<ExamItemDto[]>;
  /** Учитель собирает экзамен в боте (ТЗ 4б.4, ADR-0024) — тот же переход в
   * `published`, что и в кабинете (create → update status), одним вызовом:
   * бот не даёт форме остаться черновиком после «Опубликовать».
   * `authorId` — userId учителя, сопоставленный ботом заранее. */
  createAndPublishExam(input: CreateExamInput, authorId: string): Promise<ExamDto>;
  /** Правила лимитов (название, число вопросов в блоке, лимит времени, число
   * попыток) — те же декораторы CreateExamDto, что у POST /exams; бот их не
   * переизобретает. `null` — ошибок нет; непереданные поля не проверяются
   * (черновик неполон до шага, где поле появляется). */
  validateExamDraft(input: Partial<CreateExamInput>): Promise<string[] | null>;
}
