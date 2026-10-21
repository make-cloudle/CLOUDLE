<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# 프론트엔드 주 에이전트

> 공통 규칙은 루트 [`AGENTS.md`](../AGENTS.md)를 먼저 따른다. 위 블록은 Next.js가 자동으로 넣는 안내라 지우지 않는다(번들 문서 `node_modules/next/dist/docs/`를 먼저 읽을 것).

## 1. 스택
Next.js 16 (App Router) · React 19 · React Three Fiber · react-globe.gl · Zustand · Tailwind CSS 4 · **pnpm**

## 2. 구조 — Feature-Sliced Design
```
src/
  app/        라우트(화면 조립만): / · /bin · /vs · /detective · /book · /explore · /about
  widgets/    여러 기능을 묶은 화면 블록: header · footer · result-card
  features/   사용자 행동 단위: globe · cloud-lab(던지기·노트·업로드) · ask-cloud · compare · discovery
  entities/   도메인 표현: mascot(지구·구름 캐릭터) · country · evidence(근거 번호·출처)
  shared/     ui(디자인 시스템) · lib(i18n·prefs·idle) · api(게이트웨이 클라이언트)
```
- **아래 계층만 import한다**: `app → widgets → features → entities → shared`. 같은 계층끼리 서로 import하지 않는다.
- 3D 라이브러리(react-globe.gl, three)를 쓰는 모듈은 `next/dynamic({ ssr: false })`로만 불러온다. 그 모듈에서 **값**을 정적으로 import하면 서버에서 `window` 오류가 난다 → 공용 상수는 `entities`로 뺀다.

## 3. 디자인 시스템 (화면에 띄우지 않고 코드 안에서 사용)
- 토큰: `src/app/globals.css` (`--bg`, `--sky`, `--mint`, `--yellow`, `--lavender`, `--ink`, `--series-a/b` …), 라이트/다크 둘 다.
- 컴포넌트: `src/shared/ui/primitives.tsx` (Button·Chip·Card·Tag·Input·Alert·Segmented). 새 버튼·카드를 직접 만들지 말고 여기서 확장한다.
- 캐릭터: `public/characters/*.png` (사용자 제공 AI 생성 이미지, 사용 허락됨). `entities/mascot`의 `CloudMascot`·`EarthBuddy`로만 쓴다. 30초 무입력 시 대기 동작(`useIdle`).
- 아이콘은 라인 SVG(`shared/ui/icons.tsx`). 이모지로 대신하지 않는다.
- 문구는 `shared/lib/i18n.ts`에 4개 언어(ko·en·ja·zh)로 추가한다. 입력 안내는 "예: …"가 아니라 "~를 적어주세요" 형태.
- 모바일: 제목·본문 왼쪽 정렬, 가로 스크롤 없음, 드래그 대신 버튼으로도 같은 흐름이 가능해야 한다.

## 4. 데이터 규칙
- API는 `shared/api/client.ts`만 쓴다 (기본 `http://localhost:4000` 게이트웨이).
- 수치에는 출처·단위·기준연도/관측시각을 붙이고, 없으면 "조회 불가". 차트 색은 `dataviz` 스킬의 검증 스크립트를 통과한 `--series-a/b`만 쓴다.
- 발견 노트는 `features/discovery` (localStorage, 개인 편의 데이터만).

## 5. 검증
```bash
pnpm exec tsc --noEmit && pnpm lint && pnpm build
```
3D·드래그 같은 상호작용은 Playwright 헤드리스 브라우저로 실제 조작해 확인하고 콘솔 오류 0건을 목표로 한다.

## 6. 위임할 서브 에이전트
- 지구본·클라우드 빈 물리·캐릭터 → `ui-3d-engineer`
- 토큰·컴포넌트·반응형·접근성 점검 → `design-system-keeper`
- 화면 시나리오 검증 → `qa-verifier`
