import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MeDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { mockedApiFetch, resetApiFetchBetweenTests } from '../test-support/apiFetchMock';
import { AuthProvider } from '../auth/AuthProvider';
import { AppShell } from './AppShell';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

// В `afterEach`, не только в конце тестов, что зовут stubMobileViewport():
// упавшая проверка раньше обрывала тест до `vi.unstubAllGlobals()` в его
// хвосте, и подмена «телефона» утекала во все следующие тесты файла
// (реальный случай при правке этого файла — CLAUDE.md «Детерминизм»,
// «порядок тестов»).
afterEach(() => {
  vi.unstubAllGlobals();
});

/** По умолчанию matchMedia в setupTests отвечает «широкий экран» — тесты
 * без явной подмены проверяют монитор; здесь подменяем на «телефон». */
function stubMobileViewport() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches: true,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  );
}

function renderShell(me: MeDto, initialPath = '/schedule') {
  mockedApiFetch.mockImplementation((path: string) => {
    if (path === '/auth/me') return Promise.resolve(me);
    if (path === '/auth/config') return Promise.resolve({});
    if (path === '/auth/logout') return Promise.resolve(undefined);
    // NotificationsProvider (ADR-0065) висит на корне оболочки и ходит в оба
    // адреса при каждом рендере — без заглушек тесты этого файла заливали бы
    // консоль отказами «неожиданный путь».
    if (path.startsWith('/me/inbox'))
      return Promise.resolve({ items: [], unreadCount: 0 });
    if (path === '/me/exams') return Promise.resolve([]);
    return Promise.reject(new Error(`неожиданный путь: ${path}`));
  });

  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<p>Экран входа</p>} />
          <Route element={<AppShell />}>
            <Route path="/schedule" element={<p>Содержимое расписания</p>} />
            {/* Экраны ученика (решение владельца: экзамены — отдельный
                маршрут и первый после входа) — заглушки вместо настоящих
                TasksScreen/LessonsScreen: здесь важна раскладка оболочки, не
                сами экраны (те проверяют TasksScreen.test.tsx,
                LessonsScreen.test.tsx). */}
            <Route path="/tasks" element={<p>Экран заданий</p>} />
            <Route path="/lessons" element={<p>Экран занятий</p>} />
            {/* Личный экран человека — маршрут внутри AppShell, но не за
                ролевым гвардом (ADR-0045): проверяем, что AppShell отдаёт
                под него Outlet любой роли. */}
            <Route path="/profile" element={<p>Экран профиля</p>} />
            {/* Экран сдачи — та же исключительная логика (ТЗ
                student-exams.md): любая роль должна попасть на сам маршрут. */}
            <Route path="/attempts/:id" element={<p>Экран сдачи</p>} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

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
const STUDENT: MeDto = {
  id: 'u2',
  name: 'Ученик',
  roles: [],
  status: 'active',
  telegramLinked: false,
  botChatActive: false,
  noTelegram: false,
  hasEmail: true,
  needsProfile: false,
};
const ASSISTANT: MeDto = {
  id: 'u3',
  name: 'Помощник',
  roles: ['assistant'],
  status: 'active',
  telegramLinked: false,
  botChatActive: false,
  noTelegram: false,
  hasEmail: true,
  needsProfile: false,
};

describe('AppShell — навигация по ширине экрана', () => {
  // Ветка «телефон»: по умолчанию matchMedia в setupTests отвечает «широкий
  // экран», поэтому нижняя панель без подмены не рисуется вовсе (отзыв
  // владельца 2026-09-09 — на мониторе она выглядела обрезком телефона).
  it('на телефоне навигация снизу, шириной колонки не задана', async () => {
    stubMobileViewport();
    renderShell(TEACHER);

    const nav = await screen.findByRole('navigation', { name: 'Разделы кабинета' });
    expect(nav.style.width).toBe('');
  });

  it('на широком экране навигация — колонка слева', async () => {
    renderShell(TEACHER);

    const nav = await screen.findByRole('navigation', { name: 'Разделы кабинета' });
    expect(nav.style.flexDirection).toBe('column');
  });
});

describe('AppShell — учитель', () => {
  it('боковая колонка со знаком школы, пункт «Занятия» и вложенный маршрут', async () => {
    renderShell(TEACHER);

    expect(await screen.findByText('Содержимое расписания')).toBeInTheDocument();
    expect(screen.getByText('Школа Сюань-Сюэ')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Занятия' })).toBeInTheDocument();
  });

  // Направление «Тёплая школа» (ADR-0043) убрало шапку во всю ширину — знак
  // переехал в боковую колонку. Печать декоративная — aria-hidden, название
  // рядом уже называет место словами. Гейт от регресса «шапка + колонка»:
  // ровно один экземпляр на странице, не два.
  it('знак школы и название — один раз, в боковой колонке на мониторе', async () => {
    renderShell(TEACHER);
    await screen.findByText('Содержимое расписания');

    const column = screen.getByRole('navigation', { name: 'Разделы кабинета' })
      .parentElement as HTMLElement;
    expect(within(column).getByText('Школа Сюань-Сюэ')).toBeInTheDocument();
    expect(screen.getAllByText('Школа Сюань-Сюэ')).toHaveLength(1);
    expect(column.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  // На телефоне колонки нет — мокап (screens/1c-planning.html) рисует знак
  // первой строкой над содержимым, не в панели вкладок.
  it('на телефоне знак школы — над содержимым, не в панели вкладок, и тоже один раз', async () => {
    stubMobileViewport();
    renderShell(TEACHER);
    await screen.findByText('Содержимое расписания');

    const nav = screen.getByRole('navigation', { name: 'Разделы кабинета' });
    expect(within(nav).queryByText('Школа Сюань-Сюэ')).not.toBeInTheDocument();
    expect(screen.getAllByText('Школа Сюань-Сюэ')).toHaveLength(1);
  });

  // Пять доменов — потолок навигации (navItems.ts, отзыв владельца
  // 2026-09-12: «меню всё ещё сложное»; пятым «Материалы» добавил ADR-0055,
  // шестого домена сюда не заводят); «Ученики» видят admin и teacher
  // (ADR-0030, уточнение 2026-09-15 — ссылку-приглашение отдаёт и учитель).
  // Фильтр по роли и подсветку раздела детально проверяет AppNav.test.tsx —
  // здесь только то, что AppShell передаёт в AppNav настоящего `me`.
  it('нижняя навигация — у учителя тоже «Ученики» (ADR-0030)', async () => {
    renderShell(TEACHER);
    await screen.findByText('Содержимое расписания');

    const nav = screen.getByRole('navigation', { name: 'Разделы кабинета' });
    // «Профиль» — тоже ссылка в этой колонке (блок человека снизу), но не
    // пункт домена: отфильтрован, чтобы тест проверял ровно STAFF_NAV_ITEMS.
    const labels = within(nav)
      .getAllByRole('link')
      .map((link) => link.textContent)
      .filter((label) => label !== 'Профиль');
    expect(labels).toEqual(['Занятия', 'Рассылки', 'Экзамены', 'Ученики', 'Материалы']);
  });

  it('нижняя навигация — у админа тоже «Ученики»', async () => {
    renderShell(ADMIN);
    await screen.findByText('Содержимое расписания');

    const nav = screen.getByRole('navigation', { name: 'Разделы кабинета' });
    const labels = within(nav)
      .getAllByRole('link')
      .map((link) => link.textContent)
      .filter((label) => label !== 'Профиль');
    expect(labels).toEqual(['Занятия', 'Рассылки', 'Экзамены', 'Ученики', 'Материалы']);
  });

  // Ровно то, чего боялся владелец при переносе подвала в колонку (ADR-0043):
  // имя вошедшего и «Выйти» должны остаться доступны — просто уже не под
  // содержимым, а в самом низу боковой колонки. `contentinfo` — implicit-role
  // подвала: его отсутствие подтверждает, что на мониторе он не рисуется.
  it('на мониторе блок человека — в самом низу боковой колонки, не под содержимым', async () => {
    renderShell(TEACHER);
    await screen.findByText('Содержимое расписания');

    const nav = screen.getByRole('navigation', { name: 'Разделы кабинета' });
    const column = nav.parentElement as HTMLElement;

    expect(within(column).getByText(/Вы вошли как Дима/)).toBeInTheDocument();
    expect(within(column).getByRole('button', { name: 'Выйти' })).toBeInTheDocument();
    expect(within(column).getByRole('link', { name: 'Профиль' })).toHaveAttribute(
      'href',
      '/profile',
    );
    // Подвала под содержимым на мониторе больше нет — ровно это и убирало
    // осиротевшую строку в 650px под контентом (ADR-0043 «Контекст»).
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();
    // И блок человека не попал внутрь ориентира «Разделы кабинета».
    expect(within(nav).queryByRole('button', { name: 'Выйти' })).not.toBeInTheDocument();
  });

  // Отзыв владельца 2026-09-12/18: подвал «Вы вошли как …» на каждом экране
  // телефона — лишнее (кнопка нужна редко). На телефоне его больше нет вовсе
  // — вместо имени значок профиля прямо в верхней строке (AppShellBrandRow.tsx),
  // «Выйти» — на самом экране «Профиль» (ProfileScreen.test.tsx).
  it('на телефоне подвала под содержимым больше нет — значок профиля ведёт на «Профиль» в верхней строке', async () => {
    stubMobileViewport();
    renderShell(TEACHER);
    await screen.findByText('Содержимое расписания');

    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Выйти' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Профиль' })).toHaveAttribute(
      'href',
      '/profile',
    );
  });
});

// ADR-0065: значок уведомлений — часть оболочки на обеих ширинах экрана,
// читает общий счётчик через NotificationsProvider (добавлен в этом же PR).
describe('AppShell — ссылка на уведомления (ADR-0065)', () => {
  it('на широком экране — в блоке человека боковой колонки', async () => {
    renderShell(TEACHER);
    await screen.findByText('Содержимое расписания');

    const nav = screen.getByRole('navigation', { name: 'Разделы кабинета' });
    const column = nav.parentElement as HTMLElement;
    expect(within(column).getByRole('link', { name: 'Уведомления' })).toHaveAttribute(
      'href',
      '/notifications',
    );
  });

  it('на телефоне — та же ссылка в верхней строке, рядом со значком профиля', async () => {
    stubMobileViewport();
    renderShell(TEACHER);
    await screen.findByText('Содержимое расписания');

    expect(screen.getByRole('link', { name: 'Уведомления' })).toHaveAttribute(
      'href',
      '/notifications',
    );
  });
});

describe('AppShell — помощник учителя', () => {
  it('правами равен учителю — тот же маршрут и та же навигация', async () => {
    renderShell(ASSISTANT);

    expect(await screen.findByText('Содержимое расписания')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Занятия' })).toBeInTheDocument();
  });
});

// Решение владельца: экзамены — отдельный экран и первый после входа. У
// ученика больше нет отдельной подмены содержимого (StudentScreen) — вместо
// неё та же раскладка, что у штата, и редирект с чужих маршрутов.
describe('AppShell — ученик (без роли teacher/assistant/admin)', () => {
  it('на маршруте штата — редирект на «Задания», не подмена содержимого', async () => {
    renderShell(STUDENT);

    expect(await screen.findByText('Экран заданий')).toBeInTheDocument();
    expect(screen.queryByText('Содержимое расписания')).not.toBeInTheDocument();
  });

  it('своя навигация — «Задания» и «Занятия», без пунктов штата', async () => {
    renderShell(STUDENT);
    await screen.findByText('Экран заданий');

    expect(screen.getByRole('link', { name: 'Задания' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Занятия' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Рассылки' })).not.toBeInTheDocument();
    expect(screen.queryByText('Ученики')).not.toBeInTheDocument();
  });

  // У ученика теперь та же раскладка, что у штата: боковая колонка на
  // мониторе несёт знак школы и блок человека сама (см. шапку AppShell.tsx).
  it('на мониторе — боковая колонка со знаком школы и блоком человека, как у штата', async () => {
    renderShell(STUDENT);
    await screen.findByText('Экран заданий');

    const nav = screen.getByRole('navigation', { name: 'Разделы кабинета' });
    const column = nav.parentElement as HTMLElement;
    expect(within(column).getByText('Школа Сюань-Сюэ')).toBeInTheDocument();
    expect(within(column).getByText(/Вы вошли как Ученик/)).toBeInTheDocument();
    expect(within(column).getByRole('button', { name: 'Выйти' })).toBeInTheDocument();
    expect(screen.getAllByText('Школа Сюань-Сюэ')).toHaveLength(1);
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();
  });

  it('на телефоне — нижняя панель вкладок и знак школы над содержимым, как у штата', async () => {
    stubMobileViewport();
    renderShell(STUDENT);
    await screen.findByText('Экран заданий');

    expect(screen.getByRole('link', { name: 'Задания' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Занятия' })).toBeInTheDocument();
    expect(screen.getAllByText('Школа Сюань-Сюэ')).toHaveLength(1);
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();
  });

  // Маршрут не спрятан за ролевым гвардом: ученик на «/profile» видит сам
  // экран, не редирект.
  it('на «/profile» — сам маршрут, не редирект', async () => {
    renderShell(STUDENT, '/profile');

    expect(await screen.findByText('Экран профиля')).toBeInTheDocument();
    expect(screen.queryByText('Экран заданий')).not.toBeInTheDocument();
  });

  // То же самое для экрана сдачи (ТЗ student-exams.md) — вход в него не
  // ролевая настройка, а кнопка на TasksScreen.tsx, но сам маршрут должен
  // открываться, а не подменяться редиректом.
  it('на «/attempts/:id» — сам маршрут, не редирект', async () => {
    renderShell(STUDENT, '/attempts/a1');

    expect(await screen.findByText('Экран сдачи')).toBeInTheDocument();
    expect(screen.queryByText('Экран заданий')).not.toBeInTheDocument();
  });
});

// Гейт от регресса ровно того правила, которое проверяет шапка AppShell.tsx:
// «знак школы и блок человека рисует либо боковая колонка, либо оболочка» —
// во всех четырёх сочетаниях роли и ширины, не задваиваясь и не пропадая.
describe('AppShell — знак школы и блок человека: все сочетания роли и ширины', () => {
  it('учитель, монитор — колонка несёт знак и блок человека', async () => {
    renderShell(TEACHER);
    await screen.findByText('Содержимое расписания');

    expect(screen.getAllByText('Школа Сюань-Сюэ')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Выйти' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Профиль' })).toHaveAttribute(
      'href',
      '/profile',
    );
  });

  it('учитель, телефон — строка над содержимым, «Выйти» — не в оболочке', async () => {
    stubMobileViewport();
    renderShell(TEACHER);
    await screen.findByText('Содержимое расписания');

    expect(screen.getAllByText('Школа Сюань-Сюэ')).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Профиль' })).toHaveAttribute(
      'href',
      '/profile',
    );
    expect(screen.queryByRole('button', { name: 'Выйти' })).not.toBeInTheDocument();
  });

  it('ученик, монитор — колонка несёт знак и блок человека, ровно как у штата', async () => {
    renderShell(STUDENT);
    await screen.findByText('Экран заданий');

    expect(screen.getAllByText('Школа Сюань-Сюэ')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Выйти' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Профиль' })).toHaveAttribute(
      'href',
      '/profile',
    );
  });

  it('ученик, телефон — строка над содержимым, ровно как у штата', async () => {
    stubMobileViewport();
    renderShell(STUDENT);
    await screen.findByText('Экран заданий');

    expect(screen.getAllByText('Школа Сюань-Сюэ')).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Профиль' })).toHaveAttribute(
      'href',
      '/profile',
    );
    expect(screen.queryByRole('button', { name: 'Выйти' })).not.toBeInTheDocument();
  });
});

// Отзыв владельца 2026-09-18: «нижнее меню скачет». Причина была в том, что
// панель жила внутри прокрутки документа (`position: sticky`), а iOS двигает
// документ целиком на оттяжке и инерции. Гейт на новый приём: сама оболочка
// ровно в экран и не прокручивается, прокручивается колонка содержимого.
describe('AppShell — прокрутка внутри оболочки, а не страницы', () => {
  it('оболочка ровно в высоту экрана и сама не прокручивается', async () => {
    stubMobileViewport();
    const { container } = renderShell(TEACHER);
    await screen.findByText('Содержимое расписания');

    const shell = container.firstElementChild as HTMLElement;
    expect(shell.style.height).toBe('100dvh');
    expect(shell.style.overflow).toBe('hidden');
  });

  it('прокручивается колонка содержимого, и оттяжка не уходит на страницу', async () => {
    stubMobileViewport();
    renderShell(TEACHER);
    const main = (await screen.findByText('Содержимое расписания')).closest('main');
    const contentColumn = main?.parentElement as HTMLElement;

    expect(contentColumn.style.overflowY).toBe('auto');
    expect(contentColumn.style.overscrollBehavior).toBe('contain');
  });

  // Колонка разделов на мониторе больше не может рассчитывать на прокрутку
  // страницы: на низком окне блок человека «Профиль · Выйти» оказался бы
  // недостижим (sideNavStyles.ts, sideStyle).
  it('боковая колонка на мониторе прокручивается сама', async () => {
    renderShell(TEACHER);
    const nav = await screen.findByRole('navigation', { name: 'Разделы кабинета' });

    expect((nav.parentElement as HTMLElement).style.overflowY).toBe('auto');
  });

  // Панель вкладок (AppNav isMobile) — сосед строки-обёртки (shellRowStyle),
  // не её потомок: та же строка, что растягивается на всю высоту экрана и
  // прижимает панель к низу. Проверяем и на ученике — раскладка теперь общая.
  it('на телефоне панель вкладок остаётся прижатой к низу — flex:1 строки-обёртки на месте', async () => {
    stubMobileViewport();
    renderShell(STUDENT);
    const nav = await screen.findByRole('navigation', { name: 'Разделы кабинета' });

    const shellRow = nav.previousElementSibling as HTMLElement;
    // jsdom разворачивает сокращение: `flex: 1` эквивалентно `flex: 1 1 0%`.
    expect(shellRow.style.flex).toBe('1 1 0%');
  });
});
