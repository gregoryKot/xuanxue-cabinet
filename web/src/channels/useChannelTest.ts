// «Проверить» на карточке канала — состояние одной кнопки, отдельное от
// списка (useChannels): у каждой карточки свой результат теста, список его
// не хранит и не перечитывает (POST /channels/:id/test ничего не меняет).
// `updatedAt` — результат прошлого теста сбрасывается при правке канала
// (новый config мог всё изменить), а не остаётся висеть под старым (ревью п.16).
import { useEffect, useState } from 'react';
import type { ChannelTestResult } from '@xuanxue/shared';
import { ApiError, apiFetch } from '../api/http';

const TEST_ERROR_MESSAGE = 'Не удалось проверить канал. Попробуйте ещё раз.';

export interface UseChannelTestResult {
  pending: boolean;
  result: ChannelTestResult | null;
  error: string | null;
  test: () => Promise<void>;
}

export function useChannelTest(
  channelId: string,
  updatedAt?: string,
): UseChannelTestResult {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ChannelTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setResult(null);
    setError(null);
  }, [updatedAt]);

  async function test() {
    setPending(true);
    setError(null);
    try {
      const res = await apiFetch<ChannelTestResult>(`/channels/${channelId}/test`, {
        method: 'POST',
      });
      setResult(res);
    } catch (err) {
      setResult(null);
      setError(err instanceof ApiError ? err.message : TEST_ERROR_MESSAGE);
    } finally {
      setPending(false);
    }
  }

  return { pending, result, error, test };
}
