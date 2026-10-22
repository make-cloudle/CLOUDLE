# 백엔드 배포 가이드 — Oracle Cloud(무료) + Docker

> 구성: **프론트 = Vercel**(`https://cloudle.vercel.app`) · **백엔드 = Oracle Cloud VM 1대**(Docker Compose)
> 브라우저 → `https://<API 도메인>`(Caddy, 443) → gateway(:4000, HTTP + **WebSocket**) → rag(:8000, 외부 비공개)

```
Vercel(프론트) ──https/wss──▶ Caddy ──▶ gateway ──▶ rag(Python)
                              :80/:443    :4000       :8000   ← 서버 안에서만 통신
```

외부에 열리는 포트는 **80/443뿐**입니다(4000·8000은 열지 않음).

---

## 1. 만들어 둔 파일

| 파일 | 역할 |
|---|---|
| `backend/api-gateway/Dockerfile` | NestJS 빌드(멀티 스테이지, 비루트 실행, 헬스체크) |
| `backend/rag-service/Dockerfile` + `docker-entrypoint.sh` | Python RAG 엔진. 시작할 때 품목 152건을 자동 색인(해싱 임베딩이라 모델 다운로드 없음) |
| `docker-compose.yml` | caddy + gateway + rag, 색인·토큰 사용량은 볼륨에 보관 |
| `deploy/Caddyfile` | 자동 HTTPS(Let's Encrypt) + WebSocket 프록시 + SSE 즉시 전달 |
| `.env.example` | 배포 설정 견본 (`API_DOMAIN`, `CORS_ORIGINS`, `GMS_KEY`) |

## 2. Oracle Cloud 서버 만들기

1. Oracle Cloud 가입(신용카드 본인 확인이 필요하지만 Always Free 범위면 과금되지 않음) → 리전은 가까운 곳(서울/춘천 등).
2. **Compute → Instances → Create**
   - Image: **Ubuntu 22.04**
   - Shape: **Ampere A1 (VM.Standard.A1.Flex) — 1~2 OCPU / 6~12GB** (Always Free 한도 안). 이 프로젝트는 1 OCPU / 6GB로도 충분합니다.
   - 인스턴스가 `Out of host capacity`로 안 만들어지면 시간대를 바꿔 다시 시도하거나, AMD `E2.1.Micro`(1GB)를 쓰되 **스왑 2GB**를 만드세요(아래 7번).
   - SSH 키를 내려받아 보관, **Reserved Public IP**를 붙여 재시작해도 주소가 안 바뀌게 하세요.
3. **네트워크 열기 (두 곳 모두 필요 — 가장 많이 막히는 부분)**
   - ① OCI 콘솔: VCN → Security List(또는 NSG) → **Ingress 규칙 추가**: TCP **80**, **443** (Source `0.0.0.0/0`). 22(SSH)는 내 IP로 제한 권장.
   - ② 서버 안의 방화벽: Oracle의 Ubuntu 이미지는 iptables가 80/443을 막고 있습니다.
     ```bash
     sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80  -j ACCEPT
     sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
     sudo netfilter-persistent save
     ```
   - 4000·8000은 **열지 않습니다.**

## 3. Docker 설치 (서버에서)

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER      # 로그아웃 후 다시 접속
docker compose version
```

## 4. 도메인 (HTTPS 필수)

Vercel(https)이 `http://`·`ws://` 서버를 부르면 브라우저가 막습니다(혼합 콘텐츠). 그래서 **HTTPS 도메인**이 있어야 합니다.

- **추천: DuckDNS(무료)** — duckdns.org에서 `cloudle-api` 같은 이름을 만들고 IP에 서버 공인 IP를 입력 → `cloudle-api.duckdns.org`
- 간단히 시험만: `<공인IP를 -로 바꾼 값>.sslip.io` (예: `129-154-1-2.sslip.io`) — 가입 없이 쓸 수 있지만 공용 도메인이라 인증서 발급 한도에 걸릴 수 있습니다.
- 내 도메인이 있으면 A 레코드를 서버 IP로.

## 5. 배포

```bash
git clone https://github.com/make-cloudle/CLOUDLE.git && cd CLOUDLE      # 비공개 저장소면 토큰/Deploy key 필요
cp .env.example .env
nano .env        # API_DOMAIN, (필요하면) CORS_ORIGINS, GMS_KEY 입력
docker compose up -d --build
docker compose ps                  # 세 서비스가 healthy/running 인지
docker compose logs -f gateway     # "CLOUDLE gateway → ... (ws: /community)" 확인
```

확인:
```bash
curl https://<API 도메인>/api/health
# {"gateway":"ok","engine":{"ok":true,"offline":...,"item_meta":152,...}}
```
처음에는 Caddy가 인증서를 받느라 1분쯤 걸릴 수 있습니다(`docker compose logs caddy`).

업데이트: `git pull && docker compose up -d --build`

## 6. 프론트(Vercel)에 백엔드 주소 알려주기

Vercel 프로젝트 → Settings → Environment Variables:

| 이름 | 값 |
|---|---|
| `NEXT_PUBLIC_API_BASE` | `https://<API 도메인>` (끝에 `/` 없이) |

- Root Directory는 `frontend`, 패키지 매니저는 pnpm.
- **`NEXT_PUBLIC_*`는 빌드할 때 박힙니다.** 값을 넣거나 바꾼 뒤에는 **Redeploy** 해야 반영됩니다.
- 값을 넣지 않으면 프론트가 "현재 주소의 :4000"으로 접속을 시도해 Vercel에서는 실패합니다.
- Vercel **미리보기 배포** 주소(`cloudle-git-xxx.vercel.app`)에서도 쓰려면 서버 `.env`의 `CORS_ORIGINS`에 쉼표로 추가하세요. 허용 목록에 없는 주소는 HTTP(CORS)와 **WebSocket 모두** 거절됩니다.

## 7. 운영 팁·주의

- **채팅 기록은 메모리**에 있어서 `docker compose restart gateway`나 서버 재시작 시 사라집니다. 인스턴스를 **2개 이상으로 늘리면 안 됩니다**(방 목록·소켓이 인스턴스마다 따로 놀음). 늘리려면 저장소·방송 어댑터를 Redis로 바꿔야 합니다(`backend/AGENTS.md` §2-1).
- **게스트 이름:** 개발 때 "포트 = 지구미/예나"는 운영에서 꺼져 있고(`COMMUNITY_IDENTITIES` 비움), 사용자는 브라우저마다 `구름손님XXXX`(세션 ID 앞 4글자)로 보입니다. 식별은 세션 ID 전체라 앞 4글자가 같아도 다른 사람입니다. 닉네임 입력·로그인이 필요하면 `IdentityPort` 어댑터만 바꾸면 됩니다.
- **토큰 예산:** `GMS_KEY`를 비우면 LLM 없이 오프라인으로 동작합니다. 예산·사용량은 `rag_storage` 볼륨의 `llm_usage.json`에 남습니다(컨테이너를 다시 만들어도 유지). SSAFY GMS 키가 학교 밖 서버에서도 쓸 수 있는지는 확인이 필요합니다.
- **스왑(1GB 서버용):** `sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile`
- **Always Free 유휴 회수:** Oracle은 오랫동안 거의 쓰지 않는 Always Free 인스턴스를 회수할 수 있다고 안내합니다. 사용 정책을 확인하고, 중요한 데이터는 서버에만 두지 마세요(이 프로젝트의 서버 데이터는 재생성 가능한 색인과 사용량 기록뿐입니다).
- **로그·상태:** `docker compose logs -f`, `docker stats`
- **비밀 값:** `.env`는 git에 올리지 않습니다(`.gitignore`에 포함). `GMS_KEY`는 서버의 `.env`에만 둡니다.

## 8. 문제 해결

| 증상 | 확인 |
|---|---|
| 접속이 안 됨(시간 초과) | 2-③의 **OCI Ingress + 서버 iptables 둘 다** 열었는지, `sudo ss -tlnp \| grep -E ':80\|:443'` |
| 인증서가 안 나옴 | `docker compose logs caddy` — 도메인이 서버 공인 IP를 가리키는지(`nslookup`), 80번 포트가 열려 있는지 |
| 브라우저에 CORS 오류 | 서버 `.env`의 `CORS_ORIGINS`가 프론트 주소와 **정확히** 같은지(`https://`, 슬래시 없음), 수정 후 `docker compose up -d` |
| 채팅이 "연결이 끊겼어요" | `NEXT_PUBLIC_API_BASE`가 `https://…`인지(Redeploy 했는지), 개발자 도구 Network → WS 요청의 상태 |
| `rag` 빌드가 ARM에서 실패 | `chroma-hnswlib` 컴파일 오류면 `backend/rag-service/Dockerfile`의 `pip install` 앞에 `RUN apt-get update && apt-get install -y --no-install-recommends build-essential && rm -rf /var/lib/apt/lists/*` 추가 |
