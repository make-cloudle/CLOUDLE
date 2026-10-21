# CLOUDLE · frontend

Next.js 16 + React Three Fiber 3D 웹 (F2013). 백엔드 API(`backend/`)가 먼저 실행 중이어야 합니다.

```bash
cp .env.example .env.local   # NEXT_PUBLIC_API_BASE=http://localhost:8000
npm install
npm run dev                  # http://localhost:3000
```

| 경로 | 화면 |
|---|---|
| `/` | 3D 지구본 · 국가 환경 브리핑 |
| `/loop` | 종이 작성 → 구기기 → 쓰레기통 → 분석 → 구름 열기 |
| `/explore` | 조건 기반 품목 탐색 |
| `/design` | 디자인 시스템 · 컴포넌트 키트 |

3D 코드는 `src/components/three/`, 종이 텍스처는 `src/lib/paperTexture.ts`에 있습니다.
