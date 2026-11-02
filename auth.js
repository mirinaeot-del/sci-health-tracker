/* =========================================================
   auth.js — 인증 계층 (Supabase Auth 기반)
   가입 / 로그인 / 로그아웃 / 현재 사용자 / 프로필 관리.
   아이디/비밀번호 방식 (아이디 → 내부 이메일로 변환).
   ========================================================= */
(function (global) {
  "use strict";

  function idToEmail(username) {
    var id = String(username || "").trim().toLowerCase();
    // 이미 이메일 형태면 그대로, 아니면 @sci.local 붙임
    return id.indexOf("@") >= 0 ? id : (id + "@" + global.ID_EMAIL_DOMAIN);
  }

  var Auth = {
    /* ---- 가입 ----
       아이디/비번/닉네임(필수) + 손상레벨/정도/발병일(선택) */
    signup: function (username, password, extra) {
      extra = extra || {};
      var email = idToEmail(username);
      return global.sb.auth.signUp({
        email: email,
        password: password,
        options: {
          data: {
            nickname: extra.nickname || username,
            injury_level: extra.injuryLevel || "",
            injury_degree: extra.injuryDegree || "",
            onset_date: extra.onsetDate || ""
          }
        }
      }).then(function (res) {
        if (res.error) throw res.error;
        return res.data;
      });
    },

    /* ---- 로그인 ---- */
    login: function (username, password) {
      return global.sb.auth.signInWithPassword({
        email: idToEmail(username),
        password: password
      }).then(function (res) {
        if (res.error) throw res.error;
        return res.data;
      });
    },

    /* ---- 로그아웃 ---- */
    logout: function () {
      return global.sb.auth.signOut();
    },

    /* ---- 현재 세션/사용자 ---- */
    getSession: function () {
      return global.sb.auth.getSession().then(function (r) { return r.data.session; });
    },
    getUser: function () {
      return global.sb.auth.getUser().then(function (r) { return r.data.user; });
    },

    /* ---- 내 프로필 조회 ---- */
    getMyProfile: function () {
      return global.sb.auth.getUser().then(function (r) {
        var user = r.data.user;
        if (!user) return null;
        return global.sb.from("profiles").select("*").eq("id", user.id).single()
          .then(function (p) { return p.data; });
      });
    },

    /* ---- 프로필 수정 (닉네임/손상정보/비교동의) ---- */
    updateProfile: function (patch) {
      return global.sb.auth.getUser().then(function (r) {
        var user = r.data.user;
        if (!user) throw new Error("로그인이 필요합니다.");
        patch.updated_at = new Date().toISOString();
        return global.sb.from("profiles").update(patch).eq("id", user.id)
          .then(function (res) { if (res.error) throw res.error; return true; });
      });
    },

    /* ---- 관리자 여부 ---- */
    isAdmin: function () {
      return this.getMyProfile().then(function (p) { return !!(p && p.role === "admin"); });
    },

    /* ---- 인증 상태 변화 구독 ---- */
    onChange: function (cb) {
      return global.sb.auth.onAuthStateChange(function (_event, session) { cb(session); });
    }
  };

  global.Auth = Auth;
})(window);
