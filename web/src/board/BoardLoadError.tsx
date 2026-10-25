// Сбой загрузки одного источника главной: текст и «Обновить» для него одного
// (ADR-0178). Остальные плитки живут. Подпись «Обновить» одна на обе главных —
// константа здесь, а не шесть копий (CLAUDE.md «Повторяющийся текст»).
import { LoadErrorBanner } from '../components/LoadErrorBanner';

const RETRY_LABEL = 'Обновить';

interface BoardLoadErrorProps {
  message: string;
  onRetry: () => void;
}

export function BoardLoadError({ message, onRetry }: BoardLoadErrorProps) {
  return <LoadErrorBanner message={message} onRetry={onRetry} retryLabel={RETRY_LABEL} />;
}
