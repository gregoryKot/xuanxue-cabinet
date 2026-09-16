// Страница-редактор, пока она ещё грузится: скелетон, потом баннер ошибки с
// повтором, и только потом — содержимое (ADR-0033). Содержимое приходит
// функцией, а не готовым узлом: форма заводит своё состояние один раз при
// монтировании (useEntityForm), и собрать её на пустой сущности, а потом
// дождаться настоящей — значит показать чужие поля.
//
// Один компонент на редактор экзамена и редактор вопроса: три ветки загрузки
// в двух файлах jscpd ловит как дубль (CLAUDE.md «Одна механика — один
// компонент»).
import type { ReactNode } from 'react';
import { LoadErrorBanner } from './LoadErrorBanner';
import { screenSectionStyle } from './screenLayout';
import { SkeletonLines } from './Skeleton';

interface LoadedPageProps {
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  /** Ширины строк скелетона — по форме будущего содержимого. */
  skeletonWidths: string[];
  children: () => ReactNode;
}

export function LoadedPage({
  loading,
  error,
  onRetry,
  skeletonWidths,
  children,
}: LoadedPageProps) {
  if (loading) {
    return (
      <section style={screenSectionStyle}>
        <SkeletonLines widths={skeletonWidths} />
      </section>
    );
  }

  if (error) {
    return (
      <section style={screenSectionStyle}>
        <LoadErrorBanner message={error} onRetry={onRetry} />
      </section>
    );
  }

  return <>{children()}</>;
}
