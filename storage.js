/* =========================================================
   storage.js — 데이터 접근 계층 (Storage Layer)
   ---------------------------------------------------------
   모든 데이터 읽기/쓰기는 이 계층을 통해서만 이루어진다.
   지금은 localStorage에 저장하지만, 나중에 로그인 + 백엔드가
   생기면 이 파일의 내부 구현만 API 호출로 교체하면 되고
   화면(app.js) 코드는 거의 그대로 재사용할 수 있다.

   확장 대비 설계 포인트:
   - 모든 데이터는 "현재 사용자(userId)" 아래에 저장된다.
     지금은 userId = "local" 고정. 로그인 도입 시 실제 사용자
     ID로 바꾸면 사용자별로 데이터가 자연스럽게 분리된다.
   - 데이터 키에 스키마 버전(v1)을 포함해 향후 마이그레이션 대비.
   ========================================================= */
(function (global) {
  "use strict";

  var NS = "sci"; // namespace
  var SCHEMA = "v1";

  /* 현재 사용자. 로그인 도입 전까지는 익명 로컬 사용자. */
  var currentUserId = "local";

  function key(kind) {
    // 예: sci:v1:local:records
    return [NS, SCHEMA, currentUserId, kind].join(":");
  }

  function readJSON(k, fallback) {
    try {
      var raw = localStorage.getItem(k);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }
  function writeJSON(k, val) {
    localStorage.setItem(k, JSON.stringify(val));
  }

  var Store = {
    /* ---- 사용자 세션 (로그인 확장 지점) ---- */
    getUserId: function () { return currentUserId; },
    setUserId: function (id) { currentUserId = id || "local"; },

    /* ---- 프로필 ---- */
    getProfile: function () {
      return readJSON(key("profile"), {});
    },
    saveProfile: function (profile) {
      var p = Object.assign({}, profile, {
        userId: currentUserId,
        updatedAt: new Date().toISOString()
      });
      writeJSON(key("profile"), p);
      return p;
    },

    /* ---- 일일 기록 (날짜별 map) ---- */
    getRecords: function () {
      return readJSON(key("records"), {});
    },
    getRecord: function (date) {
      return this.getRecords()[date] || null;
    },
    saveRecord: function (record) {
      var records = this.getRecords();
      record.userId = currentUserId;
      record.updatedAt = new Date().toISOString();
      records[record.date] = record;
      writeJSON(key("records"), records);
      return record;
    },
    deleteRecord: function (date) {
      var records = this.getRecords();
      delete records[date];
      writeJSON(key("records"), records);
    },
    /* 최신 날짜순 배열 */
    listRecords: function () {
      var records = this.getRecords();
      return Object.keys(records)
        .sort(function (a, b) { return a < b ? 1 : -1; })
        .map(function (k) { return records[k]; });
    },

    /* ---- 기능평가 설문 (배열, 시간순으로 쌓임) ---- */
    getSurveys: function () {
      return readJSON(key("surveys"), []);
    },
    /* 오래된 → 최신 순으로 정렬 반환 */
    listSurveys: function () {
      return this.getSurveys().slice().sort(function (a, b) {
        return a.createdAt < b.createdAt ? -1 : 1;
      });
    },
    addSurvey: function (survey) {
      var surveys = this.getSurveys();
      survey.id = "sv_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
      survey.userId = currentUserId;
      survey.createdAt = survey.createdAt || new Date().toISOString();
      // 첫 설문이면 baseline(초기 평가)로 표시
      survey.isBaseline = surveys.length === 0;
      surveys.push(survey);
      writeJSON(key("surveys"), surveys);
      return survey;
    },
    deleteSurvey: function (id) {
      var surveys = this.getSurveys().filter(function (s) { return s.id !== id; });
      // baseline이 지워졌다면 가장 오래된 것을 baseline으로 승격
      if (surveys.length && !surveys.some(function (s) { return s.isBaseline; })) {
        var sorted = surveys.slice().sort(function (a, b) {
          return a.createdAt < b.createdAt ? -1 : 1;
        });
        sorted[0].isBaseline = true;
      }
      writeJSON(key("surveys"), surveys);
    },
    hasBaseline: function () {
      return this.getSurveys().length > 0;
    },

    /* ---- 앱 설정 (온보딩 완료 여부 등) ---- */
    getSettings: function () {
      return readJSON(key("settings"), {});
    },
    saveSettings: function (patch) {
      var s = Object.assign({}, this.getSettings(), patch);
      writeJSON(key("settings"), s);
      return s;
    },

    /* ---- 목표 ---- */
    getGoals: function () {
      // 기본 목표값
      var defaults = { exMin: 150, exDays: 3, actMin: 300, recordDays: 5 };
      return Object.assign(defaults, readJSON(key("goals"), {}));
    },
    saveGoals: function (goals) {
      writeJSON(key("goals"), goals);
      return goals;
    },

    /* ---- 전체 삭제 (현재 사용자 데이터만) ---- */
    clearAll: function () {
      ["profile", "records", "surveys", "settings", "goals"].forEach(function (kind) {
        localStorage.removeItem(key(kind));
      });
    }
  };

  global.Store = Store;
})(window);
