/* =========================================================
   app.js — 건강 지킴이 (척수손상 건강기록)
   화면 로직. 데이터 접근은 전부 Store(storage.js) 경유.
   설문 정의는 SurveyData(survey-data.js).
   ========================================================= */
(function () {
  "use strict";

  /* ---------- helpers ---------- */
  function $(s) { return document.querySelector(s); }
  function $all(s) { return Array.prototype.slice.call(document.querySelectorAll(s)); }
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function escapeHtml(str) {
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function todayStr() {
    var d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }
  function fmtDate(iso) {
    if (!iso) return "";
    var p = iso.slice(0, 10).split("-");
    if (p.length !== 3) return iso;
    var d = new Date(p[0], p[1] - 1, p[2]);
    var days = ["일", "월", "화", "수", "목", "금", "토"];
    return p[0] + "." + p[1] + "." + p[2] + " (" + days[d.getDay()] + ")";
  }
  function fmtDateTime(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    return fmtDate(iso) + " " + ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2);
  }

  var toastTimer;
  function toast(msg) {
    var t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, 2200);
  }

  var MOOD_FACES = { 1: "😣", 2: "😕", 3: "😐", 4: "🙂", 5: "😄" };
  var MOOD_LABELS = { 1: "매우 나쁨", 2: "나쁨", 3: "보통", 4: "좋음", 5: "매우 좋음" };
  var SKIN_LABELS = { good: "피부 이상 없음", redness: "피부 빨감", wound: "상처 있음" };
  // 통증·경직 5단계 (0=없음 ~ 4=매우심함)
  var LEVEL_LABELS = { 0: "없음", 1: "조금", 2: "보통", 3: "심함", 4: "매우심함" };

  /* 컨디션/통증·경직을 "이모지 + 한글"로 표시하는 헬퍼 */
  function moodText(m) { return m != null ? (MOOD_FACES[m] + " " + MOOD_LABELS[m]) : "–"; }
  function moodTextShort(m) { return m != null ? MOOD_LABELS[m] : "–"; }

  /* 운동 카탈로그: 카테고리 → 종목 (재활 / 피트니스 / 레져·스포츠) */
  var EXERCISE_CATALOG = [
    { id: "rehab", label: "재활", icon: "🦿",
      items: ["상지기능훈련", "하지기능훈련", "일상생활훈련", "앉기/서기훈련", "균형훈련", "트랜스퍼훈련", "보행훈련", "근력/지구력운동", "스트레칭/관절운동", "호흡기능훈련", "통증치료", "전기자극치료", "기타"] },
    { id: "fitness", label: "피트니스", icon: "🏋️",
      items: ["헬스(웨이트 트레이닝)", "요가", "필라테스", "에어로빅", "걷기/달리기(실/내외)", "자전거(실내/외)", "줄넘기", "계단오르기", "고강도 운동", "기타"] },
    { id: "sports", label: "레져/스포츠", icon: "🏅",
      items: ["휠체어럭비", "탁구", "수영", "등산", "골프", "배드민턴", "테니스", "보치아/론볼", "게이트볼", "파크골프", "수상스포츠", "댄스스포츠", "기타"] }
  ];
  var EX_INTENSITIES = ["가벼움", "보통", "힘듦"];

  /* 활동(훈련) 종목: 일상 활동 */
  var ACTIVITY_ITEMS = [
    { name: "직장", icon: "🏢" }, { name: "은행", icon: "🏦" },
    { name: "병원", icon: "🏥" }, { name: "종교", icon: "⛪" },
    { name: "봉사", icon: "🤝" }, { name: "친목", icon: "👥" },
    { name: "산책", icon: "🚶" }, { name: "쇼핑", icon: "🛍️" },
    { name: "여행", icon: "✈️" }, { name: "교육", icon: "📚" },
    { name: "휴식", icon: "🛋️" }, { name: "독서", icon: "📖" },
    { name: "TV/영화", icon: "📺" }, { name: "요리", icon: "🍳" },
    { name: "청소", icon: "🧹" }, { name: "게임", icon: "🎮" },
    { name: "기타", icon: "✨" }
  ];

  // 카테고리 미상일 때 쓰는 중립 라벨
  var UNKNOWN_CAT = { id: "etc", label: "운동", icon: "💪" };

  /* 종목명 → 카테고리 라벨/아이콘 조회
     묶음 이름("A + B")도 처리: 묶음 안의 첫 종목으로 판정 */
  function exerciseCat(name) {
    // 묶음이면 첫 종목만 떼서 판정
    var first = String(name).split(" + ")[0].trim();

    function match(n) {
      for (var i = 0; i < EXERCISE_CATALOG.length; i++) {
        var c = EXERCISE_CATALOG[i];
        if (c.items && c.items.indexOf(n) >= 0) return c;
      }
      return null;
    }
    return match(first) || match(name) || UNKNOWN_CAT;
  }
  function activityIcon(name) {
    var f = ACTIVITY_ITEMS.filter(function (a) { return a.name === name; })[0];
    return f ? f.icon : "✨";
  }

  /* =========================================================
     뷰 라우팅
     ========================================================= */
  function showView(name) {
    $all(".view").forEach(function (v) {
      v.classList.toggle("active", v.id === "view-" + name);
    });
    $all(".nav-item").forEach(function (n) {
      n.classList.toggle("active", n.getAttribute("data-view") === name);
    });
    window.scrollTo(0, 0);
    // 진입 시 렌더
    if (name === "dashboard") renderDashboard();
    if (name === "monthly") renderMonthly();
    if (name === "history") renderHistory();
    if (name === "survey") renderSurveyView();
    if (name === "analysis") renderAnalysis();
    if (name === "record") loadDraftForDate();
    if (name === "compare") renderCompare();
    if (name === "admin") renderAdmin();
  }

  function initNav() {
    $all(".nav-item").forEach(function (n) {
      n.addEventListener("click", function () { showView(n.getAttribute("data-view")); });
    });
    // data-goto 버튼(빈 상태 등)
    document.addEventListener("click", function (e) {
      var b = e.target.closest("[data-goto]");
      if (b) showView(b.getAttribute("data-goto"));
    });
  }

  /* =========================================================
     온보딩
     ========================================================= */
  function maybeOnboard() {
    var settings = Store.getSettings();
    if (!settings.onboarded && !Store.hasBaseline() && !Store.listRecords().length) {
      $("#onboarding").hidden = false;
    }
  }
  function initOnboarding() {
    $("#onboardStartBtn").addEventListener("click", function () {
      Store.saveSettings({ onboarded: true });
      $("#onboarding").hidden = true;
      showView("survey");
      startSurvey();
    });
    $("#onboardSkipBtn").addEventListener("click", function () {
      Store.saveSettings({ onboarded: true });
      $("#onboarding").hidden = true;
    });
  }

  function refreshUserChip() {
    var p = Store.getProfile();
    var name = p.name || p.nick || "사용자";  // 본인 화면: 본명 우선
    $("#userName").textContent = name;
    $("#userAvatar").textContent = name.slice(0, 1);
    $("#dashSub").textContent = (name !== "사용자" ? name + "님의 " : "") + "건강 통계";
  }

  /* =========================================================
     대시보드
     ========================================================= */
  function renderDashboard() {
    var records = Store.listRecords();
    var surveys = Store.listSurveys();
    var grid = $("#dashGrid");
    var empty = $("#dashEmpty");

    if (!records.length && !surveys.length) {
      grid.innerHTML = "";
      empty.hidden = false;
      $("#growthCard").hidden = true;
      $("#alertsCard").hidden = true;
      return;
    }
    empty.hidden = true;

    // 성장 점수 + 자가 알림
    renderGrowthCard();
    renderAlerts();

    // 통계 계산
    var last7 = records.slice(0, 7);
    var exDays = last7.filter(function (r) { return r.exercises && r.exercises.length; }).length;
    var totalExMin = records.reduce(function (s, r) {
      return s + (r.exercises || []).reduce(function (a, e) { return a + (e.minutes || 0); }, 0);
    }, 0);
    var totalActMin = records.reduce(function (s, r) {
      return s + (r.activities || []).reduce(function (a, x) { return a + (x.minutes || 0); }, 0);
    }, 0);
    var moods = last7.filter(function (r) { return r.mood != null; }).map(function (r) { return r.mood; });
    var avgMood = moods.length ? Math.round(moods.reduce(function (a, b) { return a + b; }) / moods.length) : null;

    var streak = calcStreak();
    var cards = [];
    cards.push(dashCard("🔥", streak, "연속 기록", "일", "red"));
    cards.push(dashCard("📝", records.length, "총 기록 수", "일", "blue"));
    cards.push(dashCard("💪", exDays, "최근 7일 운동", "일", "green"));
    cards.push(dashCard("⏱️", totalExMin, "누적 운동 시간", "분", "purple"));
    cards.push(dashCard("🗓️", totalActMin, "누적 활동 시간", "분", "teal"));
    cards.push(dashCard(avgMood != null ? MOOD_FACES[avgMood] : "🙂", avgMood != null ? MOOD_LABELS[avgMood] : "–", "최근 컨디션", "", "amber"));

    // 기능평가 요약
    if (surveys.length) {
      var latest = surveys[surveys.length - 1];
      var pct = SurveyData.totalPercent(latest.answers);
      cards.push(dashCard("📋", surveys.length, "기능평가 횟수", "회", "teal"));
      var deltaHtml = "";
      if (surveys.length >= 2) {
        var base = surveys[0];
        var d = SurveyData.totalScore(latest.answers) - SurveyData.totalScore(base.answers);
        var sign = d > 0 ? "+" : "";
        var cls = d > 0 ? "up" : (d < 0 ? "down" : "same");
        deltaHtml = '<span class="dash-delta ' + cls + '">초기 대비 ' + sign + d + '점</span>';
      }
      cards.push(
        '<div class="dash-card teal wide">' +
          '<div class="dash-icon">📈</div>' +
          '<div class="dash-body">' +
            '<div class="dash-num">' + pct + '<span class="dash-unit">점</span></div>' +
            '<div class="dash-label">최근 기능 점수 (100점 만점) ' + deltaHtml + '</div>' +
          '</div>' +
        '</div>'
      );
    }

    grid.innerHTML = cards.join("");
  }
  function dashCard(icon, num, label, unit, color) {
    return '<div class="dash-card ' + color + '">' +
      '<div class="dash-icon">' + icon + '</div>' +
      '<div class="dash-body">' +
        '<div class="dash-num">' + num + (unit ? '<span class="dash-unit">' + unit + '</span>' : '') + '</div>' +
        '<div class="dash-label">' + label + '</div>' +
      '</div>' +
    '</div>';
  }

  /* 성장 점수 카드 */
  function renderGrowthCard() {
    var g = calcGrowthScore();
    var lv = growthLevel(g.total);
    var card = $("#growthCard");
    card.hidden = false;
    card.innerHTML =
      '<div class="growth-main">' +
        '<div class="growth-left">' +
          '<div class="growth-level">' + lv.emoji + ' ' + lv.name + '</div>' +
          '<div class="growth-score-num">' + g.total.toLocaleString() + '<span>점</span></div>' +
          '<div class="growth-sub">총 ' + g.days + '일 기록 · 최장 연속 ' + g.bestStreak + '일</div>' +
        '</div>' +
        '<div class="growth-break">' +
          growthBreakItem("🙌 성실도", g.breakdown.base) +
          growthBreakItem("🔥 꾸준함 보너스", g.breakdown.streak) +
          growthBreakItem("📈 성장 가산", g.breakdown.growth) +
        '</div>' +
      '</div>';
  }
  function growthBreakItem(label, val) {
    return '<div class="gb-item"><span class="gb-label">' + label + '</span>' +
      '<span class="gb-val">+' + val.toLocaleString() + '</span></div>';
  }

  /* 자가 알림 렌더 */
  function renderAlerts() {
    var alerts = buildAlerts();
    var card = $("#alertsCard");
    var list = $("#alertsList");
    card.hidden = false;
    list.innerHTML = "";
    alerts.forEach(function (a) {
      list.appendChild(el("div", "alert-row " + a.level,
        '<div class="alert-icon">' + a.icon + '</div>' +
        '<div class="alert-body"><div class="alert-title">' + escapeHtml(a.title) + '</div>' +
        '<div class="alert-desc">' + escapeHtml(a.desc) + '</div></div>'));
    });
  }

  /* =========================================================
     기능평가 설문
     ========================================================= */
  var surveyState = { active: false, sectionIdx: 0, answers: {} };

  function renderSurveyView() {
    // 진행 중이 아니면 이력 목록 표시
    if (!surveyState.active) {
      $("#surveyForm").hidden = true;
      $("#surveyIntro").hidden = false;
      renderSurveyHistory();
    }
  }

  function renderSurveyHistory() {
    var surveys = Store.listSurveys();
    var wrap = $("#surveyHistoryList");
    var intro = $("#surveyIntroHelp");
    if (surveys.length) {
      intro.textContent = "지금까지 " + surveys.length + "회 평가했어요. 다시 평가해 변화를 확인해 보세요.";
    } else {
      intro.textContent = "21개 문항, 약 3~5분 소요됩니다. 첫 평가는 ‘초기 상태’로 저장돼요.";
    }
    wrap.innerHTML = "";
    if (!surveys.length) return;

    // 최신순 표시
    surveys.slice().reverse().forEach(function (sv) {
      var pct = SurveyData.totalPercent(sv.answers);
      var card = el("div", "card survey-record");
      card.innerHTML =
        '<div class="survey-record-main">' +
          '<div class="survey-record-badge' + (sv.isBaseline ? ' baseline' : '') + '">' +
            (sv.isBaseline ? "초기 평가" : "재평가") + '</div>' +
          '<div class="survey-record-date">' + fmtDateTime(sv.createdAt) + '</div>' +
        '</div>' +
        '<div class="survey-record-score"><b>' + pct + '</b><span>/100점</span></div>';
      var del = el("button", "survey-record-del", "🗑️");
      del.title = "삭제";
      del.addEventListener("click", function () {
        if (!confirm("이 평가 기록을 삭제할까요?")) return;
        Store.deleteSurvey(sv.id);
        renderSurveyHistory();
        toast("삭제되었어요");
      });
      card.appendChild(del);
      wrap.appendChild(card);
    });
  }

  function initSurvey() {
    $("#startSurveyBtn").addEventListener("click", startSurvey);
    $("#surveyPrevBtn").addEventListener("click", function () { moveSurvey(-1); });
    $("#surveyNextBtn").addEventListener("click", function () { moveSurvey(1); });
  }

  function startSurvey() {
    surveyState = { active: true, sectionIdx: 0, answers: {} };
    $("#surveyIntro").hidden = true;
    $("#surveyHistoryList").innerHTML = "";
    $("#surveyForm").hidden = false;
    renderSurveySection();
  }

  function renderSurveySection() {
    var sections = SurveyData.sections;
    var idx = surveyState.sectionIdx;
    var section = sections[idx];

    $("#surveySectionTitle").innerHTML = section.icon + " " + section.title;
    $("#surveySectionDesc").textContent = section.desc;
    $("#surveyStepLabel").textContent = "섹션 " + (idx + 1) + " / " + sections.length;

    // 진행률: 답한 문항 수 기준
    var answered = Object.keys(surveyState.answers).length;
    var pct = Math.round((answered / SurveyData.totalQuestions()) * 100);
    $("#surveyProgressPct").textContent = pct + "%";
    $("#surveyProgressFill").style.width = pct + "%";

    var box = $("#surveyQuestions");
    box.innerHTML = "";
    section.questions.forEach(function (q) {
      var qEl = el("div", "survey-q");
      qEl.appendChild(el("div", "survey-q-text", escapeHtml(q.text)));
      var opts = el("div", "survey-options");
      q.options.forEach(function (label, score) {
        var b = el("button", "survey-opt", '<span class="opt-score">' + score + '</span><span class="opt-label">' + escapeHtml(label) + '</span>');
        b.type = "button";
        if (surveyState.answers[q.id] === score) b.classList.add("selected");
        b.addEventListener("click", function () {
          surveyState.answers[q.id] = score;
          qEl.querySelectorAll(".survey-opt").forEach(function (x) { x.classList.remove("selected"); });
          b.classList.add("selected");
          // 진행률 갱신
          var a = Object.keys(surveyState.answers).length;
          var p = Math.round((a / SurveyData.totalQuestions()) * 100);
          $("#surveyProgressPct").textContent = p + "%";
          $("#surveyProgressFill").style.width = p + "%";
        });
        opts.appendChild(b);
      });
      qEl.appendChild(opts);
      box.appendChild(qEl);
    });

    // 버튼 상태
    $("#surveyPrevBtn").style.visibility = idx === 0 ? "hidden" : "visible";
    $("#surveyNextBtn").textContent = (idx === sections.length - 1) ? "✓ 평가 완료" : "다음 →";
  }

  function moveSurvey(dir) {
    var sections = SurveyData.sections;
    var idx = surveyState.sectionIdx;

    if (dir > 0) {
      // 현재 섹션 문항 모두 응답했는지 확인
      var unanswered = sections[idx].questions.filter(function (q) {
        return surveyState.answers[q.id] == null;
      });
      if (unanswered.length) {
        toast("모든 문항에 답해주세요 (" + unanswered.length + "개 남음)");
        return;
      }
      if (idx === sections.length - 1) {
        finishSurvey();
        return;
      }
      surveyState.sectionIdx++;
    } else {
      if (idx === 0) return;
      surveyState.sectionIdx--;
    }
    renderSurveySection();
  }

  function finishSurvey() {
    var saved = Store.addSurvey({
      answers: surveyState.answers,
      totalScore: SurveyData.totalScore(surveyState.answers),
      totalMax: SurveyData.totalMax()
    });
    surveyState.active = false;
    $("#surveyForm").hidden = true;
    $("#surveyIntro").hidden = false;
    toast(saved.isBaseline ? "초기 평가가 저장되었어요! 🎉" : "재평가가 저장되었어요! 🎉");
    renderSurveyHistory();
    refreshUserChip();

    // 2회 이상이면 분석 화면으로 안내
    if (Store.getSurveys().length >= 2) {
      setTimeout(function () {
        if (confirm("평가가 완료됐어요. 초기 상태와 비교 분석을 확인할까요?")) {
          showView("analysis");
        }
      }, 400);
    }
  }

  /* =========================================================
     비교 분석
     ========================================================= */
  function initAnalysis() {
    $("#compareBase").addEventListener("change", renderComparison);
    $("#compareTarget").addEventListener("change", renderComparison);
  }

  function renderAnalysis() {
    var surveys = Store.listSurveys(); // 오래된→최신
    if (surveys.length < 2) {
      $("#analysisEmpty").hidden = false;
      $("#analysisContent").hidden = true;
      return;
    }
    $("#analysisEmpty").hidden = true;
    $("#analysisContent").hidden = false;

    // 셀렉트 채우기
    var baseSel = $("#compareBase");
    var targetSel = $("#compareTarget");
    baseSel.innerHTML = "";
    targetSel.innerHTML = "";
    surveys.forEach(function (sv, i) {
      var label = (sv.isBaseline ? "초기 평가 · " : "재평가 " + (i + 1) + "회차 · ") + fmtDate(sv.createdAt);
      baseSel.appendChild(new Option(label, sv.id));
      targetSel.appendChild(new Option(label, sv.id));
    });
    // 기본값: 기준=초기(첫), 비교=최신(마지막)
    baseSel.value = surveys[0].id;
    targetSel.value = surveys[surveys.length - 1].id;

    renderComparison();
    renderTrend(surveys);
  }

  function getSurveyById(id) {
    return Store.getSurveys().filter(function (s) { return s.id === id; })[0];
  }

  function changeTag(delta, suffix) {
    var s = suffix || "점";
    if (delta > 0) return '<span class="chg up">▲ +' + delta + s + '</span>';
    if (delta < 0) return '<span class="chg down">▼ ' + delta + s + '</span>';
    return '<span class="chg same">– 변화 없음</span>';
  }

  function renderComparison() {
    var base = getSurveyById($("#compareBase").value);
    var target = getSurveyById($("#compareTarget").value);
    if (!base || !target) return;

    // 총점
    var baseTotal = SurveyData.totalScore(base.answers);
    var targetTotal = SurveyData.totalScore(target.answers);
    var max = SurveyData.totalMax();
    var basePct = Math.round(baseTotal / max * 100);
    var targetPct = Math.round(targetTotal / max * 100);
    var totalDelta = targetTotal - baseTotal;
    var pctDelta = targetPct - basePct;

    $("#totalChangeCard").innerHTML =
      '<h2 class="card-title"><span aria-hidden="true">🎯</span> 종합 변화</h2>' +
      '<div class="total-compare">' +
        '<div class="tc-side"><div class="tc-lbl">' + (base.isBaseline ? "초기" : "이전") + '</div>' +
          '<div class="tc-score">' + basePct + '<span>점</span></div>' +
          '<div class="tc-date">' + fmtDate(base.createdAt) + '</div></div>' +
        '<div class="tc-arrow">' + (pctDelta >= 0 ? "→" : "→") + '</div>' +
        '<div class="tc-side"><div class="tc-lbl">최근</div>' +
          '<div class="tc-score big">' + targetPct + '<span>점</span></div>' +
          '<div class="tc-date">' + fmtDate(target.createdAt) + '</div></div>' +
      '</div>' +
      '<div class="total-delta-line">' + changeTag(totalDelta) +
        ' <span class="delta-msg">' + deltaMessage(pctDelta) + '</span></div>';

    // 섹션별
    var secBox = $("#sectionChanges");
    secBox.innerHTML = "";
    SurveyData.sections.forEach(function (section) {
      var bs = SurveyData.sectionScore(section, base.answers);
      var ts = SurveyData.sectionScore(section, target.answers);
      var smax = SurveyData.sectionMax(section);
      var bp = Math.round(bs / smax * 100);
      var tp = Math.round(ts / smax * 100);
      var d = ts - bs;
      var row = el("div", "sec-change");
      row.innerHTML =
        '<div class="sec-change-head">' +
          '<span class="sec-name">' + section.icon + ' ' + section.title + '</span>' +
          changeTag(d) +
        '</div>' +
        '<div class="sec-bars">' +
          '<div class="sec-bar-row"><span class="sec-bar-lbl">이전</span>' +
            '<div class="bar"><div class="bar-fill base" style="width:' + bp + '%"></div></div>' +
            '<span class="sec-bar-val">' + bp + '%</span></div>' +
          '<div class="sec-bar-row"><span class="sec-bar-lbl">최근</span>' +
            '<div class="bar"><div class="bar-fill target" style="width:' + tp + '%"></div></div>' +
            '<span class="sec-bar-val">' + tp + '%</span></div>' +
        '</div>';
      secBox.appendChild(row);
    });

    // 문항별
    var itemBox = $("#itemChanges");
    itemBox.innerHTML = "";
    SurveyData.sections.forEach(function (section) {
      var group = el("div", "item-group");
      group.appendChild(el("div", "item-group-title", section.icon + " " + section.title));
      section.questions.forEach(function (q) {
        var bv = base.answers[q.id];
        var tv = target.answers[q.id];
        if (bv == null && tv == null) return;
        var b0 = bv || 0, t0 = tv || 0;
        var d = t0 - b0;
        var cls = d > 0 ? "up" : (d < 0 ? "down" : "same");
        var arrow = d > 0 ? "▲" : (d < 0 ? "▼" : "–");
        // 겹친 막대: 옅은색=이전 점수, 진한색=최근 점수 (각 막대에 실제 점수 표기)
        var basePct = b0 / 4 * 100, targetPct = t0 / 4 * 100;
        var row = el("div", "item-change " + cls);
        row.innerHTML =
          '<div class="ic-top">' +
            '<span class="ic-text">' + escapeHtml(q.text) + '</span>' +
            '<span class="ic-scores">' + (bv != null ? bv : "-") + ' → ' + (tv != null ? tv : "-") +
              ' <span class="ic-arrow">' + arrow + (d !== 0 ? " " + (d > 0 ? "+" : "") + d : "") + '</span></span>' +
          '</div>' +
          '<div class="ic-stack">' +
            '<div class="ic-seg ic-seg-prev" style="width:' + basePct + '%">' + b0 + '</div>' +
            '<div class="ic-seg ic-seg-recent" style="width:' + targetPct + '%">' + t0 + '</div>' +
          '</div>';
        group.appendChild(row);
      });
      itemBox.appendChild(group);
    });

    // 섹션별 레이더 차트
    renderSectionRadar(base, target);
  }

  var _radarChart = null;

  /* 섹션별 변화 레이더(방사형) 차트: 이전 vs 최근 */
  function renderSectionRadar(base, target) {
    if (typeof Chart === "undefined") return;
    var canvas = $("#sectionRadar"); if (!canvas) return;
    var labels = SurveyData.sections.map(function (s) { return s.title; });
    var baseData = SurveyData.sections.map(function (s) {
      return Math.round(SurveyData.sectionScore(s, base.answers) / SurveyData.sectionMax(s) * 100);
    });
    var targetData = SurveyData.sections.map(function (s) {
      return Math.round(SurveyData.sectionScore(s, target.answers) / SurveyData.sectionMax(s) * 100);
    });
    if (_radarChart) _radarChart.destroy();
    _radarChart = new Chart(canvas, {
      type: "radar",
      data: {
        labels: labels,
        datasets: [
          { label: base.isBaseline ? "초기" : "이전", data: baseData,
            borderColor: "#94a3b8", backgroundColor: "rgba(148,163,184,0.2)", borderWidth: 2, pointRadius: 3 },
          { label: "최근", data: targetData,
            borderColor: "#2563eb", backgroundColor: "rgba(37,99,235,0.25)", borderWidth: 2, pointRadius: 3 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: { r: { min: 0, max: 100, ticks: { stepSize: 25, backdropColor: "transparent" },
          pointLabels: { font: { size: 12, family: "inherit" } } } },
        plugins: { legend: { position: "bottom" } }
      }
    });
  }

  function deltaMessage(pctDelta) {
    if (pctDelta >= 15) return "크게 좋아졌어요! 정말 잘하고 있어요 🎉";
    if (pctDelta >= 5) return "꾸준히 좋아지고 있어요 👍";
    if (pctDelta > 0) return "조금씩 나아지고 있어요.";
    if (pctDelta === 0) return "이전과 비슷한 상태를 유지하고 있어요.";
    if (pctDelta > -5) return "약간 낮아졌어요. 무리하지 말고 관리해요.";
    return "상태가 낮아졌어요. 담당 의료진과 상의해 보세요.";
  }

  function renderTrend(surveys) {
    var chart = $("#trendChart");
    chart.innerHTML = "";
    var max = SurveyData.totalMax();
    surveys.forEach(function (sv, i) {
      var pct = Math.round(SurveyData.totalScore(sv.answers) / max * 100);
      var col = el("div", "trend-col");
      col.innerHTML =
        '<div class="trend-bar-wrap"><div class="trend-val">' + pct + '</div>' +
          '<div class="trend-bar" style="height:' + Math.max(pct, 3) + '%"></div></div>' +
        '<div class="trend-x">' + (sv.isBaseline ? "초기" : (i + 1) + "회") + '<br>' +
          '<span>' + sv.createdAt.slice(5, 10).replace("-", "/") + '</span></div>';
      chart.appendChild(col);
    });
  }

  /* =========================================================
     기록하기 (기존 기능)
     ========================================================= */
  var draft = { mood: null, pain: 0, spasticity: 0, urine: 0, bowel: 0, skin: null, exercises: [], activities: [] };
  var currentExCat = EXERCISE_CATALOG[0].id; // 현재 선택된 운동 카테고리
  // 묶어서 추가하기 위한 선택 상태 (카테고리 전환 시 초기화)
  var picSel = [];                       // 운동 카테고리: 선택된 종목명 배열
  var actSel = [];                       // 활동: 선택된 종목명 배열

  function initRecord() {
    $("#recordDate").value = todayStr();
    $("#recordDate").addEventListener("change", loadDraftForDate);

    renderExerciseCats();
    renderExerciseItems();
    renderActivityItems();

    $all(".mood-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        draft.mood = Number(btn.getAttribute("data-mood"));
        updateMoodUI();
      });
    });
    $all('[data-level="pain"] .level-btn').forEach(function (btn) {
      btn.addEventListener("click", function () {
        draft.pain = Number(btn.getAttribute("data-value")); updateLevelUI("pain");
      });
    });
    $all('[data-level="spasticity"] .level-btn').forEach(function (btn) {
      btn.addEventListener("click", function () {
        draft.spasticity = Number(btn.getAttribute("data-value")); updateLevelUI("spasticity");
      });
    });
    $all(".counter-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var k = btn.getAttribute("data-counter");
        draft[k] = Math.max(0, draft[k] + Number(btn.getAttribute("data-delta")));
        $("#" + k + "Count").textContent = draft[k];
      });
    });
    $all('[data-choice="skin"] .choice-btn').forEach(function (btn) {
      btn.addEventListener("click", function () {
        draft.skin = btn.getAttribute("data-value"); updateSkinUI();
      });
    });
    $("#saveBtn").addEventListener("click", saveRecord);
    $("#loadPrevBtn").addEventListener("click", loadPreviousRecord);
  }

  /* 이전 기록 불러오기: 현재 날짜보다 이전의 가장 최근 기록을
     현재 폼으로 복사한다 (날짜는 현재 폼 날짜 유지, 저장 전까지 미반영). */
  function loadPreviousRecord() {
    var curDate = $("#recordDate").value || todayStr();
    // 현재 날짜보다 과거의 기록들 중 가장 최근 것
    var prev = Store.listRecords().filter(function (r) { return r.date < curDate; })[0];
    if (!prev) {
      // 과거 기록이 없으면, 현재 날짜 제외 가장 최근(미래 포함) 기록으로 폴백
      prev = Store.listRecords().filter(function (r) { return r.date !== curDate; })[0];
    }
    if (!prev) { toast("불러올 이전 기록이 없어요"); return; }

    draft = {
      mood: prev.mood != null ? prev.mood : null,
      pain: prev.pain || 0, spasticity: prev.spasticity || 0,
      urine: prev.urine || 0, bowel: prev.bowel || 0,
      skin: prev.skin || null,
      exercises: (prev.exercises || []).map(function (e) { return { type: e.type, minutes: e.minutes, intensity: e.intensity }; }),
      activities: (prev.activities || []).map(function (a) { return { name: a.name, minutes: a.minutes }; })
    };
    $("#memo").value = prev.memo || "";

    // UI 반영
    updateLevelUI("pain"); updateLevelUI("spasticity");
    $("#urineCount").textContent = draft.urine; $("#bowelCount").textContent = draft.bowel;
    updateMoodUI(); updateSkinUI();
    renderExerciseItems(); renderExerciseList();
    renderActivityItems(); renderActivityList();
    $("#saveHint").textContent = fmtDate(prev.date) + " 기록을 불러왔어요. 수정 후 저장하세요.";
    toast(fmtDate(prev.date) + " 기록을 불러왔어요");
  }

  /* ---- 운동: 카테고리/종목 버튼 ---- */
  function renderExerciseCats() {
    var box = $("#exCats");
    box.innerHTML = "";
    EXERCISE_CATALOG.forEach(function (cat) {
      var b = el("button", "cat-btn" + (cat.id === currentExCat ? " selected" : ""),
        '<span aria-hidden="true">' + cat.icon + '</span> ' + cat.label);
      b.type = "button";
      b.addEventListener("click", function () {
        currentExCat = cat.id;
        picSel = [];                           // 카테고리 바꾸면 선택 초기화
        renderExerciseCats();
        renderExerciseItems();
      });
      box.appendChild(b);
    });
  }
  function renderExerciseItems() {
    var box = $("#exItems");
    box.innerHTML = "";
    var cat = EXERCISE_CATALOG.filter(function (c) { return c.id === currentExCat; })[0];

    // 종목 선택(묶어서 추가) + 바로 추가 둘 다 지원
    box.classList.remove("combo");
    var itemsWrap = el("div", "combo-row wrap");
    cat.items.forEach(function (name) {
      itemsWrap.appendChild(makePickItem(name, picSel, function () {
        // 바로 추가
        addExerciseItem(name);
      }, renderExerciseItems));
    });
    box.appendChild(itemsWrap);
    // 묶어서 추가 버튼
    var readyG = picSel.length > 0;
    var nameG = picSel.join(" + ");
    var addG = el("button", "combo-add" + (readyG ? " ready" : ""),
      readyG ? "＋ 선택한 " + picSel.length + "개 묶어서 추가: " + escapeHtml(nameG)
             : "여러 개를 묶으려면 종목을 선택하세요 (또는 ＋로 바로 추가)");
    addG.type = "button";
    addG.disabled = !readyG;
    addG.addEventListener("click", function () {
      if (!readyG) return;
      addExerciseItem(nameG);
      picSel = [];
      renderExerciseItems();
    });
    box.appendChild(addG);
  }

  function addExerciseItem(name) {
    if (!draft.exercises.some(function (e) { return e.type === name; })) {
      draft.exercises.push({ type: name, minutes: 30, intensity: "보통" });
    }
    renderExerciseList();
  }

  /* 선택 토글(본체) + 바로추가(＋) 버튼 한 쌍을 만든다 */
  function makePickItem(label, selArr, onInstantAdd, rerender) {
    var on = selArr.indexOf(label) >= 0;
    var wrap = el("div", "pick-item" + (on ? " picked" : ""));
    var main = el("button", "pick-main", escapeHtml(label));
    main.type = "button";
    main.title = "선택(묶어서 추가용)";
    main.addEventListener("click", function () { toggleIn(selArr, label); rerender(); });
    var add = el("button", "pick-add", "＋");
    add.type = "button";
    add.title = "바로 추가";
    add.addEventListener("click", function (e) {
      e.stopPropagation();
      onInstantAdd();
      flashToast("추가됨: " + label);
    });
    wrap.appendChild(main); wrap.appendChild(add);
    return wrap;
  }
  function flashToast(msg) { toast(msg); }

  /* 배열에 값이 있으면 제거, 없으면 추가 (토글) */
  function toggleIn(arr, val) {
    var i = arr.indexOf(val);
    if (i >= 0) arr.splice(i, 1); else arr.push(val);
  }

  /* ---- 활동: 선택(묶어서 추가) + 바로 추가 둘 다 지원 ---- */
  function renderActivityItems() {
    var box = $("#actItems");
    box.innerHTML = "";
    box.classList.remove("single");
    var wrap = el("div", "combo-row wrap");
    ACTIVITY_ITEMS.forEach(function (act) {
      var label = act.name;
      var on = actSel.indexOf(label) >= 0;
      var item = el("div", "pick-item" + (on ? " picked" : ""));
      var main = el("button", "pick-main", '<span aria-hidden="true">' + act.icon + '</span> ' + escapeHtml(label));
      main.type = "button";
      main.title = "선택(묶어서 추가용)";
      main.addEventListener("click", function () { toggleIn(actSel, label); renderActivityItems(); });
      var add = el("button", "pick-add", "＋");
      add.type = "button";
      add.title = "바로 추가";
      add.addEventListener("click", function (e) {
        e.stopPropagation();
        addActivityItem(label);
        flashToast("추가됨: " + label);
      });
      item.appendChild(main); item.appendChild(add);
      wrap.appendChild(item);
    });
    box.appendChild(wrap);

    var ready = actSel.length > 0;
    var name = actSel.join(" + ");
    var addG = el("button", "combo-add" + (ready ? " ready" : ""),
      ready ? "＋ 선택한 " + actSel.length + "개 묶어서 추가: " + escapeHtml(name)
            : "여러 개를 묶으려면 활동을 선택하세요 (또는 ＋로 바로 추가)");
    addG.type = "button";
    addG.disabled = !ready;
    addG.addEventListener("click", function () {
      if (!ready) return;
      addActivityItem(name);
      actSel = [];
      renderActivityItems();
    });
    box.appendChild(addG);
  }

  function addActivityItem(name) {
    if (!draft.activities.some(function (a) { return a.name === name; })) {
      draft.activities.push({ name: name, minutes: 30 });
    }
    renderActivityList();
  }

  function updateMoodUI() {
    $all(".mood-btn").forEach(function (b) {
      b.classList.toggle("selected", Number(b.getAttribute("data-mood")) === draft.mood);
    });
  }
  /* 통증·경직 5단계 버튼 선택 반영 (which: "pain" | "spasticity") */
  function updateLevelUI(which) {
    var val = draft[which];
    $all('[data-level="' + which + '"] .level-btn').forEach(function (b) {
      b.classList.toggle("selected", Number(b.getAttribute("data-value")) === val);
    });
  }
  function updateSkinUI() {
    $all('[data-choice="skin"] .choice-btn').forEach(function (b) {
      b.classList.toggle("selected", b.getAttribute("data-value") === draft.skin);
    });
  }
  /* 추가된 운동 목록 (인라인 시간/강도 편집) */
  function renderExerciseList() {
    var list = $("#exerciseList");
    list.innerHTML = "";
    if (!draft.exercises.length) {
      list.appendChild(el("div", "picker-empty", "👆 위에서 종목을 선택해 추가하세요"));
      return;
    }
    draft.exercises.forEach(function (ex, i) {
      var cat = exerciseCat(ex.type);
      var row = el("div", "picker-row");
      row.innerHTML =
        '<div class="pr-info"><span class="pr-cat">' + cat.icon + ' ' + cat.label + '</span>' +
        '<span class="pr-name">' + escapeHtml(ex.type) + '</span></div>';

      var ctrl = el("div", "pr-ctrl");
      // 시간(분)
      var min = el("input", "pr-min");
      min.type = "number"; min.min = "0"; min.inputMode = "numeric";
      min.value = ex.minutes != null ? ex.minutes : "";
      min.addEventListener("input", function () { ex.minutes = min.value ? Number(min.value) : null; });
      var minUnit = el("span", "pr-unit", "분");
      // 강도
      var sel = el("select", "pr-sel");
      EX_INTENSITIES.forEach(function (v) {
        var o = el("option", null, v); o.value = v;
        if (v === ex.intensity) o.selected = true;
        sel.appendChild(o);
      });
      sel.addEventListener("change", function () { ex.intensity = sel.value; });
      // 삭제
      var rm = el("button", "pr-remove", "×"); rm.type = "button";
      rm.addEventListener("click", function () {
        draft.exercises.splice(i, 1);
        renderExerciseItems(); renderExerciseList();
      });

      ctrl.appendChild(min); ctrl.appendChild(minUnit); ctrl.appendChild(sel); ctrl.appendChild(rm);
      row.appendChild(ctrl);
      list.appendChild(row);
    });
  }

  /* 추가된 활동 목록 (인라인 시간 편집) */
  function renderActivityList() {
    var list = $("#activityList");
    list.innerHTML = "";
    if (!draft.activities.length) {
      list.appendChild(el("div", "picker-empty", "👆 위에서 활동을 선택해 추가하세요"));
      return;
    }
    draft.activities.forEach(function (act, i) {
      var row = el("div", "picker-row");
      row.innerHTML =
        '<div class="pr-info"><span class="pr-name">' + activityIcon(act.name) + ' ' + escapeHtml(act.name) + '</span></div>';
      var ctrl = el("div", "pr-ctrl");
      var min = el("input", "pr-min");
      min.type = "number"; min.min = "0"; min.inputMode = "numeric";
      min.value = act.minutes != null ? act.minutes : "";
      min.addEventListener("input", function () { act.minutes = min.value ? Number(min.value) : null; });
      var minUnit = el("span", "pr-unit", "분");
      var rm = el("button", "pr-remove", "×"); rm.type = "button";
      rm.addEventListener("click", function () {
        draft.activities.splice(i, 1);
        renderActivityItems(); renderActivityList();
      });
      ctrl.appendChild(min); ctrl.appendChild(minUnit); ctrl.appendChild(rm);
      row.appendChild(ctrl);
      list.appendChild(row);
    });
  }
  function saveRecord() {
    var date = $("#recordDate").value || todayStr();
    Store.saveRecord({
      date: date, mood: draft.mood, pain: draft.pain, spasticity: draft.spasticity,
      urine: draft.urine, bowel: draft.bowel, skin: draft.skin,
      exercises: draft.exercises.slice(), activities: draft.activities.slice(),
      memo: $("#memo").value.trim()
    });
    $("#saveHint").textContent = "✓ " + fmtDate(date) + " 기록이 저장되었어요.";
    toast("저장 완료!");
  }

  function loadDraftForDate() {
    var date = $("#recordDate").value || todayStr();
    var r = Store.getRecord(date);
    draft = { mood: null, pain: 0, spasticity: 0, urine: 0, bowel: 0, skin: null, exercises: [], activities: [] };
    if (r) {
      draft.mood = r.mood != null ? r.mood : null;
      draft.pain = r.pain || 0; draft.spasticity = r.spasticity || 0;
      draft.urine = r.urine || 0; draft.bowel = r.bowel || 0;
      draft.skin = r.skin || null; draft.exercises = (r.exercises || []).slice();
      draft.activities = (r.activities || []).slice();
      $("#memo").value = r.memo || "";
      $("#saveHint").textContent = "이 날짜에 저장된 기록을 불러왔어요. 수정 후 다시 저장할 수 있어요.";
    } else {
      $("#memo").value = ""; $("#saveHint").textContent = "";
    }
    updateLevelUI("pain"); updateLevelUI("spasticity");
    $("#urineCount").textContent = draft.urine; $("#bowelCount").textContent = draft.bowel;
    updateMoodUI(); updateSkinUI();
    renderExerciseItems(); renderExerciseList();
    renderActivityItems(); renderActivityList();
  }

  /* =========================================================
     기록 목록
     ========================================================= */
  function renderHistory() {
    var list = Store.listRecords();
    renderSummary(list);
    var container = $("#historyList");
    var empty = $("#historyEmpty");
    if (!list.length) { container.innerHTML = ""; empty.hidden = false; return; }
    empty.hidden = true;
    container.innerHTML = "";
    list.forEach(function (r) {
      var tags = [];
      tags.push((r.pain >= 3) ? '<span class="tag alert">통증 ' + LEVEL_LABELS[r.pain] + '</span>'
        : '<span class="tag">통증 ' + LEVEL_LABELS[r.pain || 0] + '</span>');
      if (r.spasticity >= 3) tags.push('<span class="tag alert">경직 ' + LEVEL_LABELS[r.spasticity] + '</span>');
      if (r.skin && r.skin !== "good") tags.push('<span class="tag alert">' + SKIN_LABELS[r.skin] + '</span>');
      tags.push('<span class="tag">소변 ' + (r.urine || 0) + ' · 배변 ' + (r.bowel || 0) + '</span>');
      if (r.exercises && r.exercises.length) {
        var m = r.exercises.reduce(function (s, e) { return s + (e.minutes || 0); }, 0);
        tags.push('<span class="tag exercise">💪 운동 ' + r.exercises.length + '개' + (m ? ' · ' + m + '분' : '') + '</span>');
      }
      if (r.activities && r.activities.length) {
        var am = r.activities.reduce(function (s, a) { return s + (a.minutes || 0); }, 0);
        tags.push('<span class="tag activity">🗓️ 활동 ' + r.activities.length + '개' + (am ? ' · ' + am + '분' : '') + '</span>');
      }

      var card = el("div", "history-card",
        '<div class="history-card-head">' +
          '<span class="history-date">' + fmtDate(r.date) + '</span>' +
          '<span class="history-mood">' + (r.mood != null ? MOOD_FACES[r.mood] + ' <span class="history-mood-label">' + MOOD_LABELS[r.mood] + '</span>' : "") + '</span>' +
        '</div>' +
        '<div class="history-tags">' + tags.join("") + '</div>' +
        (r.memo ? '<p class="history-memo">📝 ' + escapeHtml(r.memo) + '</p>' : ""));
      var actions = el("div", "history-actions");
      var editBtn = el("button", "history-btn", "✏️ 수정");
      editBtn.addEventListener("click", function () {
        showView("record"); $("#recordDate").value = r.date; loadDraftForDate();
      });
      var delBtn = el("button", "history-btn del", "🗑️ 삭제");
      delBtn.addEventListener("click", function () {
        if (!confirm(fmtDate(r.date) + " 기록을 삭제할까요?")) return;
        Store.deleteRecord(r.date); renderHistory(); toast("삭제되었어요");
      });
      actions.appendChild(editBtn); actions.appendChild(delBtn);
      card.appendChild(actions);
      container.appendChild(card);
    });
  }

  function renderSummary(list) {
    var last7 = list.slice(0, 7);
    var exDays = last7.filter(function (r) { return r.exercises && r.exercises.length; }).length;
    var moods = last7.filter(function (r) { return r.mood != null; }).map(function (r) { return r.mood; });
    var avgM = moods.length ? Math.round(moods.reduce(function (a, b) { return a + b; }) / moods.length) : null;
    var avg = avgM != null ? MOOD_LABELS[avgM] : "–";
    $("#summaryGrid").innerHTML =
      sumItem(list.length, "총 기록") + sumItem(exDays + "일", "최근 7일 운동") + sumItem(avg, "최근 컨디션");
  }
  function sumItem(n, l) {
    return '<div class="summary-item"><div class="summary-num">' + n + '</div><div class="summary-lbl">' + l + '</div></div>';
  }

  /* =========================================================
     CSV 내보내기
     ========================================================= */
  function exportCSV() {
    var list = Store.listRecords().slice().reverse();
    if (!list.length) { toast("내보낼 기록이 없어요"); return; }
    var headers = ["날짜", "컨디션(1-5)", "통증", "경직", "소변횟수", "배변횟수",
      "피부상태", "운동", "운동시간(분)", "활동", "활동시간(분)", "메모"];
    var rows = [headers];
    list.forEach(function (r) {
      var exNames = (r.exercises || []).map(function (e) {
        return e.type + (e.minutes ? "(" + e.minutes + "분/" + e.intensity + ")" : "");
      }).join(" | ");
      var totMin = (r.exercises || []).reduce(function (s, e) { return s + (e.minutes || 0); }, 0);
      var actNames = (r.activities || []).map(function (a) {
        return a.name + (a.minutes ? "(" + a.minutes + "분)" : "");
      }).join(" | ");
      var actMin = (r.activities || []).reduce(function (s, a) { return s + (a.minutes || 0); }, 0);
      rows.push([r.date, r.mood != null ? r.mood : "",
        r.pain != null ? LEVEL_LABELS[r.pain] : "",
        r.spasticity != null ? LEVEL_LABELS[r.spasticity] : "",
        r.urine != null ? r.urine : "", r.bowel != null ? r.bowel : "",
        r.skin ? SKIN_LABELS[r.skin] : "",
        exNames, totMin || "", actNames, actMin || "", (r.memo || "").replace(/\n/g, " ")]);
    });
    var csv = rows.map(function (row) {
      return row.map(function (c) {
        var s = String(c);
        return (/[",\n]/.test(s)) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(",");
    }).join("\n");
    var blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    var a = el("a");
    a.href = URL.createObjectURL(blob);
    a.download = "건강기록_" + todayStr() + ".csv";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
    toast("CSV 파일을 저장했어요");
  }

  /* =========================================================
     월별 분석 (캘린더 · 합계 · 카테고리 · 추이 · 목표)
     ========================================================= */
  var calYear, calMonth; // 현재 보고 있는 달 (month: 0~11)
  var trendMetric = "exercise";

  function initMonthly() {
    var d = new Date();
    calYear = d.getFullYear();
    calMonth = d.getMonth();
    $("#calPrev").addEventListener("click", function () { shiftMonth(-1); });
    $("#calNext").addEventListener("click", function () { shiftMonth(1); });
    $all("#trendTabs .trend-tab").forEach(function (t) {
      t.addEventListener("click", function () {
        trendMetric = t.getAttribute("data-metric");
        $all("#trendTabs .trend-tab").forEach(function (x) { x.classList.remove("active"); });
        t.classList.add("active");
        renderDailyTrend();
      });
    });
  }
  function shiftMonth(delta) {
    calMonth += delta;
    if (calMonth < 0) { calMonth = 11; calYear--; }
    else if (calMonth > 11) { calMonth = 0; calYear++; }
    renderMonthly();
  }

  // 해당 월의 기록만 추출
  function recordsInMonth(year, month) {
    var prefix = year + "-" + ("0" + (month + 1)).slice(-2);
    return Store.listRecords().filter(function (r) { return r.date.indexOf(prefix) === 0; });
  }
  function sumExMin(r) { return (r.exercises || []).reduce(function (s, e) { return s + (e.minutes || 0); }, 0); }
  function sumActMin(r) { return (r.activities || []).reduce(function (s, a) { return s + (a.minutes || 0); }, 0); }

  function renderMonthly() {
    renderCalendar();
    renderMonthStats();
    renderGoalProgress();
    renderCatTime();
    renderDailyTrend();
    var mrecs = recordsInMonth(calYear, calMonth);
    $("#monthlyEmpty").hidden = mrecs.length > 0;
  }

  function renderCalendar() {
    $("#calTitle").textContent = calYear + "년 " + (calMonth + 1) + "월";
    var grid = $("#calGrid");
    grid.innerHTML = "";
    var first = new Date(calYear, calMonth, 1);
    var startDay = first.getDay(); // 0=일
    var daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    var recMap = {};
    recordsInMonth(calYear, calMonth).forEach(function (r) { recMap[r.date] = r; });
    var today = todayStr();

    // 앞 빈칸
    for (var i = 0; i < startDay; i++) grid.appendChild(el("div", "cal-cell empty"));
    for (var day = 1; day <= daysInMonth; day++) {
      var iso = calYear + "-" + ("0" + (calMonth + 1)).slice(-2) + "-" + ("0" + day).slice(-2);
      var r = recMap[iso];
      var cls = "cal-cell";
      if (iso === today) cls += " today";
      var cell = el("div", cls);
      var dow = new Date(calYear, calMonth, day).getDay();
      var numCls = "cal-num" + (dow === 0 ? " sun" : (dow === 6 ? " sat" : ""));
      cell.innerHTML = '<span class="' + numCls + '">' + day + '</span>';
      if (r) {
        var hasEx = (r.exercises && r.exercises.length) || (r.activities && r.activities.length);
        var dots = el("div", "cal-dots");
        dots.appendChild(el("i", "dot has-record"));
        if (hasEx) dots.appendChild(el("i", "dot has-exercise"));
        cell.appendChild(dots);
        cell.classList.add("filled");
        (function (dateIso) {
          cell.addEventListener("click", function () {
            showView("record");
            $("#recordDate").value = dateIso;
            loadDraftForDate();
          });
        })(iso);
      }
      grid.appendChild(cell);
    }
  }

  function renderMonthStats() {
    var mrecs = recordsInMonth(calYear, calMonth);
    var now = new Date();
    var isThisMonth = (calYear === now.getFullYear() && calMonth === now.getMonth());
    $("#monthStatLabel").textContent = isThisMonth ? "이번 달" : (calMonth + 1) + "월";

    var exMin = mrecs.reduce(function (s, r) { return s + sumExMin(r); }, 0);
    var actMin = mrecs.reduce(function (s, r) { return s + sumActMin(r); }, 0);
    var exDays = mrecs.filter(function (r) { return r.exercises && r.exercises.length; }).length;
    var pains = mrecs.filter(function (r) { return r.pain != null; }).map(function (r) { return r.pain; });
    var avgPain = pains.length ? LEVEL_LABELS[Math.round(pains.reduce(function (a, b) { return a + b; }) / pains.length)] : "–";
    var moods = mrecs.filter(function (r) { return r.mood != null; }).map(function (r) { return r.mood; });
    var avgMoodN = moods.length ? Math.round(moods.reduce(function (a, b) { return a + b; }) / moods.length) : null;
    var avgMood = avgMoodN != null ? MOOD_LABELS[avgMoodN] : "–";

    $("#monthStats").innerHTML =
      monthStat("💪", exMin, "분", "운동 시간") +
      monthStat("🗓️", actMin, "분", "활동 시간") +
      monthStat("📆", exDays, "일", "운동한 날") +
      monthStat("⚡", avgPain, "", "평균 통증") +
      monthStat("🙂", avgMood, "", "평균 컨디션");
    $("#monthRecordDays").textContent = mrecs.length;
  }
  function monthStat(icon, num, unit, label) {
    return '<div class="ms-item"><div class="ms-icon">' + icon + '</div>' +
      '<div class="ms-body"><div class="ms-num">' + num + (unit ? '<span class="ms-unit">' + unit + '</span>' : '') +
      '</div><div class="ms-lbl">' + label + '</div></div></div>';
  }

  // 이번 주(최근 7일) 목표 달성률
  function renderGoalProgress() {
    var goals = Store.getGoals();
    var since = new Date(); since.setDate(since.getDate() - 6);
    var sinceStr = new Date(since.getTime() - since.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    var week = Store.listRecords().filter(function (r) { return r.date >= sinceStr; });

    var exMin = week.reduce(function (s, r) { return s + sumExMin(r); }, 0);
    var actMin = week.reduce(function (s, r) { return s + sumActMin(r); }, 0);
    var exDays = week.filter(function (r) { return r.exercises && r.exercises.length; }).length;
    var recDays = week.length;

    var box = $("#goalProgress");
    box.innerHTML = "";
    box.appendChild(goalBar("💪 운동 시간", exMin, goals.exMin, "분"));
    box.appendChild(goalBar("📆 운동 일수", exDays, goals.exDays, "일"));
    box.appendChild(goalBar("🗓️ 활동 시간", actMin, goals.actMin, "분"));
    box.appendChild(goalBar("📝 기록 일수", recDays, goals.recordDays, "일"));
  }
  function goalBar(label, cur, goal, unit) {
    var pct = goal > 0 ? Math.min(100, Math.round(cur / goal * 100)) : 0;
    var done = pct >= 100;
    var row = el("div", "goal-row");
    row.innerHTML =
      '<div class="goal-row-head"><span class="goal-label">' + label + (done ? ' ✅' : '') + '</span>' +
      '<span class="goal-val">' + cur + ' / ' + goal + unit + ' <b>' + pct + '%</b></span></div>' +
      '<div class="bar"><div class="bar-fill ' + (done ? 'done' : 'target') + '" style="width:' + pct + '%"></div></div>';
    return row;
  }

  // 카테고리별 운동 시간 (이번 달)
  function renderCatTime() {
    var mrecs = recordsInMonth(calYear, calMonth);
    var totals = {}; // catId -> minutes
    EXERCISE_CATALOG.forEach(function (c) { totals[c.id] = 0; });
    mrecs.forEach(function (r) {
      (r.exercises || []).forEach(function (e) {
        var cat = exerciseCat(e.type);
        totals[cat.id] = (totals[cat.id] || 0) + (e.minutes || 0);
      });
    });
    var max = Math.max.apply(null, EXERCISE_CATALOG.map(function (c) { return totals[c.id]; }).concat([1]));
    var grid = $("#catTimeGrid");
    grid.innerHTML = "";
    EXERCISE_CATALOG.forEach(function (c) {
      var min = totals[c.id];
      var pct = Math.round(min / max * 100);
      grid.appendChild(el("div", "cat-time-item",
        '<div class="cti-head"><span class="cti-icon">' + c.icon + '</span><span class="cti-label">' + c.label + '</span></div>' +
        '<div class="cti-num">' + min + '<span>분</span></div>' +
        '<div class="bar sm"><div class="bar-fill target" style="width:' + pct + '%"></div></div>'));
    });
  }

  // 최근 14일 일자별 추이
  function renderDailyTrend() {
    var days = 14;
    var map = {};
    Store.listRecords().forEach(function (r) { map[r.date] = r; });
    var cols = [];
    for (var i = days - 1; i >= 0; i--) {
      var d = new Date(); d.setDate(d.getDate() - i);
      var iso = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
      var r = map[iso];
      var val = 0, label = "", max = 1;
      if (trendMetric === "exercise") { val = r ? sumExMin(r) : 0; max = 60; label = val ? val + "분" : ""; }
      else if (trendMetric === "mood") { val = r && r.mood != null ? r.mood : 0; max = 5; label = val ? String(val) : ""; }
      else if (trendMetric === "pain") { val = r && r.pain != null ? r.pain : 0; max = 4; label = (r && r.pain != null) ? LEVEL_LABELS[val] : ""; }
      cols.push({ iso: iso, val: val, label: label, max: max, d: d });
    }
    var maxVal = Math.max.apply(null, cols.map(function (c) { return c.val; }).concat([cols[0].max]));
    var chart = $("#dailyTrend");
    chart.innerHTML = "";
    var colorCls = trendMetric === "pain" ? "pain" : (trendMetric === "mood" ? "mood" : "exercise");
    cols.forEach(function (c) {
      var h = maxVal > 0 ? Math.round(c.val / maxVal * 100) : 0;
      var col = el("div", "dt-col");
      col.innerHTML =
        '<div class="dt-bar-wrap"><div class="dt-val">' + c.label + '</div>' +
        '<div class="dt-bar ' + colorCls + '" style="height:' + Math.max(h, c.val > 0 ? 6 : 0) + '%"></div></div>' +
        '<div class="dt-x">' + (c.d.getMonth() + 1) + '/' + c.d.getDate() + '</div>';
      chart.appendChild(col);
    });
  }

  /* =========================================================
     목표 설정 (프로필 내)
     ========================================================= */
  function initGoals() {
    var g = Store.getGoals();
    $("#goalExMin").value = g.exMin; $("#goalExDays").value = g.exDays;
    $("#goalActMin").value = g.actMin; $("#goalRecordDays").value = g.recordDays;
    $("#saveGoalBtn").addEventListener("click", function () {
      Store.saveGoals({
        exMin: Number($("#goalExMin").value) || 0,
        exDays: Number($("#goalExDays").value) || 0,
        actMin: Number($("#goalActMin").value) || 0,
        recordDays: Number($("#goalRecordDays").value) || 0
      });
      $("#goalHint").textContent = "✓ 목표가 저장되었어요.";
      toast("목표 저장 완료!");
    });
  }

  /* 연속 기록(스트릭) 계산 — 오늘(또는 어제)부터 거슬러 연속 며칠 */
  function calcStreak() {
    var map = {};
    Store.listRecords().forEach(function (r) { map[r.date] = true; });
    var streak = 0;
    var d = new Date();
    // 오늘 기록이 없으면 어제부터 카운트
    var todayIso = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    if (!map[todayIso]) d.setDate(d.getDate() - 1);
    for (var i = 0; i < 400; i++) {
      var iso = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
      if (map[iso]) { streak++; d.setDate(d.getDate() - 1); }
      else break;
    }
    return streak;
  }

  /* =========================================================
     성장 점수 (참고 앱 산정식 반영)
     - 기록한 날: +20 (성실도)
     - 연속 보너스: 3일 연속부터 +5/일, 7일 이상 +10/일
     - 성장 가산: 전날보다 운동(분) 증가 시 분당 +1 (일 최대 +30)
     기록이 "있는 날"만 순회하여 계산 (미기록일 패널티는 스트릭에 반영)
     ========================================================= */
  function calcGrowthScore() {
    var recs = Store.listRecords().slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; }); // 과거→현재
    if (!recs.length) return { total: 0, breakdown: { base: 0, streak: 0, growth: 0 }, days: 0, bestStreak: 0 };

    var exMinOf = function (r) { return (r.exercises || []).reduce(function (s, e) { return s + (e.minutes || 0); }, 0); };
    var base = 0, streakBonus = 0, growth = 0;
    var run = 0, bestStreak = 0;
    var prevDate = null, prevExMin = 0;

    recs.forEach(function (r) {
      base += 20;
      // 연속 여부: 전 기록일이 '하루 전'인지
      if (prevDate) {
        var pd = new Date(prevDate), cur = new Date(r.date);
        var diffDays = Math.round((cur - pd) / 86400000);
        run = (diffDays === 1) ? run + 1 : 1;
      } else { run = 1; }
      bestStreak = Math.max(bestStreak, run);
      // 연속 보너스 (연속 3일째부터)
      if (run >= 7) streakBonus += 10;
      else if (run >= 3) streakBonus += 5;
      // 성장 가산 (연속일 때만 전날 대비 비교 의미)
      var curEx = exMinOf(r);
      if (prevDate) {
        var inc = curEx - prevExMin;
        if (inc > 0) growth += Math.min(inc, 30);
      }
      prevDate = r.date; prevExMin = curEx;
    });

    return {
      total: base + streakBonus + growth,
      breakdown: { base: base, streak: streakBonus, growth: growth },
      days: recs.length,
      bestStreak: bestStreak
    };
  }

  /* 성장 점수를 레벨/등급으로 환산 (동기부여용) */
  function growthLevel(score) {
    if (score >= 1000) return { name: "최고 등급", emoji: "👑" };
    if (score >= 500) return { name: "꾸준 마스터", emoji: "🏆" };
    if (score >= 200) return { name: "성장 중", emoji: "🌟" };
    if (score >= 50) return { name: "시작 단계", emoji: "🌱" };
    return { name: "입문", emoji: "🐣" };
  }

  /* =========================================================
     자가 알림 (오늘 확인할 사항) — 본인용
     ========================================================= */
  function buildAlerts() {
    var alerts = [];
    var recs = Store.listRecords(); // 최신순
    var today = todayStr();

    // 1) 오늘 기록 여부
    var hasToday = recs.some(function (r) { return r.date === today; });
    if (!hasToday) {
      alerts.push({ level: "info", icon: "📝", title: "오늘 기록이 아직 없어요", desc: "오늘의 컨디션과 운동을 기록해 보세요." });
    }

    // 2) 최근 3일 통증 추세 (최근 기록 기준)
    var recent = recs.slice(0, 3);
    var highPain = recent.filter(function (r) { return r.pain != null && r.pain >= 3; }); // 심함 이상
    if (highPain.length >= 2) {
      alerts.push({ level: "warn", icon: "⚡", title: "통증이 높은 날이 이어지고 있어요", desc: "최근 통증이 '심함' 이상인 날이 " + highPain.length + "일 있어요. 무리하지 말고 담당 의료진과 상의해 보세요." });
    } else if (recent[0] && recent[0].pain != null && recent[0].pain >= 4) {
      alerts.push({ level: "warn", icon: "⚡", title: "오늘 통증이 심해요", desc: "통증 '" + LEVEL_LABELS[recent[0].pain] + "'. 자세·휴식을 점검하고 필요 시 도움을 요청하세요." });
    }

    // 3) 욕창(피부) 이상
    var skinIssue = recent.filter(function (r) { return r.skin && r.skin !== "good"; });
    if (skinIssue.length) {
      var latest = skinIssue[0];
      alerts.push({ level: "danger", icon: "🩹", title: "피부 상태를 확인하세요", desc: SKIN_LABELS[latest.skin] + " (" + fmtDate(latest.date) + "). 압박 부위를 자주 바꾸고 상태를 관찰해 주세요." });
    }

    // 4) 기록 공백 (마지막 기록이 3일 이상 전)
    if (recs.length) {
      var lastDate = new Date(recs[0].date);
      var gap = Math.round((new Date(today) - lastDate) / 86400000);
      if (gap >= 3) {
        alerts.push({ level: "info", icon: "📆", title: gap + "일째 기록이 없어요", desc: "꾸준한 기록이 재활 경과 파악에 도움이 돼요. 오늘 다시 시작해 볼까요?" });
      }
    }

    // 5) 경직 높음
    if (recent[0] && recent[0].spasticity != null && recent[0].spasticity >= 3) {
      alerts.push({ level: "warn", icon: "🌀", title: "경직이 심한 편이에요", desc: "경직 '" + LEVEL_LABELS[recent[0].spasticity] + "'. 스트레칭·자세 관리를 신경 써 주세요." });
    }

    // 긍정 메시지 (알림이 없을 때)
    if (!alerts.length) {
      alerts.push({ level: "good", icon: "✅", title: "특별히 주의할 점이 없어요", desc: "좋은 상태를 잘 유지하고 있어요. 오늘도 화이팅!" });
    }
    return alerts;
  }

  /* =========================================================
     프로필
     ========================================================= */
  function initProfile() {
    $("#saveProfileBtn").addEventListener("click", function () {
      Store.saveProfile({
        name: $("#pName").value.trim(),
        nick: $("#pNick").value.trim(),
        level: $("#pLevel").value,
        completeness: $("#pCompleteness").value,
        injuryDate: $("#pInjuryDate").value
      });
      $("#profileHint").textContent = "✓ 내 정보가 저장되었어요.";
      refreshUserChip();
      toast("정보 저장 완료!");
    });
    $("#saveShareBtn").addEventListener("click", function () {
      Store.saveProfile({ shareCompare: $("#profShare").checked });
      $("#shareHint").textContent = $("#profShare").checked
        ? "✓ 비교에 참여합니다. 내 데이터가 다른 참여자에게 보여집니다."
        : "✓ 비교 참여를 해제했습니다.";
      toast("공유 설정 저장 완료!");
    });
    $("#clearAllBtn").addEventListener("click", function () {
      alert("데이터는 서버에 저장됩니다. 계정/데이터 삭제가 필요하면 관리자에게 문의해 주세요.");
    });
  }

  /* 프로필 값 채우기 (로그인 후 호출) */
  function fillProfile() {
    var p = Store.getProfile();
    if ($("#pName")) $("#pName").value = p.name || "";
    if ($("#pNick")) $("#pNick").value = p.nick || "";
    if ($("#pId")) { $("#pId").value = p.id || ""; $("#pId").disabled = true; }
    if ($("#pLevel")) $("#pLevel").value = p.level || "";
    if ($("#pCompleteness")) $("#pCompleteness").value = p.completeness || "";
    if ($("#pInjuryDate")) $("#pInjuryDate").value = p.injuryDate || "";
    if ($("#profShare")) $("#profShare").checked = !!p.shareCompare;
  }

  /* =========================================================
     참여자 비교 (동의자끼리)
     ========================================================= */
  function initCompare() {
    $("#enableCompareBtn").addEventListener("click", function () {
      Store.saveProfile({ shareCompare: true });
      toast("비교에 참여합니다!");
      renderCompare();
    });
  }

  function sumExMinR(r) { return (r.exercises || []).reduce(function (s, e) { return s + (e.minutes || 0); }, 0); }

  function renderCompare() {
    var me = Store.getProfile();
    // 미동의 시 안내 카드
    if (!me.shareCompare) {
      $("#compareConsentCard").hidden = false;
      $("#compareContent").hidden = true;
      return;
    }
    $("#compareConsentCard").hidden = true;
    $("#compareContent").hidden = false;

    var box = $("#compareRanking");
    box.innerHTML = '<p class="card-help">불러오는 중...</p>';

    // 동의자 프로필 + 각자 기록 로드 → 최근 7일 운동량 랭킹
    Store.fetchComparePeers().then(function (peers) {
      var since = new Date(); since.setDate(since.getDate() - 6);
      var sinceStr = new Date(since.getTime() - since.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
      var myId = Store.getUserId();
      return Promise.all(peers.map(function (p) {
        return Store.fetchUserRecords(p.id).then(function (recs) {
          var week = recs.filter(function (r) { return r.date >= sinceStr; });
          var exMin = week.reduce(function (s, r) { return s + sumExMinR(r); }, 0);
          var exDays = week.filter(function (r) { return r.exercises && r.exercises.length; }).length;
          return {
            nickname: Store.displayName(p), level: p.injury_level || "-", degree: p.injury_degree || "-",
            exMin: exMin, exDays: exDays, isMe: p.id === myId
          };
        });
      }));
    }).then(function (rows) {
      rows.sort(function (a, b) { return b.exMin - a.exMin; });
      if (!rows.length) { box.innerHTML = '<p class="card-help">아직 비교에 참여한 사람이 없어요.</p>'; return; }
      var max = Math.max.apply(null, rows.map(function (r) { return r.exMin; }).concat([1]));
      box.innerHTML = "";
      rows.forEach(function (r, i) {
        var pct = Math.round(r.exMin / max * 100);
        box.appendChild(el("div", "compare-row" + (r.isMe ? " me" : ""),
          '<div class="cr-rank">' + (i + 1) + '</div>' +
          '<div class="cr-body"><div class="cr-name">' + escapeHtml(r.nickname) + (r.isMe ? ' <span class="cr-metag">나</span>' : '') +
            ' <span class="cr-meta">' + escapeHtml(r.level) + ' · ' + escapeHtml(r.degree) + '</span></div>' +
            '<div class="bar"><div class="bar-fill target" style="width:' + pct + '%"></div></div></div>' +
          '<div class="cr-val">' + r.exMin + '분<br><span>' + r.exDays + '일</span></div>'));
      });
    }).catch(function (ex) {
      box.innerHTML = '<p class="card-help">불러오기에 실패했어요.</p>';
      console.error(ex);
    });
  }

  /* =========================================================
     관리자 (전체 참여자 조회)
     ========================================================= */
  function initAdmin() { /* 렌더는 showView에서 */ }

  function renderAdmin() {
    var statsBox = $("#adminStats");
    var body = $("#adminUserBody");
    statsBox.innerHTML = "";
    body.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:20px;color:var(--text-muted);">불러오는 중...</td></tr>';
    $("#adminDetailCard").hidden = true;

    Store.fetchAllUsers().then(function (users) {
      // 각 사용자 기록 수/최근 기록 집계
      return Promise.all(users.map(function (u) {
        return Store.fetchUserRecords(u.id).then(function (recs) {
          var last = recs.map(function (r) { return r.date; }).sort().pop() || "-";
          return { u: u, count: recs.length, last: last };
        });
      }));
    }).then(function (rows) {
      // 통계 카드
      var total = rows.length;
      var active = rows.filter(function (x) { return x.count > 0; }).length;
      var shared = rows.filter(function (x) { return x.u.share_compare; }).length;
      statsBox.innerHTML =
        dashCard("👥", total, "전체 참여자", "명", "blue") +
        dashCard("✍️", active, "기록 있는 참여자", "명", "green") +
        dashCard("🤝", shared, "비교 참여자", "명", "teal");

      // 표
      body.innerHTML = "";
      if (!rows.length) { body.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:20px;color:var(--text-muted);">참여자가 없습니다.</td></tr>'; return; }
      rows.sort(function (a, b) { return b.count - a.count; });
      rows.forEach(function (x) {
        var tr = document.createElement("tr");
        tr.innerHTML =
          '<td><b>' + escapeHtml(x.u.name || "-") + '</b>' + (x.u.role === "admin" ? ' <span class="admin-badge">관리자</span>' : '') + '</td>' +
          '<td>' + escapeHtml(x.u.nickname || "-") + '</td>' +
          '<td>' + escapeHtml(x.u.username || "-") + '</td>' +
          '<td>' + escapeHtml(x.u.injury_level || "-") + '</td>' +
          '<td>' + escapeHtml(x.u.injury_degree || "-") + '</td>' +
          '<td>' + x.count + '</td>' +
          '<td>' + (x.last === "-" ? "-" : fmtDate(x.last)) + '</td>' +
          '<td><button class="btn-outline btn-sm">상세</button></td>';
        tr.querySelector("button").addEventListener("click", function () { adminDetail(x.u); });
        body.appendChild(tr);
      });
    }).catch(function (ex) {
      body.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:20px;color:var(--danger);">불러오기 실패 (권한을 확인하세요)</td></tr>';
      console.error(ex);
    });
  }

  var adminDetailData = null; // CSV 내보내기용 현재 대상자 캐시

  function adminDetail(u) {
    $("#adminDetailCard").hidden = false;
    $("#adminDetailName").textContent = (u.name || u.nickname || "참여자");
    var body = $("#adminDetailBody");
    body.innerHTML = '<p class="card-help">불러오는 중...</p>';
    Promise.all([Store.fetchUserRecords(u.id), Store.fetchUserSurveys(u.id)]).then(function (res) {
      var recs = res[0].slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; }); // 최신순
      var asc = recs.slice().reverse(); // 과거→현재 (추이/성장용)
      var surveys = res[1];
      adminDetailData = { user: u, records: recs };

      var exMin = function (r) { return (r.exercises || []).reduce(function (s, e) { return s + (e.minutes || 0); }, 0); };
      var actMin = function (r) { return (r.activities || []).reduce(function (s, a) { return s + (a.minutes || 0); }, 0); };

      // ----- 요약 통계 -----
      var totalEx = recs.reduce(function (s, r) { return s + exMin(r); }, 0);
      var totalAct = recs.reduce(function (s, r) { return s + actMin(r); }, 0);
      var exDays = recs.filter(function (r) { return r.exercises && r.exercises.length; }).length;
      var moods = recs.filter(function (r) { return r.mood != null; }).map(function (r) { return r.mood; });
      var avgMoodN = moods.length ? Math.round(moods.reduce(function (a, b) { return a + b; }) / moods.length) : null;
      var avgMood = avgMoodN != null ? MOOD_LABELS[avgMoodN] : "–";
      var pains = recs.filter(function (r) { return r.pain != null; }).map(function (r) { return r.pain; });
      var avgPain = pains.length ? LEVEL_LABELS[Math.round(pains.reduce(function (a, b) { return a + b; }) / pains.length)] : "–";
      // 성장 점수 (간이: 기록일*20 + 연속보너스 생략, 운동 증가 가산)
      var growth = recs.length * 20;

      var html = "";

      // 메타 + CSV 버튼
      html += '<div class="admin-detail-head">' +
        '<div class="admin-detail-meta">이름: ' + escapeHtml(u.name || "-") +
        ' · 닉네임: ' + escapeHtml(u.nickname || "-") +
        ' · 아이디: ' + escapeHtml(u.username || "-") +
        ' · 손상: ' + escapeHtml(u.injury_level || "-") + "/" + escapeHtml(u.injury_degree || "-") +
        ' · 발병일: ' + escapeHtml(u.onset_date || "-") + '</div>' +
        '<button class="btn-outline btn-sm" id="adminExportBtn">⬇️ 이 참여자 CSV</button></div>';

      // 요약 카드 그리드 (메인 대시보드와 동일한 카드 스타일)
      html += '<div class="dash-grid admin-dash">' +
        dashCard("📝", recs.length, "기록일", "일", "blue") +
        dashCard("💪", totalEx, "누적 운동", "분", "green") +
        dashCard("🗓️", totalAct, "누적 활동", "분", "teal") +
        dashCard("📆", exDays, "운동한 날", "일", "purple") +
        dashCard("⚡", avgPain, "평균 통증", "", "red") +
        dashCard("🙂", avgMood, "평균 컨디션", "", "amber") +
      '</div>';

      // ----- 기능평가 비교 분석 -----
      if (surveys.length) {
        var first = surveys[0], latest = surveys[surveys.length - 1];
        var basePct = SurveyData.totalPercent(first.answers);
        var latestPct = SurveyData.totalPercent(latest.answers);
        var dPct = latestPct - basePct;
        html += '<h3 class="admin-sub">📋 기능평가 비교 분석</h3>';
        if (surveys.length >= 2) {
          html += '<p class="admin-line">총 <b>' + surveys.length + '회</b> 평가 · 초기 <b>' + basePct + '점</b> → 최근 <b>' + latestPct + '점</b> ' +
            '<span class="chg ' + (dPct > 0 ? 'up' : dPct < 0 ? 'down' : 'same') + '">' + (dPct > 0 ? '▲ +' + dPct : dPct < 0 ? '▼ ' + dPct : '– 0') + '점</span></p>';
          // 섹션별 비교 표 (이전 → 최근, 변화)
          html += '<div class="table-scroll"><table class="admin-table"><thead><tr>' +
            '<th>영역</th><th>초기</th><th>최근</th><th>변화</th></tr></thead><tbody>';
          SurveyData.sections.forEach(function (sec) {
            var smax = SurveyData.sectionMax(sec);
            var bp = Math.round(SurveyData.sectionScore(sec, first.answers) / smax * 100);
            var tp = Math.round(SurveyData.sectionScore(sec, latest.answers) / smax * 100);
            var sd = tp - bp;
            var scls = sd > 0 ? "up" : (sd < 0 ? "down" : "same");
            html += '<tr><td>' + sec.icon + ' ' + sec.title + '</td><td>' + bp + '%</td><td>' + tp + '%</td>' +
              '<td><span class="chg ' + scls + '">' + (sd > 0 ? "▲ +" + sd : sd < 0 ? "▼ " + sd : "– 0") + '</span></td></tr>';
          });
          html += '</tbody></table></div>';
          // 문항별 변화 (0~4점)
          html += '<div class="table-scroll" style="margin-top:12px;"><table class="admin-table"><thead><tr>' +
            '<th>문항</th><th>초기</th><th>최근</th><th>변화</th></tr></thead><tbody>';
          SurveyData.sections.forEach(function (sec) {
            sec.questions.forEach(function (q) {
              var bv = first.answers[q.id], tv = latest.answers[q.id];
              if (bv == null && tv == null) return;
              var b0 = bv || 0, t0 = tv || 0, qd = t0 - b0;
              var qcls = qd > 0 ? "up" : (qd < 0 ? "down" : "same");
              html += '<tr><td>' + escapeHtml(q.text) + '</td><td>' + b0 + '</td><td>' + t0 + '</td>' +
                '<td><span class="chg ' + qcls + '">' + (qd > 0 ? "▲ +" + qd : qd < 0 ? "▼ " + qd : "– 0") + '</span></td></tr>';
            });
          });
          html += '</tbody></table></div>';
        } else {
          html += '<p class="admin-line">총 <b>1회</b> 평가 · 최근 점수 <b>' + latestPct + '점</b> (재평가 시 초기 대비 비교 분석이 표시됩니다)</p>';
        }
      }

      // ----- 일일 기록 상세 (종목명 포함) -----
      html += '<h3 class="admin-sub">📒 일일 기록 (' + recs.length + '건)</h3>';
      html += '<div class="table-scroll"><table class="admin-table admin-rec-table"><thead><tr>' +
        '<th>날짜</th><th>컨디션</th><th>통증</th><th>경직</th><th>소변</th><th>배변</th><th>피부</th><th>운동</th><th>활동</th><th>메모</th>' +
        '</tr></thead><tbody>';
      if (!recs.length) {
        html += '<tr><td colspan="10" style="text-align:center;padding:16px;color:var(--text-muted);">기록이 없습니다.</td></tr>';
      }
      recs.forEach(function (r) {
        var exList = (r.exercises || []).map(function (e) {
          return escapeHtml(e.type) + (e.minutes ? "(" + e.minutes + "분)" : "");
        }).join(", ");
        var acList = (r.activities || []).map(function (a) {
          return escapeHtml(a.name) + (a.minutes ? "(" + a.minutes + "분)" : "");
        }).join(", ");
        html += '<tr>' +
          '<td>' + fmtDate(r.date) + '</td>' +
          '<td>' + (r.mood != null ? MOOD_FACES[r.mood] + " " + MOOD_LABELS[r.mood] : "-") + '</td>' +
          '<td>' + LEVEL_LABELS[r.pain || 0] + '</td>' +
          '<td>' + LEVEL_LABELS[r.spasticity || 0] + '</td>' +
          '<td>' + (r.urine || 0) + '</td>' +
          '<td>' + (r.bowel || 0) + '</td>' +
          '<td>' + (r.skin ? escapeHtml(SKIN_LABELS[r.skin]) : "-") + '</td>' +
          '<td class="cell-wide">' + (exList || "-") + '</td>' +
          '<td class="cell-wide">' + (acList || "-") + '</td>' +
          '<td class="cell-wide">' + escapeHtml(r.memo || "") + '</td>' +
          '</tr>';
      });
      html += '</tbody></table></div>';

      body.innerHTML = html;
      $("#adminExportBtn").addEventListener("click", function () { exportUserCSV(u, recs); });
      $("#adminDetailCard").scrollIntoView({ behavior: "smooth", block: "start" });
    }).catch(function (ex) { body.innerHTML = '<p class="card-help">불러오기 실패</p>'; console.error(ex); });
  }

  function adminStat(icon, num, label) {
    return '<div class="admin-stat"><div class="as-icon">' + icon + '</div>' +
      '<div class="as-num">' + num + '</div><div class="as-lbl">' + label + '</div></div>';
  }

  /* 관리자: 특정 참여자 기록 CSV 내보내기 */
  function exportUserCSV(u, recs) {
    if (!recs.length) { toast("내보낼 기록이 없어요"); return; }
    var headers = ["날짜", "컨디션(1-5)", "통증", "경직", "소변횟수", "배변횟수", "피부상태", "운동", "운동시간(분)", "활동", "활동시간(분)", "메모"];
    var rows = [headers];
    recs.slice().reverse().forEach(function (r) {
      var exNames = (r.exercises || []).map(function (e) { return e.type + (e.minutes ? "(" + e.minutes + "분/" + e.intensity + ")" : ""); }).join(" | ");
      var totMin = (r.exercises || []).reduce(function (s, e) { return s + (e.minutes || 0); }, 0);
      var acNames = (r.activities || []).map(function (a) { return a.name + (a.minutes ? "(" + a.minutes + "분)" : ""); }).join(" | ");
      var acMin = (r.activities || []).reduce(function (s, a) { return s + (a.minutes || 0); }, 0);
      rows.push([r.date, r.mood != null ? r.mood : "",
        r.pain != null ? LEVEL_LABELS[r.pain] : "", r.spasticity != null ? LEVEL_LABELS[r.spasticity] : "",
        r.urine != null ? r.urine : "", r.bowel != null ? r.bowel : "", r.skin ? SKIN_LABELS[r.skin] : "",
        exNames, totMin || "", acNames, acMin || "", (r.memo || "").replace(/\n/g, " ")]);
    });
    var csv = rows.map(function (row) {
      return row.map(function (c) { var s = String(c); return (/[",\n]/.test(s)) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(",");
    }).join("\n");
    var blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    var a = el("a");
    a.href = URL.createObjectURL(blob);
    a.download = "건강기록_" + (u.nickname || u.name || u.username) + "_" + todayStr() + ".csv";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
    toast("CSV 파일을 저장했어요");
  }

  /* =========================================================
     인증 화면 (로그인/가입)
     ========================================================= */
  function initAuthScreen() {
    // 탭 전환
    $all(".auth-tab").forEach(function (t) {
      t.addEventListener("click", function () {
        var tab = t.getAttribute("data-authtab");
        $all(".auth-tab").forEach(function (x) { x.classList.toggle("active", x === t); });
        $("#loginForm").hidden = tab !== "login";
        $("#signupForm").hidden = tab !== "signup";
      });
    });
    // 로그인
    $("#loginForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var err = $("#loginError"); err.textContent = "";
      var id = $("#loginId").value.trim(), pw = $("#loginPw").value;
      if (!id || !pw) { err.textContent = "아이디와 비밀번호를 입력하세요."; return; }
      Auth.login(id, pw).then(function () {
        return bootApp();
      }).catch(function (ex) {
        err.textContent = "로그인 실패: 아이디 또는 비밀번호를 확인하세요.";
        console.error(ex);
      });
    });
    // 가입
    $("#signupForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var err = $("#signupError"); err.textContent = "";
      var id = $("#suId").value.trim(), pw = $("#suPw").value;
      var name = $("#suName").value.trim(), nick = $("#suNick").value.trim();
      if (!id || id.length < 3) { err.textContent = "아이디는 3자 이상 입력하세요."; return; }
      if (!pw || pw.length < 6) { err.textContent = "비밀번호는 6자 이상 입력하세요."; return; }
      if (!name) { err.textContent = "이름을 입력하세요."; return; }
      Auth.signup(id, pw, {
        name: name,
        nickname: nick,
        injuryLevel: $("#suLevel").value,
        injuryDegree: $("#suDegree").value,
        onsetDate: $("#suOnset").value
      }).then(function () {
        // 가입 후 바로 로그인
        return Auth.login(id, pw);
      }).then(function () {
        // 비교 동의 체크 시 프로필에 반영 (init 후)
        var share = $("#suShare").checked;
        return bootApp().then(function () {
          if (share) return Store.saveProfile({ shareCompare: true });
        });
      }).catch(function (ex) {
        var msg = (ex && ex.message) || "";
        if (/already registered|already exists/i.test(msg)) err.textContent = "이미 사용 중인 아이디입니다.";
        else err.textContent = "가입 실패: " + (msg || "잠시 후 다시 시도하세요.");
        console.error(ex);
      });
    });
  }

  function showAuth() {
    $("#authScreen").hidden = false;
    $("#appRoot").hidden = true;
  }

  /* 로그인 성공 후: 서버 데이터 로드 → 앱 표시 */
  function bootApp() {
    return Auth.getUser().then(function (user) {
      if (!user) { showAuth(); return; }
      return Store.init(user.id).then(function () {
        $("#authScreen").hidden = true;
        $("#appRoot").hidden = false;
        // 관리자 메뉴 표시 여부
        var isAdmin = Store.getProfile().role === "admin";
        $all(".admin-only").forEach(function (b) { b.hidden = !isAdmin; });
        refreshUserChip();
        fillProfile();
        showView("dashboard");
        maybeOnboard();
      });
    });
  }

  /* 사용자 메뉴 드롭다운 + 로그아웃 */
  function initUserMenu() {
    $("#userChip").addEventListener("click", function (e) {
      e.stopPropagation();
      var dd = $("#userDropdown"); dd.hidden = !dd.hidden;
    });
    document.addEventListener("click", function () { $("#userDropdown").hidden = true; });
    $("#menuProfile").addEventListener("click", function () { showView("profile"); });
    $("#menuLogout").addEventListener("click", function () {
      Auth.logout().then(function () { Store.clearCache(); location.reload(); });
    });
  }

  /* =========================================================
     init
     ========================================================= */
  function init() {
    // 이벤트 바인딩 (화면 요소는 로그인 전에도 DOM에 존재)
    initAuthScreen();
    initNav();
    initUserMenu();
    initOnboarding();
    initSurvey();
    initAnalysis();
    initMonthly();
    initRecord();
    initProfile();
    initGoals();
    initCompare();
    initAdmin();
    $("#exportBtn").addEventListener("click", exportCSV);

    // 세션 확인 → 로그인돼 있으면 앱, 아니면 로그인 화면
    Auth.getSession().then(function (session) {
      if (session) return bootApp();
      showAuth();
    }).catch(function () { showAuth(); });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else { init(); }
})();
