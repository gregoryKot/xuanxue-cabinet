// Навигация в двух видах (отзыв владельца 2026-09-09): на телефоне —
// нижняя панель, на широком экране — колонка слева. Плюс фильтр по роли,
// подсветка активного раздела (docs/adr/0025-navigation-by-domain.md) и
// блок человека внизу колонки (ADR-0043).
import type { ReactNode } from 'react';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { MeDto } from '@xuanxue/shared';
import { AppNav, SIDE_NAV_WIDTH_PX } from './AppNav';
import { STAFF_NAV_ITEMS, STUDENT_NAV_ITEMS } from './navItems';
import { rootPathFor } from './screenAccess';

const TEACHER: MeDto = {
  id: 'u1',
  name: 'Дима',
  roles: ['teacher'],
  status: 'active',
  telegramLinked: false,
  botChatActive: false,
  noTelegram: false,
  hasEmail: true,
  needsProfile: false,
};
const ADMIN: MeDto = {
  id: 'a1',
  name: 'Маша',
  roles: ['admin'],
  status: 'active',
  telegramLinked: false,
  botChatActive: false,
  noTelegram: false,
  hasEmail: true,
  needsProfile: false,
};

function renderNav(
  isMobile: boolean,
  me: MeDto | null = TEACHER,
  path = '/planning',
  personProps: {
    profileLink?: ReactNode;
    logoutButton?: ReactNode;
  } = {},
) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppNav isMobile={isMobile} me={me} {...personProps} />
    </MemoryRouter>,
  );
}

/** «3px» → 3. Числа в гейтах высоты берём из отрисованных стилей, а не из
 * констант bottomNavStyles.ts: копия константы в тесте проверяла бы сама себя. */
function px(value: string | undefined): number {
  return Number.parseFloat(value ?? '0');
}

describe('AppNav — раскладка', () => {
  // Проверяем ширину и направление, а не рамку: значения через `var(--…)`
  // jsdom не вычисляет, и сравнение стилей на них всегда ложно-отрицательное.
  it('телефон — панель во всю ширину, без боковой колонки', () => {
    renderNav(true);

    const nav = screen.getByRole('navigation', { name: 'Разделы кабинета' });
    expect(nav.style.width).toBe('');
    expect(nav.style.flexDirection).toBe('');
  });

  it('широкий экран — колонка слева фиксированной ширины', () => {
    renderNav(false);

    // Ширину несёт сама колонка, а `<nav>` внутри неё — только пункты
    // (знак школы и блок человека лежат рядом, вне ориентира).
    const column = screen.getByRole('navigation', {
      name: 'Разделы кабинета',
    }).parentElement;
    expect(column?.style.width).toBe(`${SIDE_NAV_WIDTH_PX}px`);
    expect(column?.style.flexDirection).toBe('column');
  });

  // Панель сперва уезжала вверх вместе со списком (отзыв владельца
  // 2026-09-10), а вылеченная через `sticky` — прыгала на оттяжке iOS: там
  // инерция двигает весь документ разом (отзыв 2026-09-18). Теперь она вне
  // прокрутки вовсе — низ колонки оболочки, высота которой равна экрану
  // (AppShell.tsx). Гейт от возврата к `sticky`/`fixed`.
  it('телефон — панель вне прокрутки, без sticky и fixed', () => {
    renderNav(true);

    const nav = screen.getByRole('navigation', { name: 'Разделы кабинета' });
    expect(nav.style.position).toBe('');
    expect(nav.style.flexShrink).toBe('0');
  });
});

describe('AppNav — пункты и роль (отзыв владельца 2026-09-12, уточнение ADR-0030)', () => {
  // Решение владельца: у ученика два своих экрана — не подмножество меню
  // штата, отфильтрованное по роли, а отдельный список (navItems.ts).
  // Состав панели читаем с видимых подписей (ADR-0103): на телефоне имя
  // раздела снова стоит словом под значком.
  it('ученик без роли — два своих экрана, не пункты штата', () => {
    const student: MeDto = { ...TEACHER, roles: [] };
    renderNav(true, student);

    const labels = screen.getAllByRole('link').map((link) => link.textContent);
    expect(labels).toEqual(['Задания', 'Занятия']);
  });

  it('админ — пять пунктов, «Материалы» последним', () => {
    renderNav(true, ADMIN);

    const labels = screen.getAllByRole('link').map((link) => link.textContent);
    expect(labels).toEqual(['Занятия', 'Рассылки', 'Экзамены', 'Ученики', 'Материалы']);
  });

  // ADR-0030 (уточнение владельца 2026-09-15): ссылку-приглашение раздаёт и
  // учитель — «Ученики» открыт ему тоже, не только admin.
  it('учитель — тоже видит «Ученики» (ADR-0030, ссылка-приглашение)', () => {
    renderNav(true, TEACHER);

    const labels = screen.getAllByRole('link').map((link) => link.textContent);
    expect(labels).toEqual(['Занятия', 'Рассылки', 'Экзамены', 'Ученики', 'Материалы']);
  });

  // ADR-0103 (заменил ADR-0097): на телефоне имя раздела снова видно — словом
  // под значком, и оно же даёт ссылке доступное имя, поэтому `aria-label` у
  // неё нет: два имени одного пункта разъехались бы при первой правке одного
  // из них. Значок внутри плашки — decorative-only (`aria-hidden`), иначе
  // раздел назывался бы дважды. В боковой колонке подпись текстом была и
  // осталась — её эта правка не трогает.
  it('телефон — подпись словом под значком, значок decorative-only; колонка — подпись текстом', () => {
    const { unmount } = renderNav(true);
    const link = screen.getByRole('link', { name: 'Занятия' });
    expect(link.textContent).toBe('Занятия');
    expect(link).not.toHaveAttribute('aria-label');
    const svg = link.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    unmount();

    renderNav(false);
    expect(screen.getByText('Занятия')).toBeInTheDocument();
  });
});

describe('AppNav — подсветка раздела', () => {
  it('открыт сам раздел — его ссылка активна', () => {
    renderNav(true, TEACHER, '/broadcasts');

    expect(screen.getByRole('link', { name: /Рассылки/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: /Занятия/ })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('открыт подэкран раздела — подсвечен сам раздел, не подэкран', () => {
    renderNav(true, TEACHER, '/channels');

    expect(screen.getByRole('link', { name: /Рассылки/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('путь вне навигации — ни один пункт не подсвечен', () => {
    renderNav(true, TEACHER, '/login');

    for (const link of screen.getAllByRole('link')) {
      expect(link).not.toHaveAttribute('aria-current');
    }
  });

  // Направление «Тёплая школа» (ADR-0043) сняло киноварную точку «вы
  // здесь» — активность теперь только заливка и тень (jsdom их не считает,
  // см. «раскладка» выше), а на разметке проверяем, что старой точки не
  // осталось нигде: механика заменена, не задублирована.
  it('старой точки-маркера в разметке больше нет — ни у активного, ни у остальных', () => {
    renderNav(true, TEACHER, '/broadcasts');

    const active = screen.getByRole('link', { name: /Рассылки/ });
    expect(active).toHaveAttribute('aria-current', 'page');
    expect(active.querySelector('.xuanxue-nav-dot')).toBeNull();

    const inactive = screen.getByRole('link', { name: /Занятия/ });
    expect(inactive.querySelector('.xuanxue-nav-dot')).toBeNull();
  });
});

// Отзыв владельца: `minHeight: 44` (цель нажатия) стояла прямо на видимой
// плашке и раздула её заметно крупнее макета (~34px). Цель нажатия остаётся
// на `<Link>` (невидимая), плашку макета несёт внутренний `<span>` —
// pillBaseStyle (people/PersonRoleBadge.tsx) сделан тем же приёмом.
describe('AppNav — цель нажатия и плашка нижней панели разведены', () => {
  it('плашка — внутренний <span> без своей минимальной высоты, у <Link> нет фона', () => {
    renderNav(true, TEACHER, '/planning');

    const active = screen.getByRole('link', { name: 'Занятия' });
    expect(active.style.minHeight).toBe('44px');
    expect(active.style.background).toBe('');

    const pill = active.querySelector('span') as HTMLElement;
    expect(pill).not.toBeNull();
    expect(pill.style.minHeight).toBe('');
    const svg = pill.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('AppNav — знак школы (ADR-0043)', () => {
  it('в боковой колонке — знак и название видны', () => {
    renderNav(false);
    expect(screen.getByText('Школа Сюань-Сюэ')).toBeInTheDocument();
  });

  // Мокап (screens/1c-planning.html) не рисует знак в панели вкладок —
  // на телефоне его показывает AppShell.tsx, первой строкой над содержимым.
  it('в панели вкладок телефона — знака нет, это забота AppShell.tsx', () => {
    renderNav(true);
    expect(screen.queryByText('Школа Сюань-Сюэ')).not.toBeInTheDocument();
  });

  // Знак — ссылка на главную (SchoolBrandLink.tsx), а «главная» у штата и у
  // ученика разная: адрес считает общее правило rootPathFor (screenAccess.ts),
  // то же самое, которым AppShell.tsx уводит с чужого маршрута.
  it('у штата знак ведёт на корень штата', () => {
    renderNav(false, TEACHER);

    expect(screen.getByRole('link', { name: 'Школа Сюань-Сюэ' })).toHaveAttribute(
      'href',
      rootPathFor(TEACHER),
    );
  });

  it('у ученика знак ведёт на корень ученика', () => {
    const student: MeDto = { ...TEACHER, roles: [] };
    renderNav(false, student);

    expect(screen.getByRole('link', { name: 'Школа Сюань-Сюэ' })).toHaveAttribute(
      'href',
      rootPathFor(student),
    );
  });
});

describe('AppNav — блок человека (боковая колонка, ADR-0043)', () => {
  // Ровно то, чего боялся владелец при переносе подвала в колонку: имя,
  // «Профиль» и «Выйти» должны остаться доступны, просто в другом месте.
  it('на широком экране — переданные «Профиль» и «Выйти» видны внизу колонки', () => {
    renderNav(false, TEACHER, '/planning', {
      profileLink: <a href="/profile">Профиль</a>,
      logoutButton: <button type="button">Выйти</button>,
    });

    const nav = screen.getByRole('navigation', { name: 'Разделы кабинета' });
    const column = nav.parentElement as HTMLElement;

    expect(within(column).getByText(/Вы вошли как Дима/)).toBeInTheDocument();
    expect(within(column).getByRole('link', { name: 'Профиль' })).toBeInTheDocument();
    expect(within(column).getByRole('button', { name: 'Выйти' })).toBeInTheDocument();

    // Блок человека стоит РЯДОМ с ориентиром, не внутри него: имя «Разделы
    // кабинета» обязано покрывать только разделы, иначе скринридер, идущий по
    // ориентирам, найдёт под ним ещё и «Выйти» (CLAUDE.md «Доступность»).
    expect(within(nav).queryByRole('button', { name: 'Выйти' })).not.toBeInTheDocument();
    expect(within(nav).queryByText(/Вы вошли как/)).not.toBeInTheDocument();
  });

  // Мокап телефона такой блок не рисует вовсе — эту роль на телефоне играет
  // подвал AppShell.tsx, а не эта колонка (её на телефоне и не видно).
  it('на телефоне блок человека не рисуется, даже если узлы переданы', () => {
    renderNav(true, TEACHER, '/planning', {
      profileLink: <a href="/profile">Профиль</a>,
      logoutButton: <button type="button">Выйти</button>,
    });

    expect(screen.queryByText(/Вы вошли как/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Профиль' })).not.toBeInTheDocument();
  });
});

// Правка 2026-09-21 (отзыв владельца, ADR-0063): колокольчик стоял отдельным
// пунктом перед разделами и спорил с ними весом. Его место — правый верхний
// угол содержимого (AppShell.test.tsx), колонка про него больше не знает.
describe('AppNav — колокольчика в колонке нет (ADR-0063)', () => {
  it('в колонке только разделы, знак школы и блок человека', () => {
    renderNav(false, TEACHER, '/planning', {
      profileLink: <a href="/profile">Профиль</a>,
      logoutButton: <button type="button">Выйти</button>,
    });

    expect(screen.queryByRole('link', { name: /Уведомления/ })).not.toBeInTheDocument();
  });
});

// Отзыв владельца 2026-09-19: «Школа Сюань-Сюэ» переносилось на две строки в
// колонке 236px. Начертание и замер (139px строка, 158px доступно) теперь
// одно на все точки входа — components/SchoolMark.tsx, SchoolWordmark. Гейт
// от возврата кегля.
describe('AppNav — название школы в колонке не переносится', () => {
  it('заголовок в одну строку, с подрезкой на случай подстановочного шрифта', () => {
    renderNav(false);

    const title = screen.getByText('Школа Сюань-Сюэ');
    expect(title.style.whiteSpace).toBe('nowrap');
    expect(title.style.textOverflow).toBe('ellipsis');
    expect(title.style.fontSize).toBe('15px');
  });
});

// ADR-0055 «Последствия»: «Ширина проверяется тестом AppNav.test.tsx и
// вручную на 360 px — это условие мержа, а не пожелание». Гейтов кегля и
// потолка длины подписи в знаках здесь больше нет: подпись вернулась в панель
// (ADR-0103) вместе с подрезкой, которая и держит слово внутри дорожки, а
// потолок в знаках был прикидкой, на которую ADR-0055 сам велел не полагаться.
// Число дорожек сетки от состава подписи не зависит и остаётся.
describe('AppNav — гейт ширины нижней панели (ADR-0055)', () => {
  // Дорожек сетки должно быть ровно столько, сколько отрисованных пунктов
  // (bottomStyle(items.length), bottomNavStyles.ts) — иначе лишний пункт
  // уезжает на вторую строку сетки, и высота панели (4 + 44 + 4 = 52 плюс
  // безопасная зона, расчёт в bottomNavStyles.ts) рвётся.
  it('дорожек ровно по числу пунктов — пять у штата, две у ученика, четыре у ассистента', () => {
    const teacher = renderNav(true, TEACHER);
    expect(
      screen.getByRole('navigation', { name: 'Разделы кабинета' }).style
        .gridTemplateColumns,
    ).toBe('repeat(5, 1fr)');
    teacher.unmount();

    const admin = renderNav(true, ADMIN);
    expect(
      screen.getByRole('navigation', { name: 'Разделы кабинета' }).style
        .gridTemplateColumns,
    ).toBe('repeat(5, 1fr)');
    admin.unmount();

    const student: MeDto = { ...TEACHER, roles: [] };
    const studentRender = renderNav(true, student);
    expect(
      screen.getByRole('navigation', { name: 'Разделы кабинета' }).style
        .gridTemplateColumns,
    ).toBe('repeat(2, 1fr)');
    studentRender.unmount();

    // Ассистенту «Ученики» не виден (у пункта roles: admin/teacher) — из
    // пяти пунктов штата у него остаётся четыре.
    const assistant: MeDto = { ...TEACHER, roles: ['assistant'] };
    renderNav(true, assistant);
    expect(
      screen.getByRole('navigation', { name: 'Разделы кабинета' }).style
        .gridTemplateColumns,
    ).toBe('repeat(4, 1fr)');
  });
});

// Отзыв владельца 2026-09-22 (снимок «Заданий» с телефона): «белый низ с
// коричневатыми кнопками вижу багом». Панель стояла на белой --card, а плашка
// активного пункта — на тёплой константе; на остальной странице белых
// поверхностей нет, и плашка читалась коричневым пятном. Регрессия —
// ADR-0110: панель стоит на той же бумаге, что страница, плашка активного
// пункта — на тихой подложке `--panel`, у неактивного пункта заливки нет.
describe('AppNav — нижняя панель на бумаге страницы, не на белой карточке (ADR-0110)', () => {
  it('фон панели — бумага, плашка активного пункта — тихая подложка, у неактивного — прозрачная', () => {
    renderNav(true, TEACHER, '/planning');

    const nav = screen.getByRole('navigation', { name: 'Разделы кабинета' });
    expect(nav.style.background).toBe('var(--paper)');

    const active = screen.getByRole('link', { name: 'Занятия' });
    const activePill = active.querySelector('span') as HTMLElement;
    expect(activePill.style.background).toBe('var(--panel)');

    const inactive = screen.getByRole('link', { name: 'Рассылки' });
    const inactivePill = inactive.querySelector('span') as HTMLElement;
    expect(inactivePill.style.background).toBe('transparent');
  });
});

// ADR-0103, «Последствия»: «AppNav.test.tsx — у каждой вкладки телефона
// подпись словом под значком, цель нажатия 44 px, столбец значка с подписью не
// выше этой цели, подпись подрезается многоточием».
describe('AppNav — вкладки телефона называют себя и держат цель нажатия (ADR-0103)', () => {
  it('у каждой вкладки подпись равна имени раздела штата, цель нажатия — 44px', () => {
    renderNav(true, ADMIN);

    for (const { label } of STAFF_NAV_ITEMS) {
      const link = screen.getByRole('link', { name: label });
      expect(link.textContent).toBe(label);
      expect(link.style.minHeight).toBe('44px');
    }
  });

  it('у ученика — то же самое на его двух вкладках', () => {
    const student: MeDto = { ...TEACHER, roles: [] };
    renderNav(true, student);

    for (const { label } of STUDENT_NAV_ITEMS) {
      const link = screen.getByRole('link', { name: label });
      expect(link.textContent).toBe(label);
      expect(link.style.minHeight).toBe('44px');
    }
  });

  // Подпись вернулась ВНУТРЬ цели нажатия, а не поверх неё: перерасти столбец
  // «отступ + значок + промежуток + строка подписи + отступ» 44px — и панель
  // станет выше родной вкладочной панели iOS, ради которой считались отступы
  // (bottomNavStyles.ts, расчёт 3 + 22 + 2 + 11 + 3 = 41). Складываем не
  // константы из файла стилей, а то, что реально отрисовано: числа из inline-
  // стилей и высоту значка из самого svg — тогда гейт видит и правку кегля, и
  // правку размера значка в NavIcon.tsx.
  it('столбец «значок и подпись» не выше цели нажатия 44px', () => {
    renderNav(true, ADMIN);

    const link = screen.getByRole('link', { name: 'Материалы' });
    const pill = link.querySelector('span');
    expect(pill).not.toBeNull();
    const svg = link.querySelector('svg');
    const iconHeightPx = Number(svg?.getAttribute('height') ?? 0);
    expect(iconHeightPx).toBeGreaterThan(0);

    const label = screen.getByText('Материалы');
    const lineHeightPx = px(label.style.fontSize) * Number(label.style.lineHeight);
    const columnPx =
      2 * px(pill?.style.paddingTop) +
      iconHeightPx +
      px(pill?.style.gap) +
      Math.ceil(lineHeightPx);

    expect(columnPx).toBeLessThanOrEqual(px(link.style.minHeight));
  });

  // Ширину подписи меряет только браузер (урок ADR-0055), поэтому здесь — не
  // замер, а страховка: слово, которое не поместилось в свою дорожку,
  // подрезается многоточием и не раздвигает панель до горизонтального скролла.
  it('подпись подрезается в своей дорожке, а не растягивает её', () => {
    renderNav(true, ADMIN);

    const label = screen.getByText('Материалы');
    expect(label.style.whiteSpace).toBe('nowrap');
    expect(label.style.overflow).toBe('hidden');
    expect(label.style.maxWidth).toBe('100%');
    // Доступное имя ссылки остаётся целым: подрезает CSS, а не разметка.
    expect(screen.getByRole('link', { name: 'Материалы' })).toBeInTheDocument();
  });
});
