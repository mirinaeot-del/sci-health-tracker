/* =========================================================
   storage.js — 데이터 접근 계층 (Supabase 기반 + 메모리 캐시)
   ---------------------------------------------------------
   설계: 화면(app.js)은 기존처럼 동기 인터페이스로 읽는다.
   - Store.init(): 로그인 후 서버에서 내 데이터를 캐시에 로드
   - 읽기: 캐시에서 동기 반환
   - 쓰기: 캐시 즉시 갱신 + 서버에 비동기 upsert/delete
   Supabase 접근은 전역 sb (supabase-config.js) 사용.
   ========================================================= */
(function (global) {
  "use strict";

  var cache = {
    userId: null,
    profile: {},          // {nickname, injury_level, injury_degree, onset_date, role, share_compare,...}
    records: {},          // { 'YYYY-MM-DD': {date, mood, pain, ...} }
    surveys: [],          // [{id, answers, ...}]
    goals: null,          // {exMin, exDays, actMin, recordDays}
    settings: {}          // 온보딩 등 (localStorage 보조)
  };

  function settingsKey() { return "sci:v2:settings:" + (cache.userId || "anon"); }
  function loadSettings() {
    try { return JSON.parse(localStorage.getItem(settingsKey()) || "{}"); } catch (e) { return {}; }
  }
  function saveSettingsLS() { localStorage.setItem(settingsKey(), JSON.stringify(cache.settings)); }

  // 서버 record row(data jsonb) → 화면용 평탄 객체
  function rowToRecord(row) {
    var d = row.data || {};
    return {
      date: row.record_date,
      mood: d.mood != null ? d.mood : null,
      pain: d.pain || 0, spasticity: d.spasticity || 0,
      urine: d.urine || 0, bowel: d.bowel || 0,
      skin: d.skin || null,
      exercises: d.exercises || [], activities: d.activities || [],
      memo: d.memo || ""
    };
  }
  function recordToData(r) {
    return {
      mood: r.mood, pain: r.pain, spasticity: r.spasticity,
      urine: r.urine, bowel: r.bowel, skin: r.skin,
      exercises: r.exercises || [], activities: r.activities || [], memo: r.memo || ""
    };
  }

  var Store = {
    /* ===== 초기화: 로그인 후 서버 데이터 로드 ===== */
    init: function (userId) {
      cache.userId = userId;
      cache.settings = loadSettings();
      return Promise.all([
        global.sb.from("profiles").select("*").eq("id", userId).single(),
        global.sb.from("records").select("*").eq("user_id", userId),
        global.sb.from("surveys").select("*").eq("user_id", userId).order("created_at", { ascending: true }),
        global.sb.from("goals").select("*").eq("user_id", userId).maybeSingle()
      ]).then(function (res) {
        cache.profile = res[0].data || {};
        cache.records = {};
        (res[1].data || []).forEach(function (row) { cache.records[row.record_date] = rowToRecord(row); });
        cache.surveys = (res[2].data || []).map(function (s) {
          return { id: s.id, answers: s.answers, totalScore: s.total_score, totalMax: s.total_max,
                   isBaseline: s.is_baseline, createdAt: s.created_at };
        });
        var g = res[3].data;
        cache.goals = g ? { exMin: g.ex_min, exDays: g.ex_days, actMin: g.act_min, recordDays: g.record_days } : null;
      });
    },

    getUserId: function () { return cache.userId; },

    /* ===== 프로필 =====
       name: 본명(본인·관리자 전용), nick: 닉네임(제3자 표시) */
    getProfile: function () {
      var p = cache.profile || {};
      return {
        name: p.name || "", nick: p.nickname || "", id: p.username || "",
        level: p.injury_level || "", completeness: p.injury_degree || "",
        injuryDate: p.onset_date || "",
        role: p.role || "user", shareCompare: !!p.share_compare
      };
    },
    saveProfile: function (profile) {
      var patch = {};
      if ("name" in profile) { patch.name = profile.name; cache.profile.name = profile.name; }
      if ("nick" in profile) { patch.nickname = profile.nick; cache.profile.nickname = profile.nick; }
      if ("level" in profile) { patch.injury_level = profile.level; cache.profile.injury_level = profile.level; }
      if ("completeness" in profile) { patch.injury_degree = profile.completeness; cache.profile.injury_degree = profile.completeness; }
      if ("injuryDate" in profile) { patch.onset_date = profile.injuryDate || null; cache.profile.onset_date = profile.injuryDate; }
      if ("shareCompare" in profile) { patch.share_compare = !!profile.shareCompare; cache.profile.share_compare = !!profile.shareCompare; }
      patch.updated_at = new Date().toISOString();
      return global.sb.from("profiles").update(patch).eq("id", cache.userId);
    },

    /* 제3자(비교)에게 보여줄 표시 이름: 닉네임 우선, 없으면 본명 */
    displayName: function (profileRow) {
      return (profileRow && (profileRow.nickname || profileRow.name)) || "익명";
    },

    /* ===== 일일 기록 ===== */
    getRecords: function () { return cache.records; },
    getRecord: function (date) { return cache.records[date] || null; },
    listRecords: function () {
      return Object.keys(cache.records)
        .sort(function (a, b) { return a < b ? 1 : -1; })
        .map(function (k) { return cache.records[k]; });
    },
    saveRecord: function (record) {
      cache.records[record.date] = record;            // 캐시 즉시
      global.sb.from("records").upsert({               // 서버 비동기
        user_id: cache.userId, record_date: record.date,
        data: recordToData(record), updated_at: new Date().toISOString()
      }, { onConflict: "user_id,record_date" }).then(function (res) {
        if (res.error) console.error("[records upsert]", res.error);
      });
      return record;
    },
    deleteRecord: function (date) {
      delete cache.records[date];
      global.sb.from("records").delete().eq("user_id", cache.userId).eq("record_date", date)
        .then(function (res) { if (res.error) console.error("[records delete]", res.error); });
    },

    /* ===== 설문 ===== */
    getSurveys: function () { return cache.surveys; },
    listSurveys: function () {
      return cache.surveys.slice().sort(function (a, b) { return a.createdAt < b.createdAt ? -1 : 1; });
    },
    hasBaseline: function () { return cache.surveys.length > 0; },
    addSurvey: function (survey) {
      survey.isBaseline = cache.surveys.length === 0;
      survey.createdAt = new Date().toISOString();
      // 임시 id (서버 저장 후 교체)
      survey.id = "tmp_" + Date.now();
      cache.surveys.push(survey);
      global.sb.from("surveys").insert({
        user_id: cache.userId, answers: survey.answers,
        total_score: survey.totalScore, total_max: survey.totalMax,
        is_baseline: survey.isBaseline, created_at: survey.createdAt
      }).select().single().then(function (res) {
        if (res.error) { console.error("[survey insert]", res.error); return; }
        survey.id = res.data.id; // 실제 id 반영
      });
      return survey;
    },
    deleteSurvey: function (id) {
      cache.surveys = cache.surveys.filter(function (s) { return s.id !== id; });
      if (!cache.surveys.some(function (s) { return s.isBaseline; }) && cache.surveys.length) {
        cache.surveys.slice().sort(function (a, b) { return a.createdAt < b.createdAt ? -1 : 1; })[0].isBaseline = true;
      }
      if (String(id).indexOf("tmp_") !== 0) {
        global.sb.from("surveys").delete().eq("id", id)
          .then(function (res) { if (res.error) console.error("[survey delete]", res.error); });
      }
    },

    /* ===== 목표 ===== */
    getGoals: function () {
      return cache.goals || { exMin: 150, exDays: 3, actMin: 300, recordDays: 5 };
    },
    saveGoals: function (goals) {
      cache.goals = goals;
      global.sb.from("goals").upsert({
        user_id: cache.userId, ex_min: goals.exMin, ex_days: goals.exDays,
        act_min: goals.actMin, record_days: goals.recordDays, updated_at: new Date().toISOString()
      }, { onConflict: "user_id" }).then(function (res) {
        if (res.error) console.error("[goals upsert]", res.error);
      });
      return goals;
    },

    /* ===== 앱 설정 (온보딩 등, 로컬 보조) ===== */
    getSettings: function () { return cache.settings; },
    saveSettings: function (patch) {
      cache.settings = Object.assign({}, cache.settings, patch);
      saveSettingsLS();
      return cache.settings;
    },

    /* ===== 관리자/비교: 여러 사용자 조회 ===== */
    // 관리자: 전체 프로필 + 기록 요약
    fetchAllUsers: function () {
      return global.sb.from("profiles").select("*").then(function (r) { return r.data || []; });
    },
    // 특정 사용자의 기록 (관리자/비교 공유 범위에서 RLS가 허용)
    fetchUserRecords: function (userId) {
      return global.sb.from("records").select("*").eq("user_id", userId)
        .then(function (r) { return (r.data || []).map(rowToRecord); });
    },
    fetchUserSurveys: function (userId) {
      return global.sb.from("surveys").select("*").eq("user_id", userId).order("created_at", { ascending: true })
        .then(function (r) {
          return (r.data || []).map(function (s) {
            return { id: s.id, answers: s.answers, totalScore: s.total_score, totalMax: s.total_max,
                     isBaseline: s.is_baseline, createdAt: s.created_at };
          });
        });
    },
    // 비교 공유 동의한 사용자들 (본인 포함)
    fetchComparePeers: function () {
      return global.sb.from("profiles").select("*").eq("share_compare", true)
        .then(function (r) { return r.data || []; });
    },

    /* 로그아웃 시 캐시 비우기 */
    clearCache: function () {
      cache = { userId: null, profile: {}, records: {}, surveys: [], goals: null, settings: {} };
    }
  };

  global.Store = Store;
})(window);
