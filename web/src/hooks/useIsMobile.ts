// Переключатель список/сетка расписания на 768px (CLAUDE.md «Мобильный экран
// первым»): matchMedia — без слушателя на каждый пиксель resize, как у
// window.innerWidth-подхода.
import { useEffect, useState } from 'react';

const DEFAULT_BREAKPOINT_PX = 768;

export function useIsMobile(breakpointPx = DEFAULT_BREAKPOINT_PX): boolean {
  const query = `(max-width: ${breakpointPx - 1}px)`;
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const mql = window.matchMedia(query);
    const handleChange = (event: MediaQueryListEvent) => setIsMobile(event.matches);
    setIsMobile(mql.matches);
    mql.addEventListener('change', handleChange);
    return () => mql.removeEventListener('change', handleChange);
  }, [query]);

  return isMobile;
}
