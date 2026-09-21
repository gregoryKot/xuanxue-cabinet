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
    notificationsLink?: ReactNode;
    logoutButton?: ReactNode;
  } = {},
) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppNav isMobile={isMobile} me={me} {...personProps} />
    </MemoryRouter>,
  );
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
  it('ученик без роли — два своих экрана, не пункты штата', () => {
    const student: MeDto = { ...TEACHER, roles: [] };
    renderNav(true, student);

    const labels = screen
      .getAllByRole('link')
      .map((link) => link.textContent)
      .filter((label): label is string => label !== null);
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

  // Иконок в пунктах нет вовсе (ADR-0043) — подпись остаётся единственным
  // содержимым ссылки что на телефоне, что в колонке.
  it('подпись видна в обоих видах — единственное содержимое пункта', () => {
    const { unmount } = renderNav(true);
    expect(screen.getByText('Занятия')).toBeInTheDocument();
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
    expect(pill.textContent).toBe('Занятия');
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

// Правка 2026-09-21 (отзыв владельца, ADR-0063): ссылку было не найти внизу
// колонки, тусклой текстовой строкой в блоке человека. Теперь это первая
// строка колонки после знака школы, ярче пунктов меню.
describe('AppNav — ссылка на уведомления наверху колонки (ADR-0063)', () => {
  it('стоит перед <nav aria-label="Разделы кабинета">, не внутри него', () => {
    renderNav(false, TEACHER, '/planning', {
      notificationsLink: <a href="/notifications">Уведомления</a>,
      profileLink: <a href="/profile">Профиль</a>,
      logoutButton: <button type="button">Выйти</button>,
    });

    const nav = screen.getByRole('navigation', { name: 'Разделы кабинета' });
    const notifLink = screen.getByRole('link', { name: 'Уведомления' });

    // Не внутри ориентира «Разделы кабинета» — та же причина, что у знака
    // школы и блока человека (комментарий в AppNav.tsx у самого <nav>).
    expect(
      within(nav).queryByRole('link', { name: 'Уведомления' }),
    ).not.toBeInTheDocument();
    // И раньше <nav> в разметке колонки, не после (тот же приём, что у
    // ExamEditorScreen.test.tsx — «Опубликовать» выше списка вопросов).
    expect(
      notifLink.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

// Отзыв владельца 2026-09-19: «Школа Сюань-Сюэ» переносилось на две строки в
// колонке 236px. Замер в Chromium: строка просит 163px при кегле 20 и 147px
// при 18, доступно 158 после снятия правого отступа. Гейт от возврата кегля.
describe('AppNav — название школы в колонке не переносится', () => {
  it('заголовок в одну строку, с подрезкой на случай подстановочного шрифта', () => {
    renderNav(false);

    const title = screen.getByText('Школа Сюань-Сюэ');
    expect(title.style.whiteSpace).toBe('nowrap');
    expect(title.style.textOverflow).toBe('ellipsis');
    expect(title.style.fontSize).toBe('18px');
  });
});

// ADR-0055 «Последствия»: «Ширина проверяется тестом AppNav.test.tsx и
// вручную на 360 px — это условие мержа, а не пожелание». Два теста ниже —
// то самое условие: столько дорожек, сколько пунктов, и подписи умещаются.
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

  // Замер в Chromium на живом Golos Text (360px, дорожка 64px): «Материалы»
  // просят 67px при кегле 12 и 61.4px при кегле 11. То есть двенадцатый ломал
  // подпись пополам — «Материал» и «ы» второй строкой, — и панель росла с 44px
  // до 63. Гейт от возврата кегля: jsdom текст не меряет и такую поломку не
  // увидит, поэтому сторожим то единственное число, от которого она зависит.
  const MEASURED_LABEL_FONT_SIZE_PX = '11px';
  it('кегль подписи — тот, на котором мерялась ширина (иначе подпись переносится)', () => {
    renderNav(true, TEACHER);

    const pill = screen
      .getByRole('link', { name: 'Материалы' })
      .querySelector('span') as HTMLElement;
    expect(pill.style.fontSize).toBe(MEASURED_LABEL_FONT_SIZE_PX);
  });

  // Грубый предохранитель на случай новой длинной подписи. Считает знаки, а
  // не пиксели, и потому сам по себе ничего не доказывает: прошлая версия
  // этого теста стояла на 10 знаках, пропустила девятизначные «Материалы» и
  // уехала в прод с поломанной панелью — знаки у Golos Text шире, чем
  // казалось (≈6.8px при кегле 11, а не 6.3). Настоящая проверка — глазами на
  // 360px, как и требует ADR-0055; здесь только ранний сигнал.
  const MAX_NAV_LABEL_CHARS = 9;
  it('подписи не длиннее замеренного бюджета в знаках', () => {
    for (const { label } of [...STAFF_NAV_ITEMS, ...STUDENT_NAV_ITEMS]) {
      expect(label.length).toBeLessThanOrEqual(MAX_NAV_LABEL_CHARS);
    }
  });
});
