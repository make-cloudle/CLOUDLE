import type { IncomingMessage } from "node:http";
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
      // CORS는 브라우저의 HTTP 요청만 막는다. WebSocket 접속은 서버가 Origin을 직접 검사해야 한다
      // (안 하면 다른 사이트의 스크립트가 이 서버에 소켓을 열어 글을 올릴 수 있다).
      allowRequest: (req: IncomingMessage, cb: (err: string | null | undefined, ok: boolean) => void) =>
        this.origin(req.headers.origin, (_err, allow) => cb(null, allow)),
      maxHttpBufferSize: 64 * 1024, // 바이너리는 HTTP로만 올린다
      pingInterval: 20_000,
    });
  }
}
