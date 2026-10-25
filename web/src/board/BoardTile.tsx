// Плитка главной (ADR-0178): карточка с тонким контуром `--line-soft`, как у
// SectionLink, без тени, с собственным заголовком внутри и содержимым ниже.
// Рубрик-заголовков над блоками на главной нет — у плитки заголовок свой, так
// экран короче по высоте, и каждая плитка отвечает на вопрос «что это» сама.
// Один компонент на все плитки обеих главных (CLAUDE.md «Одна механика — один
// компонент»): раньше три копии рубрики с отступами ловил бы jscpd.
//
// Два вида. Обычная плитка — `<section>` с заголовком и необязательной
// ссылкой «Все …» справа от него (`more`): вход в раздел лежит внутри плитки
// и пропадает вместе с ней, когда показывать нечего. Плитка-ссылка (`to`) —
// вся целиком ведёт на страницу, как карточка события у учителя; ссылки
// внутри такой плитки нет (ссылка в ссылке — невалидный HTML).
// Заголовок — `<h2>`: на экране один `<h1>`, у самой «Главной».
import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { textLinkHitAreaStyle, textLinkLineStyle } from '../components/screenLayout';

const boardTileStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  padding: '14px 16px',
  borderRadius: 'var(--radius-block)',
  border: '1px solid var(--line-soft)',
  color: 'inherit',
  textDecoration: 'none',
};
const headerStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  columnGap: 12,
};
// Тот же кегль и вес, что у заголовка SectionLink: плитки и карточки-входы
// стоят на одном экране штата рядом.
const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 15,
  fontWeight: 500,
  color: 'var(--ink)',
  overflowWrap: 'anywhere',
};
// Цель нажатия 44 набирается отступом, а отрицательное поле возвращает
// строке заголовка её высоту: ссылка не раздувает плитку по вертикали.
const moreLinkStyle: CSSProperties = {
  ...textLinkHitAreaStyle,
  margin: '-10px 0',
  fontSize: 13,
};

interface BoardTileMore {
  to: string;
  label: string;
}

type BoardTileProps = {
  title: string;
  children?: ReactNode;
} & ({ to: string; more?: never } | { more?: BoardTileMore; to?: never });

export function BoardTile({ title, children, to, more }: BoardTileProps) {
  const heading = <h2 style={titleStyle}>{title}</h2>;

  if (to !== undefined) {
    return (
      <Link to={to} style={boardTileStyle}>
        {heading}
        {children}
      </Link>
    );
  }

  return (
    <section style={boardTileStyle}>
      <div style={headerStyle}>
        {heading}
        {more && (
          <Link to={more.to} style={moreLinkStyle}>
            <span style={textLinkLineStyle}>{more.label}</span>
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}
