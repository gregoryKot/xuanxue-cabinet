// Одноразовый импорт экзамена из файла сида в Mongo — идемпотентный: второй
// запуск ничего не дублирует. Вопрос ищется по точному `prompt`, форма — по
// точному `title`; оба поля зашифрованы (encJson/enc, exam-item.schema.ts,
// exam.schema.ts), поэтому Mongo не умеет сравнить их сам — только полное
// чтение коллекции и decrypt на стороне сервиса (тот же приём, что дубль
// (title, groupLabel) в SeedService, только ключ здесь — расшифрованный
// текст, не индексируемая пара строк).
import { readFile } from 'fs/promises';
import { dirname, join } from 'path';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { InvalidInputError } from '../common/errors';
import { isEncryptionConfigured } from '../utils/encryption';
import type { CreateExamDto } from '../exams/dto/create-exam.dto';
import { ExamImagesService } from '../exam-images/exam-images.service';
import {
  parseExamImageUpload,
  type ParsedExamImage,
} from '../exam-images/exam-image-upload';
import { ExamItemsService } from '../exams/exam-items.service';
import { decryptExamItem, type RawLeanExamItem } from '../exams/exam-item.mapper';
import { ExamItemRecord } from '../exams/exam-item.schema';
import { ExamsService } from '../exams/exams.service';
import { decryptExam, type RawLeanExam } from '../exams/exam.mapper';
import { ExamRecord, type ExamBlockRecord } from '../exams/exam.schema';
import {
  parseExamSeedFile,
  validateExamSeed,
  type ExamSeedQuestion,
} from './seed-exam-file';
import { SeedValidationFailedError } from './seed.service';

export interface ExamSeedReport {
  examTitle: string;
  examCreated: boolean;
  createdQuestions: string[];
  skippedQuestions: string[];
  uploadedImages: number;
}

/** Картинка одного варианта после чтения файла и разбора байтов; `path` —
 * тот же относительный путь, что в файле сида (по нему importQuestions
 * дедуплицирует загрузку в exam-images). */
interface LoadedOptionImage {
  path: string;
  parsed: ParsedExamImage;
}

/** Вопрос вместе с картинками его вариантов, уже прочитанными с диска —
 * `optionImages[i]` отвечает `question.item.options[i]` (и, что то же самое,
 * `question.optionImagePaths[i]`): массив собирает сам loadImages в один
 * проход по questions, поэтому индексы совпадают по построению, а не по
 * повторному поиску. Раньше importQuestions заново искал картинку по пути в
 * `Map`, и `.get()` мог по типу вернуть `undefined`, хотя loadImages
 * перебирает ровно те же пути, — недостижимая на практике ветка, которую
 * нечем было покрыть тестом. Здесь такого поиска нет вовсе: у
 * importQuestions остаётся один честный случай `undefined` — «у этого
 * варианта картинки не было в файле». */
interface LoadedExamQuestion {
  question: ExamSeedQuestion;
  optionImages: readonly (LoadedOptionImage | undefined)[];
}

const MISSING_KEY_MESSAGE =
  'Не задан ENCRYPTION_KEY — формулировки вопросов легли бы в базу открытым ' +
  'текстом. Укажите тот же ключ, что в Railway, и повторите импорт.';

/** `code === 'ENOENT'` без `err instanceof Error` (в отличие от аналога в
 * seed-report.ts): `err` здесь — настоящая ошибка `fs.readFile()`, и под
 * jest-environment-node (свой vm-контекст на файл спека) `instanceof Error`
 * для неё внутри теста ложно `false`, хотя `code` при этом читается
 * нормально (в проде такого контекста нет, там сработал бы и instanceof, но
 * раз есть проверка надёжнее — полагаться на instanceof незачем). Каст, не
 * рантайм-проверка формы: `err` из `catch` после падения fs — всегда объект
 * такой формы. */
function isEnoentError(err: unknown): boolean {
  return (err as NodeJS.ErrnoException).code === 'ENOENT';
}

/** Сначала вопросы в порядке файла, затем те id из блоков существующей формы,
 * которых в файле нет — с сохранением их взаимного порядка. Ничего не
 * удаляется: учитель мог собрать в форме вопрос, которого нет в этом файле. */
function mergeItemIds(
  fileOrderIds: readonly string[],
  existingBlocks: readonly ExamBlockRecord[],
): string[] {
  const merged = [...fileOrderIds];
  const seen = new Set(fileOrderIds);
  for (const block of existingBlocks) {
    for (const id of block.itemIds) {
      if (seen.has(id)) continue;
      seen.add(id);
      merged.push(id);
    }
  }
  return merged;
}

@Injectable()
export class SeedExamService {
  constructor(
    @InjectModel(ExamRecord.name) private readonly examModel: Model<ExamRecord>,
    @InjectModel(ExamItemRecord.name) private readonly itemModel: Model<ExamItemRecord>,
    private readonly examsService: ExamsService,
    private readonly examItemsService: ExamItemsService,
    private readonly examImagesService: ExamImagesService,
  ) {}

  async importExam(filePath: string): Promise<ExamSeedReport> {
    const text = await readFile(filePath, 'utf8');
    const { errors, exam, questions } = validateExamSeed(parseExamSeedFile(text));
    if (errors.length > 0) throw new SeedValidationFailedError(errors);

    // ДО любой записи — байты и формат всех картинок файла разом: битая или
    // отсутствующая картинка не должна всплыть на середине импорта, когда
    // часть вопросов уже создана.
    const loadedQuestions = await this.loadImages(dirname(filePath), questions);

    // ДО любой записи — без ключа шифрования формулировки вопросов легли бы
    // в базу открытым текстом (тот же приём, что SeedService.importClasses).
    if (!isEncryptionConfigured()) throw new InvalidInputError(MISSING_KEY_MESSAGE);

    const { itemIds, createdQuestions, skippedQuestions, uploadedImages } =
      await this.importQuestions(loadedQuestions);
    const examCreated = await this.upsertExam(exam, itemIds);

    return {
      examTitle: exam.title,
      examCreated,
      createdQuestions,
      skippedQuestions,
      uploadedImages,
    };
  }

  /** Читает и проверяет байты каждой картинки, на которую ссылается файл —
   * один раз на уникальный путь (CLAUDE.md «одна механика — один
   * компонент»: тот же `parseExamImageUpload`, что и у загрузки через API),
   * кэш по пути внутри — только сам приём чтения-с-кэшем скрыт здесь, наружу
   * отдаётся результат, уже разложенный по вопросам и вариантам (см.
   * комментарий у LoadedExamQuestion). ENOENT — понятная ошибка с путём, не
   * голый стек fs. */
  private async loadImages(
    fileDir: string,
    questions: readonly ExamSeedQuestion[],
  ): Promise<LoadedExamQuestion[]> {
    const cache = new Map<string, ParsedExamImage>();

    const readOnce = async (relativePath: string): Promise<ParsedExamImage> => {
      const cached = cache.get(relativePath);
      if (cached !== undefined) return cached;
      const absolutePath = join(fileDir, relativePath);
      let bytes: Buffer;
      try {
        bytes = await readFile(absolutePath);
      } catch (err) {
        if (isEnoentError(err)) {
          throw new InvalidInputError(
            `Файла картинки нет: ${absolutePath} (указан как "${relativePath}" в файле ` +
              'сида). Проверьте путь и повторите импорт.',
          );
        }
        throw err;
      }
      const parsed = parseExamImageUpload(bytes);
      cache.set(relativePath, parsed);
      return parsed;
    };

    const loaded: LoadedExamQuestion[] = [];
    for (const question of questions) {
      const optionImages: (LoadedOptionImage | undefined)[] = [];
      for (const path of question.optionImagePaths) {
        if (path === undefined) {
          optionImages.push(undefined);
          continue;
        }
        optionImages.push({ path, parsed: await readOnce(path) });
      }
      loaded.push({ question, optionImages });
    }
    return loaded;
  }

  /** Найден по `prompt` — id идёт в состав формы, ничего не пишем (отчёт:
   * «пропущен»). Не найден — грузим картинки его вариантов (один раз на путь
   * за весь запуск, дальше — тот же imageId) и создаём вопрос через
   * ExamItemsService — тем же сервисом, что и кабинет, не сырой моделью. */
  private async importQuestions(loadedQuestions: readonly LoadedExamQuestion[]): Promise<{
    itemIds: string[];
    createdQuestions: string[];
    skippedQuestions: string[];
    uploadedImages: number;
  }> {
    const existing = await this.itemModel.find().lean<RawLeanExamItem[]>();
    const existingIdByPrompt = new Map(
      existing.map((doc) => [decryptExamItem(doc).prompt, doc._id.toString()]),
    );

    const itemIds: string[] = [];
    const createdQuestions: string[] = [];
    const skippedQuestions: string[] = [];
    const uploadedImageIdByPath = new Map<string, string>();
    let uploadedImages = 0;

    for (const { question, optionImages } of loadedQuestions) {
      const existingId = existingIdByPrompt.get(question.item.prompt);
      if (existingId !== undefined) {
        skippedQuestions.push(question.item.prompt);
        itemIds.push(existingId);
        continue;
      }

      for (const [index, option] of (question.item.options ?? []).entries()) {
        const image = optionImages[index];
        if (image === undefined) continue;

        let imageId = uploadedImageIdByPath.get(image.path);
        if (imageId === undefined) {
          const uploaded = await this.examImagesService.upload(image.parsed.bytes);
          imageId = uploaded.id;
          uploadedImageIdByPath.set(image.path, imageId);
          uploadedImages += 1;
        }
        option.imageId = imageId;
      }

      const created = await this.examItemsService.create(question.item);
      createdQuestions.push(question.item.prompt);
      itemIds.push(created.id);
    }

    return { itemIds, createdQuestions, skippedQuestions, uploadedImages };
  }

  /** Нет формы с таким `title` — новая создаётся черновиком с одним блоком
   * (ADR-0033). Есть — состав единственного блока сливается (mergeItemIds),
   * поля самой формы (title/description/…) не трогаем: их мог поправить
   * учитель в кабинете, повторный импорт не должен затирать его правку. */
  private async upsertExam(
    exam: CreateExamDto,
    itemIds: readonly string[],
  ): Promise<boolean> {
    const existingExams = await this.examModel.find().lean<RawLeanExam[]>();
    const match = existingExams
      .map((doc) => ({ id: doc._id.toString(), decrypted: decryptExam(doc) }))
      .find(({ decrypted }) => decrypted.title === exam.title);

    if (match === undefined) {
      await this.examsService.create({
        title: exam.title,
        description: exam.description,
        level: exam.level,
        shuffleOptions: exam.shuffleOptions,
        attemptsAllowed: exam.attemptsAllowed,
        timeLimitMin: exam.timeLimitMin,
        blocks: [{ title: '', itemIds: [...itemIds], shuffle: false }],
      });
      return true;
    }

    const firstBlock = match.decrypted.blocks[0];
    await this.examsService.update(match.id, {
      blocks: [
        {
          id: firstBlock?.id,
          title: firstBlock?.title ?? '',
          itemIds: mergeItemIds(itemIds, match.decrypted.blocks),
          shuffle: firstBlock?.shuffle ?? false,
        },
      ],
    });
    return false;
  }
}
