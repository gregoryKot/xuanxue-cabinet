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

EXPOSE 3000
CMD ["node", "api/dist/main.js"]
