// Раздел юридической страницы, текст которого зависит от способа связи,
// указанного школой (GET /auth/config, ADR-0155): «Кто отвечает за данные» на
// `/privacy` и «Как сообщить о проблеме» на `/accessibility`. Загрузка,
// скелетон и запасной текст — одна механика на обе страницы; сами слова даёт
// `buildParagraphs`. Заголовок один и тот же в обоих состояниях: под ним
// меняется только тело (скелетон → абзацы), иначе при загрузке настроек
// заголовок пересоздавался бы, а остальной текст страницы уже читается.
import { useAuthConfig } from '../auth/useAuthConfig';
import { SkeletonLines } from '../components/Skeleton';
import { LegalBlock, LegalParagraphs } from './LegalPage';
import type { SchoolContact } from './schoolContact';

interface SchoolContactSectionProps {
  title: string;
  /** `null` — настройки не загрузились: страница остаётся читаемой и
   * отправляет к учителю, а не выдумывает имя. */
  buildParagraphs: (contact: SchoolContact | null) => string[];
}

export function SchoolContactSection({
  title,
  buildParagraphs,
}: SchoolContactSectionProps) {
  const { config, status } = useAuthConfig();

  return (
    <LegalBlock title={title}>
      {status === 'loading' ? (
        <SkeletonLines widths={['80%', '55%']} />
      ) : (
        <LegalParagraphs paragraphs={buildParagraphs(status === 'ok' ? config : null)} />
      )}
    </LegalBlock>
  );
}
