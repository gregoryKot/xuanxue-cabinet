# Один сервис Railway: собирает shared → web → api, Nest отдаёт web/dist и /api/*.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/package.json
COPY api/package.json api/package.json
COPY web/package.json web/package.json
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
# Прод-зависимости ставятся заново, а не копируются из build-стадии: npm
# раскладывает часть пакетов не в корневой node_modules, а в api/node_modules
# (@nestjs/config, @nestjs/platform-express и др.) — копирование одного
# корневого каталога давало «Cannot find module '@nestjs/config'» при старте
# (CI-джоба docker, 2026-09-05). Заодно в образ не попадают dev-пакеты.
COPY package.json package-lock.json ./
COPY shared/package.json shared/package.json
COPY api/package.json api/package.json
COPY web/package.json web/package.json
RUN npm ci --omit=dev
COPY --from=build /app/shared/dist ./shared/dist
COPY --from=build /app/api/dist ./api/dist
COPY --from=build /app/web/dist ./web/dist

# Аудит L1: раньше процесс работал от root — базовый образ node:22-alpine уже
# содержит пользователя node (uid 1000), отдельно создавать не нужно. Один
# chown одним слоем проще пяти --chown на разных COPY/RUN. Приложение ничего
# не пишет на диск в рантайме — grep по writeFile/mkdir/fs.* в api/src нашёл
# только чтение (readFileSync в migrations/0003-school-zoom-links.migration.ts,
# необязательный локальный файл-сид), поэтому node достаточно read-only
# доступа к /app, отдельный writable-каталог не нужен.
RUN chown -R node:node /app
USER node

# HEALTHCHECK не добавляем: снаружи контейнера его делает Railway по
# railway.json (healthcheckPath), а CI-джоба docker проверяет /api/health
# отдельным шагом (.github/workflows/ci.yml) — свой HEALTHCHECK внутри образа
# был бы третьей, ничего не добавляющей проверкой того же самого.
EXPOSE 3000
CMD ["node", "api/dist/main.js"]
