import type { INestApplicationContext } from "@nestjs/common";
import { IoAdapter } from "@nestjs/platform-socket.io";
import type { ServerOptions } from "socket.io";

type OriginCheck = (origin: string | undefined, cb: (err: Error | null, allow: boolean) => void) => void;

/** socket.io도 HTTP와 같은 Origin 규칙을 쓰게 한다 (게이트웨이 데코레이터에 주소를 박지 않는다). */
export class CorsIoAdapter extends IoAdapter {
  constructor(app: INestApplicationContext, private readonly origin: OriginCheck) {
    super(app);
  }

  createIOServer(port: number, options?: ServerOptions) {
    return super.createIOServer(port, {
      ...options,
      cors: { origin: this.origin, credentials: true },
      maxHttpBufferSize: 64 * 1024, // 바이너리는 HTTP로만 올린다
      pingInterval: 20_000,
    });
  }
}
