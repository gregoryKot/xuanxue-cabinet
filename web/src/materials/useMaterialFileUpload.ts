// Загрузка/замена/удаление файла УЖЕ СОЗДАННОГО материала (ADR-0057, слой
// 3.10) — хук держит только состояние (pending, error); сама проверка файла
// и запрос загрузки — общие с useNewMaterialFile.ts функции
// materialFileUpload.ts (ADR-0133: там файл проверяют и отправляют для
// материала, у которого до этого id ещё не было).
import { useState } from 'react';
import type { MaterialDto } from '@xuanxue/shared';
import { materialFilePath } from '../api/apiPaths';
import { apiFetch } from '../api/http';
import { checkMaterialFile, uploadMaterialFile } from './materialFileUpload';

// И сетевой ApiError, и собственная проверка ниже несут готовый текст по
// VOICE — этот запасной только на непредвиденное исключение, которое ни
// один из них не бросает сейчас.
const UPLOAD_ERROR_MESSAGE = 'Не удалось загрузить файл. Попробуйте ещё раз.';

export interface UseMaterialFileUploadResult {
  /** `null` — не удалось: `error` уже заполнен, материал остаётся как был. */
  upload: (file: File) => Promise<MaterialDto | null>;
  remove: () => Promise<MaterialDto | null>;
  pending: boolean;
  error: string | null;
}

export function useMaterialFileUpload(materialId: string): UseMaterialFileUploadResult {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File): Promise<MaterialDto | null> {
    setError(null);
    const checkError = checkMaterialFile(file);
    if (checkError) {
      setError(checkError);
      return null;
    }
    setPending(true);
    try {
      return await uploadMaterialFile(materialId, file);
    } catch (err) {
      setError(err instanceof Error ? err.message : UPLOAD_ERROR_MESSAGE);
      return null;
    } finally {
      setPending(false);
    }
  }

  async function remove(): Promise<MaterialDto | null> {
    setError(null);
    setPending(true);
    try {
      return await apiFetch<MaterialDto>(materialFilePath(materialId), {
        method: 'DELETE',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : UPLOAD_ERROR_MESSAGE);
      return null;
    } finally {
      setPending(false);
    }
  }

  return { upload, remove, pending, error };
}
