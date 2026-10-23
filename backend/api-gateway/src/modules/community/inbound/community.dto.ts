import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, Length, Matches, ValidateNested } from "class-validator";
import { REACTIONS } from "../domain/community.types";

/* WebSocket 페이로드도 HTTP와 같은 class-validator 규칙으로 검증한다. */
const ROOM_ID = /^[a-z0-9-]{2,24}$/;

export class RoomRefDto {
  @Matches(ROOM_ID) roomId!: string;
}

export class JoinDto extends RoomRefDto {
  /** 비우면 지금 이름 그대로 참여 */
  @IsOptional() @IsString() @Length(1, 40) nickname?: string;
}

export class SendTextDto extends RoomRefDto {
  @IsString() @Length(1, 1000) text!: string;
}

export class TypingDto extends RoomRefDto {
  @IsBoolean() typing!: boolean;
}

export class ReactDto extends RoomRefDto {
  @IsString() @Length(8, 64) messageId!: string;
  @IsIn(REACTIONS as unknown as string[]) reaction!: (typeof REACTIONS)[number];
}

export class MemoDto {
  @IsString() @Length(0, 60) product_name!: string;
  @IsString() @Length(0, 120) condition!: string;
  @IsString() @Length(0, 30) region!: string;
  @IsIn(["all", "repair", "reuse", "resell", "disposal"]) purpose!: "all" | "repair" | "reuse" | "resell" | "disposal";
  @IsString() @Length(0, 800) note!: string;
}

export class ShareMemoDto extends RoomRefDto {
  @ValidateNested() @Type(() => MemoDto) memo!: MemoDto;
}

export class BucketSourceDto {
  @IsString() @Length(1, 120) title!: string;
  @IsString() @Length(0, 500) url!: string;
}

export class BucketDto {
  @IsString() @Length(1, 80) title!: string;
  @IsString() @Length(0, 60) item!: string;
  @IsIn(["result", "reuse", "repair", "disposal", "basic_info"]) kind!: "result" | "reuse" | "repair" | "disposal" | "basic_info";
  @IsString() @Length(1, 1200) text!: string;
  @IsArray() @ArrayMaxSize(3) @ValidateNested({ each: true }) @Type(() => BucketSourceDto) sources!: BucketSourceDto[];
}

export class ShareBucketDto extends RoomRefDto {
  @ValidateNested() @Type(() => BucketDto) bucket!: BucketDto;
}

export class SummarizeDto extends RoomRefDto {
  @IsOptional() @IsIn(["ko", "en", "ja", "zh"]) lang = "ko";
  @IsOptional() @IsString() @Length(1, 30) region?: string;
}
