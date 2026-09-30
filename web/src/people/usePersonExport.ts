// Выгрузка данных одного человека файлом (ADR-0160): запрос по карте
// маршрутов, файл собирает браузер (lib/downloadJson.ts). Имя файла несёт
// дату из ответа сервера и хвост id — имени человека в нём нет, а два файла
// за один день не сливаются в один: отправить не тому человеку чужие данные
// хуже, чем задержаться на лишнюю секунду.
import { useCallback, useState } from 'react';
import { ApiError } from '../api/http';
import { apiRoute } from '../api/apiRoute';
import { downloadJson } from '../lib/downloadJson';

const EXPORT_ERROR_MESSAGE = 'Не удалось выгрузить данные. Попробуйте ещё раз.';
const DATE_LENGTH = 'ГГГГ-ММ-ДД'.length;
const ID_TAIL_LENGTH = 6;

function exportFileName(exportedAt: string, personId: string): string {
  const date = exportedAt.slice(0, DATE_LENGTH);
  return `xuanxue-data-${date}-${personId.slice(-ID_TAIL_LENGTH)}.json`;
}

export interface UsePersonExportResult {
  pending: boolean;
  error: string | null;
  exportData: () => Promise<void>;
}

export function usePersonExport(personId: string): UsePersonExportResult {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exportData = useCallback(async () => {
    setPending(true);
    setError(null);
    try {
      const data = await apiRoute('GET /users/:id/export', { params: { id: personId } });
      downloadJson(data, exportFileName(data.exportedAt, personId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : EXPORT_ERROR_MESSAGE);
    } finally {
      setPending(false);
    }
  }, [personId]);

  return { pending, error, exportData };
}
