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
  app/        라우트(화면 조립만): / · /bin · /game · /talk · /book · /explore · /about  (`/vs`는 `/game`으로 308 리다이렉트)
  widgets/    여러 기능을 묶은 화면 블록: header · footer · result-card
  features/   사용자 행동 단위: globe · cloud-lab(던지기·노트·업로드) · ask-cloud · trash-match(분리수거 게임) · discovery · eco-bucket · talk(채팅)
  entities/   도메인 표현: mascot(지구·구름 캐릭터) · country · evidence(근거 번호·출처) · eco-bucket · talk(채팅 타입)
  shared/     ui(디자인 시스템) · lib(i18n·prefs·idle) · api(게이트웨이 클라이언트)
```
- **아래 계층만 import한다**: `app → widgets → features → entities → shared`. 같은 계층끼리 서로 import하지 않는다.
- 3D 라이브러리(react-globe.gl, three)를 쓰는 모듈은 `next/dynamic({ ssr: false })`로만 불러온다. 그 모듈에서 **값**을 정적으로 import하면 서버에서 `window` 오류가 난다 → 공용 상수는 `entities`로 뺀다.

## 3. 디자인 시스템 (화면에 띄우지 않고 코드 안에서 사용)
- 토큰: `src/app/globals.css` (`--bg`, `--sky`, `--mint`, `--yellow`, `--lavender`, `--ink`, `--series-a/b` …), 라이트/다크 둘 다.
- 컴포넌트: `src/shared/ui/primitives.tsx` (Button·Chip·Card·Tag·Input·Alert·Segmented). 새 버튼·카드를 직접 만들지 말고 여기서 확장한다.
- 캐릭터: `public/characters/*.png` (사용자 제공 AI 생성 이미지, 사용 허락됨). `entities/mascot`의 `CloudMascot`·`EarthBuddy`로만 쓴다. 30초 무입력 시 대기 동작(`useIdle`).
  원본이 약 150px이라 고해상도 화면에서 깨지지 않게 `@2x`·`@3x`를 함께 둔다(`scripts/upscale-characters.py`, cmd에서 `.venv` python으로 실행). `<img>`는 직접 경로 대신 `charImg(name)`(src+srcSet)을 쓴다. 표시 크기는 원본의 1배 안팎(≈64~112px)을 넘기지 않는다.
  Cloud Lab 통은 **짚 바구니**(`BinStage.tsx::strawTexture` 코드 생성 텍스처). 모양을 바꿔도 `BIN`(rTop·rBottom·h)·`RIM_R`은 던지기 물리 값이라 유지한다. 결과 구름은 갈라지지 않고 옆으로 흘러가며 사라진다(`drift-away`).
  홈 지구본: 구름은 오른쪽 위, 지구 친구는 그 왼쪽에 나란히 (지구본·범례를 가리지 않게).
- 아이콘은 라인 SVG(`shared/ui/icons.tsx`). 이모지로 대신하지 않는다.
- 문구는 `shared/lib/i18n.ts`에 4개 언어(ko·en·ja·zh)로 추가한다. 입력 안내는 "예: …"가 아니라 "~를 적어주세요" 형태.
- 모바일: 제목·본문 왼쪽 정렬, 가로 스크롤 없음, 드래그 대신 버튼으로도 같은 흐름이 가능해야 한다.

## 3-1. 구름 광장 (`/talk`, `features/talk`)
- **목록 → 방**: 미참여 방은 "○○에 참여하시겠습니까?" 확인 후 `join`, 참여 중인 방(목록에 "참여 중")은 바로 `open`. 방에 들어가면 그 방만 화면 가득(헤더 "구름 광장 · 채팅방" + 방 이름). "채팅방" 버튼 = `close`(참여 유지·알림 없음), "나가기" = `exit`(퇴장 알림).
- 위치를 바깥에서 정하는 캐릭터는 `absolute` 래퍼로 감싸거나 `EarthBuddy`에 `absolute`를 넘긴다(루트 `relative`가 덮지 않게 처리됨).
- socket.io-client는 `features/talk/model.ts`(zustand 스토어)에서만 쓴다. 화면은 스토어만 본다. 재연결되면 보던 방에 자동 재입장한다.
- 말풍선 색은 토큰만 쓴다: `--bubble-mine`(=accent) / `--bubble-other`(accent를 연하게 한 **불투명** 색, 라이트 `#dde5f0` · 다크 `#2e3d56`), 대화 영역 `--chat-bg`. 투명도(`/60` 등)로 만들지 않는다 — 뒤 배경이 비쳐 구분이 흐려진다.
- 반응은 말풍선을 누르면 이모티콘 6개(👍❤️😂😮😢🌱)가 뜨고, 받은 반응은 아래에 "이모티콘 숫자"로 표시.
- 에코 버킷: `features/eco-bucket`(localStorage). Cloud Lab 결과 카드(`widgets/result-card`)에서 결과 전체·방법별로 담고, 채팅 입력창의 "에코 버킷 공유" 토글 리스트에서 제목을 누르면 바로 공유 → `BucketCard`(큰 카드)로 표시.
- 말풍선 규칙은 `features/talk/timeline.ts`(순수 함수): 같은 사람·같은 분 묶음은 **마지막 말풍선에만 시:분**(마우스를 올리면 초까지), 묶음 첫 말풍선에만 닉네임·아바타, 날짜가 바뀌면 구분선. 내 말풍선은 오른쪽(시간은 왼쪽), 남의 말풍선은 왼쪽(시간은 오른쪽). 입장·퇴장은 가운데 알림.
- 한글 IME 조합 중 Enter는 전송하지 않는다 (`isComposing`).
- 메모 ↔ Cloud Lab 노트 ↔ 발견 노트 연결은 `app/talk/page.tsx`(app 계층)에서만 한다 — features끼리 import 금지 규칙 유지.
- 신원은 서버가 Origin 포트로 정한다(3000=지구미, 3001=예나). 같은 폴더에서 두 dev 서버를 띄우려면 `pnpm dev:both`(포트별 `NEXT_DIST_DIR` 분리, `scripts/dev-as.mjs`).
- API 주소는 `apiBase()` — 지정이 없으면 현재 호스트의 :4000이라 휴대폰(LAN IP)에서도 동작한다.

## 3-2. 분리수거 게임 (`/game`, `features/trash-match`)
- 규칙은 `engine.ts`(React·DOM 없는 순수 함수)에만 둔다. 화면(`TrashMatch.tsx`)은 `resolveMove()`가 돌려준 단계(`steps`)를 애니메이션으로 재생만 한다.
  검증: `pnpm test:puzzle` (규칙 테스트: 초기 보드·특수 블록 생성/발동·잘못된 교환·콤보 배수·4,000회 이상 이동 시뮬레이션).
- 종류 6가지(비닐·플라스틱·캔·종이·유리·일반)는 **색 + 모양**이 모두 다르다(`pieces.tsx`). 아이콘은 라인 SVG, 이모지 금지.
- 특수 블록: 4개 → 줄 폭탄(가로/세로 한 줄), L·T자 → 구역 폭탄(5×5), 5개 한 줄 → 분리수거 폭탄(바꾼 종류 전부).
  **줄·구역 폭탄은 같은 종류 3개 이상과 함께 맞춰 터질 때만 발동한다. 옮기기만 해서는 발동하지 않고, 매치가 없으면 교환이 되돌려진다.** 색이 없는 분리수거 폭탄만 바꾸는 것으로 발동한다.
- 점수: 칸당 10점 × 연쇄 배수(1·2·3·4, 최대 ×4) + 특수 블록 생성 50 + 3연쇄부터 보너스. 시간: 60초 시작, 최대 90초, 터뜨릴수록·연쇄할수록 회복. **시간은 터지는 동안 멈춘다.**
- **일시정지:** 시간 줄의 버튼 · `P`/`Esc` 키 · 탭을 가리면(`visibilitychange`) 자동. 일시정지 중에는 타이머가 멈추고 입력이 막히며, **판을 불투명 오버레이로 가려서**(멈춘 채로 수를 보는 것 방지) "계속하기"/"처음부터 다시"만 보인다. 상태는 `pausedRef`(타이머·입력 가드)와 `paused`(화면)를 함께 쓴다.
- **모드(`TrashHub.tsx`):** "일반 모드" = 기존 게임 그대로(`<TrashMatch />`, `stage` 없음, 오염·벌점·목표 없음) / "트레일" = 스테이지 지도 → `<TrashMatch stage={…} />`. 일반 모드는 트레일 때문에 바뀌면 안 된다(엔진의 오염 난수는 `dirtRate`가 있을 때만 쓰므로 기존과 같은 보드).
- **트레일 규칙(`stages.ts`, 순수 함수):** 쉬움·보통·어려움 각 10 스테이지. 제한 시간 안에 **목표(점수 + 종류 모으기 + 오염 씻기)를 모두** 채우면 클리어, 남은 시간은 보너스 점수, 최종 점수가 목표의 1.0/1.3/1.6배면 별 1/2/3. 같은 레벨에서는 앞 스테이지를 깨야 다음이 열린다(진행은 `progress.ts`, `localStorage` `cloudle-pz-trail`, 깨진 값은 0으로 읽는다).
- **오염(음식물):** 새로 생기는 칸이 `dirtRate` 확률로 더럽다(`dirt` 1=음식물, 2=찌든 때·어려움). 더러운 칸은 3개 이상에 포함되거나 폭발에 휘말려도 **사라지지 않고 한 겹 씻기고(WASH!)** 제자리에 남는다. **씻겨서 깨끗해진 칸이 다시 같은 색 3개 이상으로 이어져 있으면 바로 다음 연쇄 단계에서 맞춰져 사라진다**(예: 3개가 모두 더러우면 씻기고 → 같은 줄이 다시 맞춰져 사라짐, 연쇄 배수 적용. 찌든 때 3개는 두 번 씻기고 세 번째에 사라짐). 더러운 칸에는 특수 블록을 만들지 않는다. 헛손질 판정·움직일 곳 판정(`hasMove`)은 **새로 생기는 줄만** 센다(안전장치).
- **벌점(난이도가 오를수록 커짐):** 오분리(아무것도 안 맞는 교환) 쉬움 0 / 보통 −5 / 어려움 −15점(+ 어려움은 −1초), 오염 방치(이동마다 남은 오염 칸 수, 최대 8칸 × 칸당 0 / 1 / 3점). 점수는 0 아래로 내려가지 않는다. 표는 `stages.ts`의 `RULES`·`TABLE`이 단일 출처.
- **랭킹·닉네임 입장:** 트레일 탭에 들어가면 `NicknameGate`가 먼저 나오고, 닉네임을 `/api/ranking/claim`으로 등록해야 지도가 열린다(저장된 이름이 있으면 자동 재등록, 이미 쓰는 이름이면 그 자리에서 다시 입력). **일반 모드는 닉네임이 필요 없다.** 닉네임 저장은 `shared/lib/nickname.ts`(구름 광장과 같은 키 `cloudle.nickname`). 스테이지를 깨면 별은 먼저 `localStorage`에 저장하고 `submitScore`로 랭킹에 올린다(실패해도 진행은 유지, 안내만 표시). `RankingCard`가 전체/레벨별 상위 10명과 내 순위를 보여 준다.
- **밸런스:** 스테이지 수치는 `node scripts/sim-trail.mjs [판 수] [수당 생각 시간]`(랜덤·중간·그리디 봇)으로 확인한다. 수치를 바꾸면 이 스크립트와 `pnpm test:puzzle`을 다시 돌린다.
- 입력은 탭 2번·밀기·키보드(Enter + 방향키) 모두 지원. 오버레이·배너는 타일보다 위(`z-index`)여야 한다(타일 z-index 1~5, 배너 10, 오버레이 20).
- 환경 수치가 아닌 **게임 규칙 수치**만 쓴다. 실제 분리배출 기준은 지역마다 달라서 "클라우드 랩에서 확인" 안내를 항상 붙인다.

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
