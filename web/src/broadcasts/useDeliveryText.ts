// Текст ручной доставки — не приходит со списком (`GET /deliveries` и
// `GET /broadcasts/:id/deliveries` его никогда не отдают, только
// `GET /deliveries/:id`, pr-k3-fixes.md п.3): «ручная ли» решает
// `channelsById.get(channelId)?.type === 'manual'`, а не наличие `text`.
// Догружаем один раз, при первом раскрытии карточки или клике
// «Скопировать» — DeliveryCard.tsx зовёт `ensureLoaded()` из обоих мест.
import { useRef, useState } from 'react';
import type { DeliveryDto } from '@xuanxue/shared';
import { ApiError, apiFetch } from '../api/http';

const LOAD_ERROR_MESSAGE = 'Не удалось загрузить текст доставки. Попробуйте ещё раз.';

export interface UseDeliveryTextResult {
  text: string | undefined;
  loading: boolean;
  error: string | null;
  /** Возвращает текст: уже загруженный или только что догруженный —
   * DeliveryCard передаёт результат сразу в copy(), не дожидаясь ререндера. */
  ensureLoaded: () => Promise<string | undefined>;
}

export function useDeliveryText(deliveryId: string): UseDeliveryTextResult {
  const [text, setText] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedRef = useRef(false);

  async function ensureLoaded(): Promise<string | undefined> {
    if (loadedRef.current) return text;
    setLoading(true);
    setError(null);
    try {
      const dto = await apiFetch<DeliveryDto>(`/deliveries/${deliveryId}`);
      loadedRef.current = true;
      setText(dto.text);
      return dto.text;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : LOAD_ERROR_MESSAGE);
      return undefined;
    } finally {
      setLoading(false);
    }
  }

  return { text, loading, error, ensureLoaded };
}
