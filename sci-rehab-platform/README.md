# 척수손상(SCI) 재활 플랫폼 — 프로토타입

환자·보호자·전문가를 위한 통합 척수손상 재활 정보 플랫폼의 **1차 프로토타입**입니다.
"정보를 나열하는 홈페이지"가 아니라 **"지금 무엇을 해야 하는지 다음 걸음을 안내하는 시스템"** 을 목표로 설계했습니다.

## 핵심 설계 원칙: 콘텐츠 주도(Content-Driven)

화면 코드와 **콘텐츠 데이터가 완전히 분리**되어 있습니다.
개발을 몰라도 `data/` 폴더의 JSON만 수정/추가하면 사이트 전체에 반영됩니다.
이것이 "이후 수정·보완·발전이 수월한" 구조의 핵심입니다.

```
sandbox/
├── index.html            메인 홈페이지
├── treatments.html       치료 안내 (물리·작업·로봇·전기자극 등)
├── journey.html          재활 여정 (6단계)
├── injury-levels.html    손상수준별 가이드 (C1~L1 이하)
├── programs.html         재활 프로그램 (직종별)
├── library.html          교육자료실 (검색·필터·개인화)
├── assets/
│   ├── styles.css        공통 스타일 (의료기관 톤 + 접근성)
│   └── app.js            데이터 로더 + 공통 헤더/푸터  ← 데이터 접근의 유일한 지점
└── data/                 ★ 콘텐츠는 전부 여기 있습니다 ★
    ├── content.json      교육자료 DB (다대다 태깅)
    ├── treatments.json   치료 안내 정보
    ├── injury-levels.json 손상수준 정의
    ├── journey.json      재활 단계 정의
    └── programs.json     직종별 프로그램
```

## 실행 방법

정적 사이트라 빌드가 필요 없습니다. `fetch`로 JSON을 읽으므로 **로컬 서버**로 열어야 합니다
(브라우저에서 `file://`로 직접 열면 보안정책상 JSON 로딩이 막힙니다).

```bash
cd sandbox
python3 -m http.server 8000
# 브라우저에서 http://localhost:8000 접속
```

## 콘텐츠를 추가/수정하려면 (가장 자주 하게 될 작업)

`data/content.json`의 `items` 배열에 항목을 하나 추가하면 끝입니다.
`content.json` 안 `_schema`에 각 필드 설명이 들어 있습니다.

```jsonc
{
  "content_id": "SCI013",              // 고유 ID
  "title": "새 교육자료 제목",
  "audience": ["patient", "caregiver"],// 대상(복수 가능)
  "injury_level": ["C6", "C7"],        // 손상수준 태그(복수). "all"이면 전체
  "stage": ["intensive"],              // 재활단계 태그(복수). "all"이면 전체
  "area": ["adl", "at"],               // 영역 태그(복수)
  "level": "basic",                    // basic|intermediate|advanced
  "type": "video",                     // video|document|guide
  "description": "요약 설명",
  "video_url": "", "document_url": "",
  "related": ["SCI002"],               // 관련 콘텐츠 ID
  "author": "작업치료",
  "reviewer": "재활의학과",
  "review_status": "approved",         // draft|in_review|approved
  "review_due_date": "2027-06-01",     // 재검토 예정일(의료정보 최신성)
  "updated_at": "2026-09-18",
  "visibility": "public"               // public|restricted|hidden
}
```

### 태그(다대다)가 이 플랫폼의 엔진입니다
- 한 콘텐츠에 여러 `injury_level` / `stage` / `area`를 붙일 수 있습니다.
- 같은 영상을 손상수준마다 중복 등록할 필요가 없습니다.
- 손상수준 가이드, 재활 여정, 교육자료실 필터가 **모두 이 태그로 자동 연결**됩니다.

사용 가능한 태그 값:
- `area`: sci, adl, wheelchair, skin, bladder, bowel, exercise, transfer, discharge, at, community
- `injury_level`: C1-C4, C5, C6, C7, C8-T1, T2-T6, T7-T12, L1-below, `all`
- `stage`: acute, early, intensive, discharge-prep, community, long-term, `all`
- `audience`: patient, caregiver, professional

## 반영된 안전·접근성 요소 (SCI 플랫폼 필수)

- **임상 검토 상태**: 콘텐츠마다 `review_status`, `review_due_date`. 검토 미완료 자료는 화면에 "검토중" 배지 + 주의 안내.
- **면책 문구**: 모든 페이지 하단 고정, 응급 상황 안내 포함.
- **응급 정보 강조**: 자율신경반사이상(AD) 등 응급 신호 콘텐츠 포함.
- **"모르겠어요" 경로**: 손상수준/단계를 모를 때 의료진 확인으로 안내.
- **접근성(WCAG 지향)**: 큰 터치 타깃(44px+), 키보드 포커스 표시, 본문 바로가기, 고대비 모드, 글자 크게 모드, 시맨틱 마크업, `aria-live` 안내.

## 이후 발전 경로

이 구조는 그대로 확장 가능하도록 설계했습니다.

1. **콘텐츠 확충** — `data/*.json`에 실제 센터 자료·영상 URL 추가.
2. **화면 추가** — 기존 페이지를 템플릿 삼아 ADL/휠체어/보호자교육 전용 페이지 확장.
3. **실제 백엔드 연결** — `assets/app.js`의 `SCIStore`가 데이터 접근의 **유일한 지점**입니다.
   여기 내부를 `fetch('data/*.json')`에서 Supabase/REST API 호출로 바꾸면
   화면 코드는 **수정 없이** 그대로 동작합니다.
4. **로그인·개인화** — 환자/보호자/전문가 대시보드, 평가·목표·치료 관리(개인정보 → RLS·동의·감사로그 필요).
5. **AI 도우미** — 검토된 콘텐츠 기반 RAG. `content.json`이 이미 태그·검토상태를 갖춰 근거 데이터로 바로 활용 가능.

> ⚠️ 현재 프로토타입은 **개인정보를 저장하지 않는 공개 콘텐츠 단계**입니다.
> 환자 개인정보(평가·치료 기록)를 다루는 시점에는 개인정보보호법·의료법 대응(동의 관리, 접근 감사 로그, 데이터 보관·파기 정책, Row Level Security)이 반드시 선행되어야 합니다.
