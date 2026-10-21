import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { ThrottlerModule } from "@nestjs/throttler";
import { appConfig } from "./config/app.config";
import { AppExceptionFilter } from "./core/http-exception.filter";
import { SessionThrottlerGuard } from "./core/rate-limit.guard";
import { DetectiveController, DetectiveService } from "./modules/detective/detective.controller";
import { EarthController } from "./modules/earth/earth.controller";
import { EarthService } from "./modules/earth/earth.service";
import { HealthController } from "./modules/health/health.controller";
import { LabController } from "./modules/lab/lab.controller";
import { LabService } from "./modules/lab/lab.service";
import { SharedModule } from "./shared/shared.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [appConfig], envFilePath: [".env.local", ".env"] }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (c: ConfigService) => [{ ttl: 60_000, limit: c.get<number>("rateLimitPerMin") ?? 20 }],
    }),
    SharedModule,
  ],
  controllers: [HealthController, EarthController, LabController, DetectiveController],
  providers: [
    EarthService,
    LabService,
    DetectiveService,
    { provide: APP_GUARD, useClass: SessionThrottlerGuard },
    { provide: APP_FILTER, useClass: AppExceptionFilter },
  ],
})
export class AppModule {}
