// 개발용: 같은 폴더에서 Next dev 서버를 여러 포트로 띄운다.
// 게이트웨이는 접속한 화면의 포트로 사람을 정한다 → 3000 = 지구미, 3001 = 예나 (COMMUNITY_IDENTITIES).
//   pnpm dev:yena   → 3001만
//   pnpm dev:both   → 3000 + 3001 동시
import { spawn } from "node:child_process";

const ports = process.argv.slice(2).length ? process.argv.slice(2) : ["3000"];
const children = ports.map((port) =>
  spawn("pnpm", ["exec", "next", "dev", "-p", port, "-H", "0.0.0.0"], {
    stdio: "inherit",
    shell: process.platform === "win32",
    // next dev는 같은 출력 폴더를 두 번 잠글 수 없으므로 포트마다 폴더를 나눈다
    env: { ...process.env, NEXT_DIST_DIR: port === "3000" ? ".next" : `.next-${port}` },
  }),
);
const stop = () => children.forEach((c) => c.kill());
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
