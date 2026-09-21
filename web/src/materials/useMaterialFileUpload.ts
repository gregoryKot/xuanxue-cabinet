// Загрузка/замена/удаление файла материала (ADR-0057, слой 3.10) — по
// образцу exam-items/useExamImageUpload.ts: сеть только через apiFetch,
// логика вне компонента (CLAUDE.md «Логика вне контроллеров и
// компонентов»). Формат и размер проверяются до похода в сеть — с чужим
// Content-Type сервер даже не включит разбор сырого тела (браузер ставит
// его из файла), и человек увидел бы невнятную ошибку вместо понятной.
import { useState } from 'react';
import {
  MATERIAL_FILE_CONTENT_TYPES,
  MATERIAL_FILE_EMPTY_MESSAGE,
  MATERIAL_FILE_LIMITS,
  MATERIAL_FILE_TOO_LARGE_MESSAGE,
  MATERIAL_FILE_UNSUPPORTED_MESSAGE,
  type MaterialDto,
  type MaterialFileContentType,
} from '@xuanxue/shared';
import { materialFilePath, materialFileUploadPath } from '../api/apiPaths';
import { apiFetch } from '../api/http';

// И сетевой ApiError, и собственная проверка ниже несут готовый текст по
// VOICE — этот запасной только на непредвиденное исключение, которое ни
// один из них не бросает сейчас.
const UPLOAD_ERROR_MESSAGE = 'Не удалось загрузить файл. Попробуйте ещё раз.';
// Самое длинное расширение среди принимаемых форматов (application/pdf →
// «.pdf», image/jpeg → «.jpeg», Word → «.docx») плюс запас — точка дальше в
// имени файла уже не расширение, а часть названия, обрезать по ней не нужно.
const MAX_EXTENSION_LENGTH = 6;

function isSupportedContentType(type: string): type is MaterialFileContentType {
  return (MATERIAL_FILE_CONTENT_TYPES as readonly string[]).includes(type);
}

/** Обрезает длинное имя файла, сохраняя расширение — сервер отверг бы длинное
 * имя целиком (400 на `MATERIAL_FILE_LIMITS.name`), а терять из-за этого уже
 * выбранный и провалидированный файл незачем (в отличие от формата и
 * размера, это не повод отказать). */
function truncateFileName(name: string): string {
  if (name.length <= MATERIAL_FILE_LIMITS.name) return name;
  const dotIndex = name.lastIndexOf('.');
  const extensionLength = name.length - dotIndex;
  const hasExtension = dotIndex > 0 && extensionLength <= MAX_EXTENSION_LENGTH;
  const extension = hasExtension ? name.slice(dotIndex) : '';
  return `${name.slice(0, MATERIAL_FILE_LIMITS.name - extension.length)}${extension}`;
}

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
    if (!isSupportedContentType(file.type)) {
      setError(MATERIAL_FILE_UNSUPPORTED_MESSAGE);
      return null;
    }
    if (file.size > MATERIAL_FILE_LIMITS.maxBytes) {
      setError(MATERIAL_FILE_TOO_LARGE_MESSAGE);
      return null;
    }
    if (file.size === 0) {
      setError(MATERIAL_FILE_EMPTY_MESSAGE);
      return null;
    }
    setPending(true);
    try {
      const path = materialFileUploadPath(materialId, truncateFileName(file.name));
      return await apiFetch<MaterialDto>(path, { method: 'POST', body: file });
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
