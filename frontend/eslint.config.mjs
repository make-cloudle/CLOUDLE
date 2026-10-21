import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // three.js 장면 그래프는 useFrame 안에서 메시·머티리얼·ref를 직접 바꾸는 명령형 API다.
    // React 상태가 아니므로 불변성 규칙을 3D 컴포넌트에만 끈다.
    files: ["src/components/three/**/*.tsx"],
    rules: { "react-hooks/immutability": "off" },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);

export default eslintConfig;
