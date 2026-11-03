// Гейт режима учителя (ADR-0190): в каждом `@Roles(...)` со словом `'teacher'`
// обязано стоять и `'admin'`. Админ в режиме учителя получает действующие роли
// `['teacher']` (users/acting-mode.ts), и режим остаётся «только убавляет права»,
// лишь пока всё, что открыто учителю, открыто и админу. Маршрут «только учителю»
// отдал бы разработчику в режиме то, чего у него без режима нет, — расширение
// прав (SECURITY §2), которое тип роли выразить не мешает.
//
// Читаем настоящие метаданные `@Roles`, а не текст исходников: списки собирают
// из констант (`@Roles(...STAFF_ONLY_ROLES)`), и поиск по строке их не увидел бы.
// Контроллеры находим обходом `api/src/**/*.controller.ts`, поэтому новый
// контроллер попадает под проверку без правки этого файла. Роли вне `@Roles`
// (`isStaffRole`, `roles.includes('admin')` в сервисах) не метаданные: там 'teacher'
// всегда входит в штат вместе с 'admin', а 'admin'-ветки учителю закрыты — сужение.
import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import type { UserRole } from '@xuanxue/shared';
import { ROLES_KEY, Roles } from './auth.decorators';

const SRC_DIR = join(__dirname, '..');
const CONTROLLER_SUFFIX = '.controller.ts';
const NEST_PATH_METADATA = 'path';

/** Класс контроллера: нужны только имя и прототип с методами. */
interface ControllerClass {
  name: string;
  prototype: object;
}

interface RolesList {
  /** `Класс` или `Класс.метод` — где стоит `@Roles`. */
  where: string;
  roles: readonly UserRole[];
}

function controllerFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return controllerFiles(full);
    return name.endsWith(CONTROLLER_SUFFIX) ? [full] : [];
  });
}

/** Все списки `@Roles` класса: на нём самом и на каждом методе. */
function rolesListsOf(controller: ControllerClass): RolesList[] {
  const lists: RolesList[] = [];
  const onClass = Reflect.getMetadata(ROLES_KEY, controller) as UserRole[] | undefined;
  if (onClass) lists.push({ where: controller.name, roles: onClass });

  const proto = controller.prototype as Record<string, unknown>;
  for (const name of Object.getOwnPropertyNames(proto)) {
    // `constructor` — сам класс, его список уже учтён выше как классовый.
    if (name === 'constructor') continue;
    const handler = proto[name];
    if (typeof handler !== 'function') continue;
    const onMethod = Reflect.getMetadata(ROLES_KEY, handler) as UserRole[] | undefined;
    if (onMethod) lists.push({ where: `${controller.name}.${name}`, roles: onMethod });
  }
  return lists;
}

/** Списки, где учитель есть, а админа нет. */
function teacherWithoutAdmin(lists: readonly RolesList[]): string[] {
  return lists
    .filter(({ roles }) => roles.includes('teacher') && !roles.includes('admin'))
    .map(({ where, roles }) => `${where}: [${roles.join(', ')}]`);
}

async function loadControllers(): Promise<ControllerClass[]> {
  const modules = await Promise.all(
    controllerFiles(SRC_DIR).map(
      (file) => import(file) as Promise<Record<string, unknown>>,
    ),
  );
  return modules
    .flatMap((mod) => Object.values(mod))
    .filter(
      (value): value is ControllerClass =>
        typeof value === 'function' && Reflect.hasMetadata(NEST_PATH_METADATA, value),
    );
}

describe('режим учителя: @Roles с teacher всегда содержит admin (ADR-0190)', () => {
  it('ни у одного контроллера и метода нет списка с teacher без admin', async () => {
    const controllers = await loadControllers();
    const lists = controllers.flatMap(rolesListsOf);

    // Страховка от пустой проверки: если обход ничего не нашёл (переехали
    // каталоги, сменился ключ метаданных), тест не должен молча позеленеть.
    expect(controllers.length).toBeGreaterThan(20);
    expect(lists.some(({ roles }) => roles.includes('teacher'))).toBe(true);
    expect(teacherWithoutAdmin(lists)).toEqual([]);
  }, 60_000);

  describe('сам детектор', () => {
    @Roles('teacher', 'assistant')
    class ClassLevelViolation {}

    class MethodLevelViolation {
      @Roles('admin')
      fine(): void {}

      @Roles('assistant', 'teacher')
      bad(): void {}
    }

    @Roles('teacher', 'admin')
    class Clean {
      @Roles('accountant')
      accountantOnly(): void {}
    }

    it('ловит teacher без admin на классе', () => {
      expect(teacherWithoutAdmin(rolesListsOf(ClassLevelViolation))).toEqual([
        'ClassLevelViolation: [teacher, assistant]',
      ]);
    });

    it('ловит teacher без admin на методе, соседний метод и список без teacher не трогает', () => {
      expect(teacherWithoutAdmin(rolesListsOf(MethodLevelViolation))).toEqual([
        'MethodLevelViolation.bad: [assistant, teacher]',
      ]);
    });

    it('чистый контроллер не обвиняет', () => {
      expect(teacherWithoutAdmin(rolesListsOf(Clean))).toEqual([]);
    });
  });
});
