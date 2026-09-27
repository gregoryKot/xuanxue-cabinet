// Файл у ещё не созданного материала (ADR-0133) — выбирают до похода в сеть,
// а отправляют только после того, как материал получил id: ключ объекта в R2
// строится из id материала (materialFileUploadPath), и до ответа сервера
// отправлять было бы некуда. Второй шаг («создать» → «загрузить») может не
// долететь: материал уже создан, и вторая попытка обязана не плодить дубль, а
// прикладывать файл к тому же id — отсюда `createdMaterial` в состоянии
// хука, его читает MaterialEditorForm.tsx (`material ?? newFile.createdMaterial`).
import { useState } from 'react';
import type { CreateMaterialInput, MaterialDto } from '@xuanxue/shared';
import { ApiError } from '../api/http';
import { checkMaterialFile, uploadMaterialFile } from './materialFileUpload';

// VOICE.md: короче 80 знаков, честно — что случилось и что делать. ApiError,
// не обычная Error: errorFrom (components/FormServerError.tsx) берёт текст
// из ошибки только у ApiError, у простой Error всегда подставляет общий
// запасной («Не удалось сохранить...») — тогда это сообщение никто бы не увидел.
export const UPLOAD_AFTER_CREATE_ERROR_MESSAGE =
  'Материал сохранён, а файл не загрузился. Приложите его ещё раз.';

export interface UseNewMaterialFileResult {
  /** Выбранный, ещё не отправленный файл. */
  file: File | null;
  /** Ошибка формата/размера, обнаруженная в момент выбора. */
  fileError: string | null;
  selectFile: (file: File) => void;
  removeFile: () => void;
  /** Материал, созданный до сбоя загрузки — форма показывает его страницей
   * вместо страницы нового материала: второе «Сохранить» его правит, не
   * заводит дубль (ADR-0133). */
  createdMaterial: MaterialDto | null;
  /** Обновляет запомненный материал после действия с файлом уже созданной
   * записи (MaterialFileField.tsx, если материал в этом состоянии) —
   * странице нового материала неоткуда взять маршрут с id, перечитать
   * материал отдельным GET ей нечем, источник свежих данных — ответ записи. */
  setCreatedMaterial: (material: MaterialDto) => void;
  /** Обёртка над create() редактора: создаёт материал, затем, если файл
   * выбран, отправляет его. Сбой второго шага не откатывает первый. */
  create: (input: CreateMaterialInput) => Promise<MaterialDto>;
}

export function useNewMaterialFile(
  onCreate: (input: CreateMaterialInput) => Promise<MaterialDto>,
): UseNewMaterialFileResult {
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [createdMaterial, setCreatedMaterial] = useState<MaterialDto | null>(null);

  function selectFile(selected: File): void {
    // Негодный формат/размер не должен приводить ни к созданию материала, ни
    // к попытке его тут же загрузить — ошибка встаёт сразу при выборе.
    const checkError = checkMaterialFile(selected);
    setFileError(checkError);
    setFile(checkError ? null : selected);
  }

  function removeFile(): void {
    setFile(null);
    setFileError(null);
  }

  async function create(input: CreateMaterialInput): Promise<MaterialDto> {
    const created = await onCreate(input);
    if (!file) return created;
    try {
      await uploadMaterialFile(created.id, file);
      setFile(null);
      return created;
    } catch {
      // Материал уже существует — вторая попытка (клик по «Сохранить» ещё
      // раз) обязана его править, а не заводить дубль (ADR-0133).
      setCreatedMaterial(created);
      throw new ApiError(UPLOAD_AFTER_CREATE_ERROR_MESSAGE, 0, 'unknown');
    }
  }

  return {
    file,
    fileError,
    selectFile,
    removeFile,
    createdMaterial,
    setCreatedMaterial,
    create,
  };
}
