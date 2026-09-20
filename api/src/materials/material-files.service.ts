// Файл материала: загрузка, ссылка на скачивание, снятие (ADR-0057, слой
// 3.10 docs/PLAN.md §14). Байты проходят через наш инстанс только на
// загрузке — учитель кладёт файл несколько раз в неделю; скачивание идёт
// мимо нас, ответом `302` на подписанную ссылку.
//
// Право на файл — то же, что на ссылку: `isMaterialLocked` (ADR-0048).
// Иначе рубильник оплаты обходится прямым адресом файла, и всё решение
// ADR-0048 становится украшением.
import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { DateTime } from 'luxon';
import { Model } from 'mongoose';
import {
  MATERIAL_FILE_NOT_FOUND_MESSAGE,
  MATERIAL_NOT_FOUND_MESSAGE,
  type MaterialDto,
} from '@xuanxue/shared';
import { NotFoundError } from '../common/errors';
import { assertObjectId } from '../common/object-id';
import { SettingsService } from '../settings/settings.service';
import { FileStoreService } from '../storage/file-store.service';
import { StorageOrphansService } from '../storage/storage-orphans.service';
import { encryptRecord } from '../utils/encryption';
import { isMaterialLocked } from './material-access';
import { parseMaterialFileUpload } from './material-file-upload';
import { safeFileName } from './material-file-name';
import { decryptMaterial, toMaterialDto, type RawLeanMaterial } from './material.mapper';
import { MATERIAL_ENCRYPT_SCHEMA, MaterialRecord } from './material.schema';

/** Ссылка живёт минуты (ADR-0057): её выдают после проверки права, и
 * переслать её вместо приглашения в школу не выйдет. Десять минут — чтобы
 * хватило начать скачивание книги на плохом мобильном интернете. */
const SIGNED_URL_TTL_SECONDS = 600;

@Injectable()
export class MaterialFilesService {
  constructor(
    @InjectModel(MaterialRecord.name) private readonly model: Model<MaterialRecord>,
    private readonly settingsService: SettingsService,
    private readonly fileStore: FileStoreService,
    private readonly orphans: StorageOrphansService,
  ) {}

  /** Порядок шагов — ADR-0078: запись в журнал раньше объекта, снятие записи
   * после того, как на объект сослался материал. Прежний файл уходит тем же
   * действием. */
  async upload(
    id: string,
    body: unknown,
    name: string,
    now: DateTime,
  ): Promise<MaterialDto> {
    assertObjectId(id, MATERIAL_NOT_FOUND_MESSAGE);
    const { bytes, contentType } = parseMaterialFileUpload(body);
    const exists = await this.model.exists({ _id: id });
    if (!exists) throw new NotFoundError(MATERIAL_NOT_FOUND_MESSAGE);

    const key = `materials/${id}/${randomUUID()}`;
    await this.orphans.track(key);
    await this.fileStore.put({ key, bytes, contentType, now });

    const previous = await this.model
      .findOneAndUpdate(
        { _id: id },
        {
          $set: encryptRecord(
            {
              fileKey: key,
              fileName: safeFileName(name),
              fileContentType: contentType,
              fileSizeBytes: bytes.length,
              fileUploadedAt: now.toUTC().toJSDate(),
            },
            MATERIAL_ENCRYPT_SCHEMA,
          ),
        },
        { returnDocument: 'before' },
      )
      .lean<RawLeanMaterial | null>();
    // Материал успели удалить, пока шла загрузка: объект остаётся в журнале
    // и уходит следующим действием, а не висит в бакете (ADR-0078).
    if (!previous) {
      await this.orphans.removeNow(key, now);
      throw new NotFoundError(MATERIAL_NOT_FOUND_MESSAGE);
    }
    await this.orphans.forget(key);
    if (previous.fileKey) await this.orphans.removeNow(previous.fileKey, now);
    return this.readDto(id);
  }

  /** Снять файл с материала. Сам материал остаётся — «убрать файл» и
   * «удалить материал» на экране разные действия. */
  async detach(id: string, now: DateTime): Promise<MaterialDto> {
    assertObjectId(id, MATERIAL_NOT_FOUND_MESSAGE);
    const doc = await this.model
      .findOneAndUpdate(
        { _id: id },
        { $unset: FILE_FIELDS },
        { returnDocument: 'before' },
      )
      .lean<RawLeanMaterial | null>();
    if (!doc) throw new NotFoundError(MATERIAL_NOT_FOUND_MESSAGE);
    if (!doc.fileKey) throw new NotFoundError(MATERIAL_FILE_NOT_FOUND_MESSAGE);
    await this.orphans.removeNow(doc.fileKey, now);
    return this.readDto(id);
  }

  /** Подписанная ссылка на скачивание — после той же проверки права, что и
   * список (ADR-0048). Нет файла и закрытый материал отвечают одним и тем же
   * 404: ученику не подтверждаем даже факт существования файла (SECURITY §3). */
  async signedUrl(id: string, isStaff: boolean, now: DateTime): Promise<string> {
    assertObjectId(id, MATERIAL_FILE_NOT_FOUND_MESSAGE);
    const [doc, settings] = await Promise.all([
      this.model.findById(id).lean<RawLeanMaterial | null>(),
      this.settingsService.get(),
    ]);
    if (!doc) throw new NotFoundError(MATERIAL_FILE_NOT_FOUND_MESSAGE);
    const material = decryptMaterial(doc);
    const locked = isMaterialLocked({
      access: material.access,
      paidAccessEnabled: settings.materialsPaidAccess,
      isStaff,
    });
    const { fileKey, fileName, fileContentType } = material;
    if (locked || !fileKey || !fileName || !fileContentType) {
      throw new NotFoundError(MATERIAL_FILE_NOT_FOUND_MESSAGE);
    }
    return this.fileStore.signedGetUrl(fileKey, SIGNED_URL_TTL_SECONDS, now, {
      name: fileName,
      contentType: fileContentType,
    });
  }

  /** Read-after-write: отдаём то, что лежит в базе, а не то, что собирались
   * записать (CLAUDE.md «Тесты»). */
  private async readDto(id: string): Promise<MaterialDto> {
    const doc = await this.model.findById(id).lean<RawLeanMaterial | null>();
    if (!doc) throw new NotFoundError(MATERIAL_NOT_FOUND_MESSAGE);
    return toMaterialDto(decryptMaterial(doc));
  }
}

/** Пять полей файла снимаются вместе — половина набора означала бы материал
 * с именем файла, которого нет (material.mapper.ts это переживёт, но база
 * врать не должна). */
const FILE_FIELDS = {
  fileKey: '',
  fileName: '',
  fileContentType: '',
  fileSizeBytes: '',
  fileUploadedAt: '',
} as const;
