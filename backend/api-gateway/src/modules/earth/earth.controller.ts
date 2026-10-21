import { Body, Controller, Get, Param, ParseBoolPipe, Post, Query, UseGuards } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { IsIn, IsOptional, Matches } from "class-validator";
import { SessionGuard, SessionId } from "../../core/session";
import { EarthService, type Indicator, type Topic } from "./earth.service";

const LANGS = ["ko", "en", "ja", "zh"];

class AskCountryDto {
  @IsIn(["air", "waste", "help"]) topic!: Topic;
  @IsOptional() @IsIn(LANGS) lang = "ko";
}

class Iso3Param {
  @Matches(/^[A-Z]{3}$/) iso3!: string;
}

@Controller("api")
export class EarthController {
  constructor(private readonly earth: EarthService) {}

  @SkipThrottle()
  @Get("sos")
  sos() {
    return this.earth.sos();
  }

  @SkipThrottle()
  @Get("country/:iso3")
  briefing(@Param() p: Iso3Param, @Query("lang") lang = "ko", @Query("detail", new ParseBoolPipe({ optional: true })) detail = false) {
    return this.earth.briefing(p.iso3, LANGS.includes(lang) ? lang : "ko", detail);
  }

  @SkipThrottle()
  @Get("country/:iso3/series")
  series(@Param() p: Iso3Param, @Query("indicator") indicator: Indicator = "pm25") {
    return this.earth.timeline(p.iso3, (["pm25", "population", "forest"] as const).includes(indicator) ? indicator : "pm25");
  }

  @UseGuards(SessionGuard)
  @Post("country/:iso3/ask")
  ask(@Param() p: Iso3Param, @Body() body: AskCountryDto, @SessionId() sid: string) {
    return this.earth.ask(p.iso3, body.topic, body.lang, sid);
  }
}
