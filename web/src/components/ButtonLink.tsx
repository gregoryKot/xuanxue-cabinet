// Ссылка с силуэтом кнопки: переход на другой экран («Выбрать занятия» в
// подсказке ленты). `<a>`, а не `<Button>` с `navigate()`: так работают
// «открыть в новой вкладке», долгое нажатие и скринридер, который называет это
// ссылкой, а не действием. Силуэт общий с Button.tsx (`buttonSurfaceStyle`) —
// цель ≥44×44 и заливка терракотой берутся оттуда, а не пишутся второй раз
// (CLAUDE.md «Одна механика — один компонент»).
import { Link, type LinkProps } from 'react-router-dom';
import { buttonSurfaceStyle, type ButtonVariant } from './Button';

interface ButtonLinkProps extends LinkProps {
  variant?: ButtonVariant;
}

export function ButtonLink({ variant = 'primary', style, ...rest }: ButtonLinkProps) {
  return (
    <Link
      style={{ ...buttonSurfaceStyle(variant), textDecoration: 'none', ...style }}
      {...rest}
    />
  );
}
