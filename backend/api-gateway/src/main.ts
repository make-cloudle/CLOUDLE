import "reflect-metadata";
import multipart from "@fastify/multipart";
import { Logger, ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule } from "./app.module";

export async function createApp() {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter({ trustProxy: true }), { logger: ["error", "warn", "log"] });
  const config = app.get(ConfigService);
  await app.register(multipart as never, { limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
  app.enableCors({ origin: config.get<string[]>("corsOrigins"), methods: ["GET", "POST", "DELETE"] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  return app;
}

async function bootstrap() {
  const app = await createApp();
  const port = app.get(ConfigService).get<number>("port") ?? 4000;
  await app.listen(port, "0.0.0.0");
  Logger.log(`CLOUDLE gateway → http://localhost:${port}`, "Bootstrap");
}

if (require.main === module) void bootstrap();
