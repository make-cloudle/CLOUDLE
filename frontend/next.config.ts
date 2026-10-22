import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 3000(지구미)·3001(예나)을 동시에 띄우려면 dev 출력 폴더를 나눠야 한다 (next dev 잠금 파일). scripts/dev-as.mjs 참고
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // 같은 와이파이의 휴대폰에서 LAN IP로 접속할 때 dev 리소스를 막지 않게 한다
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*"],
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
