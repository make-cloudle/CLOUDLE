import "reflect-metadata";
import multipart from "@fastify/multipart";
import { Logger, ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { AppModule } from "./app.module";
import { originAllowed } from "./config/app.config";
import { CorsIoAdapter } from "./core/socket-io.adapter";

type AppFactory = (adapter: FastifyAdapter) => Promise<NestFastifyApplication>;

const defaultFactory: AppFactory = (adapter) =>
  NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
    logger: ["error", "warn", "log"],
  });

/** 테스트는 factory로 포트만 바꿔 끼운 모듈을 넘겨, CORS·소켓 어댑터까지 같은 설정을 쓴다. */
export async function createApp(factory: AppFactory = defaultFactory) {
  const app = await factory(new FastifyAdapter({ trustProxy: true }));

  const config = app.get(ConfigService);

  // 로컬 개발 Origin(3000=지구미, 3001=예나) + 환경 변수
  const allowedOrigins = [
    ...new Set([
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://localhost:3001",
      "http://127.0.0.1:3001",
      ...(config.get<string[]>("corsOrigins") ?? []),
    ]),
  ];
  const allowLan = config.get<boolean>("allowLanOrigins") ?? false;
  const origin = (o: string | undefined, cb: (err: Error | null, allow: boolean) => void) =>
    cb(null, originAllowed(o, allowedOrigins, allowLan));

  // CORS 설정 (HTTP)
  app.enableCors({
    origin,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Session-Id",
    ],
    credentials: true,
    preflight: true,
    optionsSuccessStatus: 204,
  });

  // WebSocket(socket.io)도 같은 Origin 규칙
  app.useWebSocketAdapter(new CorsIoAdapter(app, origin));

  Logger.log(
    `Allowed CORS origins: ${allowedOrigins.join(", ")}${allowLan ? " + LAN" : ""}`,
    "Bootstrap"
  );

  await app.register(multipart as never, {
    limits: {
      fileSize: 5 * 1024 * 1024,
      files: 1,
    },
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    })
  );

  return app;
}

async function bootstrap() {
  const app = await createApp();

  const port = 4000;

  await app.listen(port, "0.0.0.0");

  Logger.log(
    `CLOUDLE gateway → http://localhost:${port}  (ws: /community)`,
    "Bootstrap"
  );
}

if (require.main === module) {
  void bootstrap();
}
