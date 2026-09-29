// Маршруты, которые Nest регистрирует у контроллеров приложения, — в виде
// ключа карты `shared/src/api-routes.ts` («МЕТОД /путь» без `/api`). Читает
// те же метаданные `@Controller`/`@Get`/…, по которым маршруты строит сам
// RouterExplorer Nest, но у контроллеров из графа модулей настоящего
// AppModule: контроллер, не подключённый ни в один модуль, сюда не попадёт —
// ровно как и в Nest (PLAN §17.1, ADR-0148).
import { RequestMethod, type INestApplication } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ModulesContainer } from '@nestjs/core';
import {
  API_ROUTE_METADATA,
  type RegisteredRoute,
} from '../../src/common/api-route.decorator';

function asList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  return [typeof value === 'string' ? value : ''];
}

function joinPath(prefix: string, path: string): string {
  return `/${[prefix, path].join('/').split('/').filter(Boolean).join('/')}`;
}

/** Класс контроллера — ровно то, что нужно сборщику: имя для сообщения и
 * прототип с обработчиками. */
interface ControllerClass {
  name: string;
  prototype: Record<string, unknown>;
}

function handlerRoutes(controller: ControllerClass, name: string): RegisteredRoute[] {
  const handler: unknown = controller.prototype[name];
  if (typeof handler !== 'function') return [];
  const paths: unknown = Reflect.getMetadata(PATH_METADATA, handler);
  if (paths === undefined) return [];
  const method = RequestMethod[Reflect.getMetadata(METHOD_METADATA, handler) as number];
  const declared = Reflect.getMetadata(API_ROUTE_METADATA, handler) as string | undefined;
  const prefixes = asList(Reflect.getMetadata(PATH_METADATA, controller));
  return prefixes.flatMap((prefix) =>
    asList(paths).map((path) => ({
      handler: `${controller.name}.${name}`,
      route: `${method} ${joinPath(prefix, path)}`,
      declared,
    })),
  );
}

export function collectRegisteredRoutes(app: INestApplication): RegisteredRoute[] {
  const routes: RegisteredRoute[] = [];
  for (const module of app.get(ModulesContainer).values()) {
    for (const wrapper of module.controllers.values()) {
      const controller: ControllerClass | null = wrapper.metatype;
      if (!controller) continue;
      for (const name of Object.getOwnPropertyNames(controller.prototype)) {
        routes.push(...handlerRoutes(controller, name));
      }
    }
  }
  return routes;
}
