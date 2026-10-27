# CLOUDLE API Gateway (NestJS + Fastify + socket.io)
# 멀티 스테이지: 빌드에만 devDependencies(TypeScript)를 쓰고, 실행 이미지는 운영 의존성 + dist만 담는다.
FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN pnpm build

FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod && pnpm store prune
COPY --from=build /app/dist ./dist
# 랭킹 파일 보관 디렉터리 (볼륨을 마운트해도 node 사용자가 쓸 수 있게 미리 만들어 소유권을 준다)
RUN mkdir -p /app/storage && chown node:node /app/storage
# node 이미지의 비루트 사용자
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--enable-source-maps", "dist/main.js"]
