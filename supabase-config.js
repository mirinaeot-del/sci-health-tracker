/* =========================================================
   supabase-config.js — Supabase 연결 설정
   ---------------------------------------------------------
   Publishable key는 브라우저 공개용 키이며, 실제 데이터 보호는
   Supabase의 RLS(행 수준 보안) 정책이 담당한다. (schema.sql 참조)
   ========================================================= */
(function (global) {
  "use strict";

  var SUPABASE_URL = "https://hiikwcoisbvtigijanza.supabase.co";
  var SUPABASE_KEY = "sb_publishable_KO4d_z2TXHLkpTS09d64aA_kPOFOsUD";

  // supabase-js(UMD)가 먼저 로드되어 있어야 한다 (index.html에서 CDN 로드)
  if (!global.supabase || !global.supabase.createClient) {
    console.error("[config] supabase-js 라이브러리가 로드되지 않았습니다.");
    return;
  }

  global.sb = global.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      persistSession: true,       // 세션 유지(로그인 상태 저장)
      autoRefreshToken: true,
      storageKey: "sci-health-auth"
    }
  });

  // 아이디 ↔ 내부 이메일 매핑 (이메일 인증 없이 아이디/비번처럼 사용)
  // 예: 아이디 "hong" → 내부 이메일 "hong@sci.local"
  global.ID_EMAIL_DOMAIN = "sci.local";
})(window);
