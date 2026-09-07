// Текст результата «Проверить» — по VOICE.md: конкретика, что случилось, без
// точки в конце (короткая подпись интерфейса, ревью п.13).
import type { ChannelTestResult } from '@xuanxue/shared';

export function formatChannelTestResult(result: ChannelTestResult): string {
  if (result.status === 'sent') return 'Тест доставлен';
  if (result.status === 'manual') {
    return 'Ручной канал — отправьте тестовый пост сами';
  }
  return result.error ? `Не доставлен: ${result.error}` : 'Не доставлен';
}
