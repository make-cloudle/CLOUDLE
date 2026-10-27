import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { LEVELS, type Player } from "../domain/ranking";
import { RankingStorePort } from "../ports/ranking-store.port";

/**
 * 메모리에 들고 있다가 JSON 파일에 저장한다(변경 후 0.5초 모아서, 임시 파일에 쓴 뒤 교체).
 * 파일 경로가 비어 있으면(테스트) 저장하지 않는다. 파일이 깨졌으면 `.bad`로 옮기고 비어 있는 상태로 시작한다.
 */
@Injectable()
export class FileRankingStore extends RankingStorePort implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger("RankingStore");
  private readonly players = new Map<string, Player>();
  private readonly file: string;
  private timer: NodeJS.Timeout | null = null;

  constructor(@Inject(ConfigService) config: ConfigService) {
    super();
    this.file = config.get<string>("rankingFile") ?? "";
  }

  onModuleInit() {
    if (!this.file || !existsSync(this.file)) return;
    try {
      const data = JSON.parse(readFileSync(this.file, "utf8")) as { players?: Player[] };
      for (const p of data.players ?? []) if (isPlayer(p)) this.players.set(p.id, p);
      this.log.log(`랭킹 ${this.players.size}명을 불러왔어요.`);
    } catch (e) {
      this.log.warn(`랭킹 파일을 읽지 못해 새로 시작해요 (${e instanceof Error ? e.message : e})`);
      try { renameSync(this.file, `${this.file}.bad`); } catch { /* 옮기지 못해도 계속 */ }
    }
  }

  onModuleDestroy() { this.flush(); }

  all() { return [...this.players.values()]; }
  get(id: string) { return this.players.get(id); }
  put(player: Player) {
    this.players.set(player.id, player);
    if (this.file && !this.timer) this.timer = setTimeout(() => this.flush(), 500);
  }

  private flush() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (!this.file) return;
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      writeFileSync(tmp, JSON.stringify({ players: this.all() }), "utf8");
      renameSync(tmp, this.file);
    } catch (e) {
      this.log.error(`랭킹을 저장하지 못했어요 (${e instanceof Error ? e.message : e})`);
    }
  }
}

function isPlayer(p: unknown): p is Player {
  const x = p as Player;
  return !!x && typeof x.id === "string" && typeof x.nickname === "string" && typeof x.updatedAt === "number"
    && !!x.stages && LEVELS.every((l) => Array.isArray(x.stages[l]) && x.stages[l].length === 10);
}
