"""Streamlit UI 문자열 (ko · en · ja · zh)."""
from __future__ import annotations

import streamlit as st

LANGS = {"ko": "한국어", "en": "English", "ja": "日本語", "zh": "中文"}

S: dict[str, dict[str, str]] = {
    "tagline": {"ko": "물건 하나부터 조금씩 더 푸르게", "en": "Greener, one thing at a time",
                "ja": "ひとつのモノから、少しずつ緑に", "zh": "从一件物品开始，让地球更绿"},
    "nav_analyze": {"ko": "물건 분석", "en": "Analyze", "ja": "モノ分析", "zh": "物品分析"},
    "nav_explore": {"ko": "조건 탐색", "en": "Explore", "ja": "条件で探す", "zh": "条件搜索"},
    "nav_earth": {"ko": "지구 환경", "en": "Earth", "ja": "地球環境", "zh": "地球环境"},
    "nav_status": {"ko": "데이터·색인", "en": "Data & index", "ja": "データ・索引", "zh": "数据与索引"},
    "language": {"ko": "언어", "en": "Language", "ja": "言語", "zh": "语言"},
    "offline_title": {"ko": "오프라인 모드", "en": "Offline mode", "ja": "オフラインモード", "zh": "离线模式"},
    "offline_body": {
        "ko": "LLM API 키가 없어 규칙 기반 검색어·문서 발췌로 답해요. 근거 표시는 동일하게 동작해요.",
        "en": "No LLM API key: queries are rule-based and answers are excerpts from sources (in Korean). Citations still work.",
        "ja": "LLMキーがないため、ルールベースの検索と文書の抜粋（韓国語）で回答します。根拠表示は同じです。",
        "zh": "未设置 LLM 密钥：使用规则检索并摘录原文（韩语）作答，引用依然有效。"},
    "paper_title": {"ko": "종이에 적기", "en": "Write it on paper", "ja": "紙に書く", "zh": "写在纸上"},
    "product": {"ko": "물건 이름", "en": "Item name", "ja": "モノの名前", "zh": "物品名称"},
    "product_ph": {"ko": "예: 무선 이어폰", "en": "e.g. wireless earbuds", "ja": "例：ワイヤレスイヤホン", "zh": "例如：无线耳机"},
    "pick_item": {"ko": "목록에서 고르기 (선택)", "en": "Or pick from list", "ja": "リストから選ぶ（任意）", "zh": "或从列表选择"},
    "condition": {"ko": "상태", "en": "Condition", "ja": "状態", "zh": "状态"},
    "condition_ph": {"ko": "예: 한쪽 작동 불량", "en": "e.g. one side not working", "ja": "例：片方が動かない", "zh": "例如：一侧不工作"},
    "region": {"ko": "지역", "en": "Region", "ja": "地域", "zh": "地区"},
    "purpose": {"ko": "무엇이 궁금한가요?", "en": "What do you want to know?", "ja": "知りたいこと", "zh": "想了解什么？"},
    "p_all": {"ko": "모든 가능성", "en": "Everything", "ja": "すべて", "zh": "全部"},
    "p_repair": {"ko": "수리", "en": "Repair", "ja": "修理", "zh": "维修"},
    "p_reuse": {"ko": "중고·재사용", "en": "Reuse", "ja": "再利用", "zh": "再利用"},
    "p_disposal": {"ko": "분리배출", "en": "Disposal", "ja": "分別", "zh": "分类投放"},
    "note": {"ko": "메모", "en": "Note", "ja": "メモ", "zh": "备注"},
    "note_ph": {"ko": "더 알려주고 싶은 내용을 적어 주세요", "en": "Anything else?", "ja": "ほかに伝えたいこと", "zh": "其他补充"},
    "attach_image": {"ko": "사진", "en": "Photo", "ja": "写真", "zh": "照片"},
    "attach_camera": {"ko": "카메라", "en": "Camera", "ja": "カメラ", "zh": "相机"},
    "attach_doc": {"ko": "파일", "en": "File", "ja": "ファイル", "zh": "文件"},
    "camera_label": {"ko": "카메라에 물건을 비춰 주세요", "en": "Show the item to your camera", "ja": "カメラにモノを映してください", "zh": "请将物品对准相机"},
    "crumple": {"ko": "구겨서 분석하기", "en": "Crumple & analyze", "ja": "丸めて分析", "zh": "揉成团并分析"},
    "clear": {"ko": "종이 비우기", "en": "Clear paper", "ja": "紙をクリア", "zh": "清空"},
    "empty_paper": {"ko": "종이에 물건 이름을 먼저 적어 주세요.", "en": "Write an item name first.", "ja": "まずモノの名前を書いてください。", "zh": "请先写下物品名称。"},
    "analyzing": {"ko": "구름이 자료를 찾고 있어요", "en": "Cloud is searching", "ja": "クラウドが資料を探しています", "zh": "云朵正在查找资料"},
    "done": {"ko": "분석 완료", "en": "Done", "ja": "完了", "zh": "完成"},
    "summary": {"ko": "요약", "en": "Summary", "ja": "要約", "zh": "摘要"},
    "basic_info": {"ko": "기본 정보", "en": "Basics", "ja": "基本情報", "zh": "基本信息"},
    "reuse": {"ko": "재사용·중고", "en": "Reuse", "ja": "再利用・中古", "zh": "再利用"},
    "repair": {"ko": "수리", "en": "Repair", "ja": "修理", "zh": "维修"},
    "disposal": {"ko": "분리배출", "en": "Disposal", "ja": "分別・回収", "zh": "分类投放"},
    "next_actions": {"ko": "다음 선택", "en": "Next steps", "ja": "次の選択", "zh": "下一步"},
    "uncertain": {"ko": "확인할 수 없었던 점", "en": "Not confirmed", "ja": "確認できなかった点", "zh": "未能确认"},
    "safety": {"ko": "배터리·유해물질이 있을 수 있어요. 분해하거나 종량제봉투에 넣지 마세요.",
               "en": "May contain batteries or hazardous parts. Don't dismantle or bin it.",
               "ja": "電池や有害物を含む可能性があります。分解したり可燃ごみに出さないでください。",
               "zh": "可能含有电池或有害物质，请勿拆解或投入普通垃圾。"},
    "sources": {"ko": "근거 자료", "en": "Sources", "ja": "根拠資料", "zh": "依据资料"},
    "chat_title": {"ko": "구름에게 더 물어보기", "en": "Ask the cloud", "ja": "クラウドに質問", "zh": "继续提问"},
    "chat_ph": {"ko": "이 물건에 대해 물어보세요 (파일·사진 첨부 가능)", "en": "Ask about this item (files allowed)",
                "ja": "このモノについて質問（ファイル添付可）", "zh": "询问此物品（可附文件）"},
    "explore_title": {"ko": "조건으로 품목 찾기", "en": "Find items by condition", "ja": "条件でモノを探す", "zh": "按条件查找物品"},
    "explore_ph": {"ko": "예: 배터리가 들어 있는 소형 전자제품 중 별도 수거가 필요한 품목",
                   "en": "e.g. small electronics with batteries that need separate collection",
                   "ja": "例：電池入りの小型家電で別回収が必要なもの", "zh": "例如：含电池且需单独回收的小型电子产品"},
    "search": {"ko": "찾기", "en": "Search", "ja": "検索", "zh": "搜索"},
    "analyze_this": {"ko": "이 물건 분석", "en": "Analyze this", "ja": "このモノを分析", "zh": "分析此物品"},
    "no_match": {"ko": "조건에 맞는 품목이 없어요.", "en": "No matching items.", "ja": "該当なし。", "zh": "没有匹配的物品。"},
    "conditions": {"ko": "해석된 조건", "en": "Parsed conditions", "ja": "解釈した条件", "zh": "解析的条件"},
    "battery": {"ko": "배터리", "en": "Battery", "ja": "電池", "zh": "电池"},
    "status_title": {"ko": "데이터와 색인 상태", "en": "Data & index status", "ja": "データと索引", "zh": "数据与索引状态"},
    "rebuild": {"ko": "색인 다시 만들기", "en": "Rebuild index", "ja": "索引を再作成", "zh": "重建索引"},
    "unknown_pick": {"ko": "이 중 어떤 물건인가요?", "en": "Which one is it?", "ja": "どれですか？", "zh": "是哪一个？"},
    "photo_hint": {"ko": "사진에서 찾은 후보", "en": "Found in photo", "ja": "写真から見つけた候補", "zh": "照片识别候选"},
}


def lang() -> str:
    return st.session_state.get("lang", "ko")


def t(key: str) -> str:
    entry = S.get(key, {})
    return entry.get(lang()) or entry.get("ko") or key
