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
  var SKIN_LABELS = { good: "피부 이상 없음", redness: "피부 빨감", wound: "상처 있음" };

  /* 운동 카탈로그: 카테고리 → 종목 (SCI 참여자 재활 중심) */
  var EXERCISE_CATALOG = [
    { id: "aerobic", label: "유산소", icon: "🏃",
      items: ["휠체어 유산소", "핸드 사이클", "트레드밀 보행", "실내 자전거", "수영/아쿠아"] },
    { id: "strength", label: "근력", icon: "🏋️",
      items: ["상지 근력운동", "체간 근력운동", "하지 근력운동", "저항밴드 운동", "매트 운동"] },
    { id: "flexibility", label: "유연성·밸런스", icon: "🤸",
      items: ["스트레칭", "관절 가동범위(ROM)", "앉기 균형 훈련", "요가", "필라테스"] },
    { id: "rehab", label: "재활훈련", icon: "🦿",
      items: ["기립/체중부하 훈련", "트랜스퍼 훈련", "보행 훈련", "호흡 운동", "전기자극 치료(FES)"] },
    { id: "etc", label: "기타", icon: "✨",
      items: ["산책", "레크리에이션 스포츠", "기타"] }
  ];
  var EX_INTENSITIES = ["가벼움", "보통", "힘듦"];

  /* 활동(훈련) 종목: 일상 활동 */
  var ACTIVITY_ITEMS = [
    { name: "TV보기", icon: "📺" }, { name: "전화하기", icon: "📞" },
    { name: "걷기", icon: "🚶" }, { name: "독서", icon: "📖" },
    { name: "식사하기", icon: "🍚" }, { name: "컴퓨터/휴대폰", icon: "💻" },
    { name: "대화/사회활동", icon: "💬" }, { name: "외출", icon: "🏞️" },
    { name: "집안일", icon: "🧹" }, { name: "취미활동", icon: "🎨" },
    { name: "휴식", icon: "🛋️" }, { name: "기타", icon: "✨" }
  ];

  /* 종목명 → 카테고리 라벨/아이콘 조회 */
  function exerciseCat(name) {
    for (var i = 0; i < EXERCISE_CATALOG.length; i++) {
      if (EXERCISE_CATALOG[i].items.indexOf(name) >= 0) return EXERCISE_CATALOG[i];
    }
    return EXERCISE_CATALOG[EXERCISE_CATALOG.length - 1]; // 기타
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
    $("#userChip").addEventListener("click", function () { showView("profile"); });
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
      var name = $("#onboardName").value.trim();
      if (name) {
        Store.saveProfile(Object.assign(Store.getProfile(), { name: name }));
        refreshUserChip();
      }
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
    var name = p.name || "사용자";
    $("#userName").textContent = name;
    $("#userAvatar").textContent = name.slice(0, 1);
    $("#dashSub").textContent = (p.name ? p.name + "님의 " : "") + "건강 통계";
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
    cards.push(dashCard("🙂", avgMood != null ? MOOD_FACES[avgMood] : "–", "최근 컨디션", "", "amber"));

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
        var d = (tv || 0) - (bv || 0);
        var cls = d > 0 ? "up" : (d < 0 ? "down" : "same");
        var arrow = d > 0 ? "▲" : (d < 0 ? "▼" : "–");
        var row = el("div", "item-change " + cls);
        row.innerHTML =
          '<span class="ic-text">' + escapeHtml(q.text) + '</span>' +
          '<span class="ic-scores">' + (bv != null ? bv : "-") + ' → ' + (tv != null ? tv : "-") +
            ' <span class="ic-arrow">' + arrow + (d !== 0 ? " " + (d > 0 ? "+" : "") + d : "") + '</span></span>';
        group.appendChild(row);
      });
      itemBox.appendChild(group);
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
    $("#painLevel").addEventListener("input", function (e) {
      draft.pain = Number(e.target.value); $("#painValue").textContent = draft.pain;
    });
    $("#spasticity").addEventListener("input", function (e) {
      draft.spasticity = Number(e.target.value); $("#spasticityValue").textContent = draft.spasticity;
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
    cat.items.forEach(function (name) {
      var added = draft.exercises.some(function (e) { return e.type === name; });
      var b = el("button", "item-btn" + (added ? " added" : ""),
        (added ? "✓ " : "＋ ") + escapeHtml(name));
      b.type = "button";
      b.addEventListener("click", function () {
        if (added) { // 이미 추가됨 → 토글 해제
          draft.exercises = draft.exercises.filter(function (e) { return e.type !== name; });
        } else {
          draft.exercises.push({ type: name, minutes: 30, intensity: "보통" });
        }
        renderExerciseItems();
        renderExerciseList();
      });
      box.appendChild(b);
    });
  }

  /* ---- 활동: 종목 버튼 ---- */
  function renderActivityItems() {
    var box = $("#actItems");
    box.innerHTML = "";
    ACTIVITY_ITEMS.forEach(function (act) {
      var added = draft.activities.some(function (a) { return a.name === act.name; });
      var b = el("button", "item-btn" + (added ? " added" : ""),
        '<span aria-hidden="true">' + act.icon + '</span> ' + (added ? "✓ " : "") + escapeHtml(act.name));
      b.type = "button";
      b.addEventListener("click", function () {
        if (added) {
          draft.activities = draft.activities.filter(function (a) { return a.name !== act.name; });
        } else {
          draft.activities.push({ name: act.name, minutes: 30 });
        }
        renderActivityItems();
        renderActivityList();
      });
      box.appendChild(b);
    });
  }

  function updateMoodUI() {
    $all(".mood-btn").forEach(function (b) {
      b.classList.toggle("selected", Number(b.getAttribute("data-mood")) === draft.mood);
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
      vitals: {
        bpSys: numOrNull("#bpSys"), bpDia: numOrNull("#bpDia"),
        pulse: numOrNull("#pulse"), temp: numOrNull("#temp")
      },
      exercises: draft.exercises.slice(), activities: draft.activities.slice(),
      memo: $("#memo").value.trim()
    });
    $("#saveHint").textContent = "✓ " + fmtDate(date) + " 기록이 저장되었어요.";
    toast("저장 완료!");
  }
  function numOrNull(sel) { var v = $(sel).value; return v ? Number(v) : null; }

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
      var v = r.vitals || {};
      $("#bpSys").value = v.bpSys != null ? v.bpSys : "";
      $("#bpDia").value = v.bpDia != null ? v.bpDia : "";
      $("#pulse").value = v.pulse != null ? v.pulse : "";
      $("#temp").value = v.temp != null ? v.temp : "";
      $("#memo").value = r.memo || "";
      $("#saveHint").textContent = "이 날짜에 저장된 기록을 불러왔어요. 수정 후 다시 저장할 수 있어요.";
    } else {
      $("#bpSys").value = ""; $("#bpDia").value = ""; $("#pulse").value = ""; $("#temp").value = "";
      $("#memo").value = ""; $("#saveHint").textContent = "";
    }
    $("#painLevel").value = draft.pain; $("#painValue").textContent = draft.pain;
    $("#spasticity").value = draft.spasticity; $("#spasticityValue").textContent = draft.spasticity;
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
      tags.push(r.pain >= 4 ? '<span class="tag alert">통증 ' + r.pain + '</span>'
        : '<span class="tag">통증 ' + (r.pain || 0) + '</span>');
      if (r.spasticity >= 4) tags.push('<span class="tag alert">경직 ' + r.spasticity + '</span>');
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
      if (r.vitals && r.vitals.bpSys) tags.push('<span class="tag">혈압 ' + r.vitals.bpSys + '/' + (r.vitals.bpDia || "-") + '</span>');

      var card = el("div", "history-card",
        '<div class="history-card-head">' +
          '<span class="history-date">' + fmtDate(r.date) + '</span>' +
          '<span class="history-mood">' + (r.mood != null ? MOOD_FACES[r.mood] : "") + '</span>' +
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
    var avg = moods.length ? MOOD_FACES[Math.round(moods.reduce(function (a, b) { return a + b; }) / moods.length)] : "–";
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
    var headers = ["날짜", "컨디션(1-5)", "통증(0-10)", "경직(0-10)", "소변횟수", "배변횟수",
      "피부상태", "혈압수축기", "혈압이완기", "맥박", "체온",
      "운동", "운동시간(분)", "활동", "활동시간(분)", "메모"];
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
      var v = r.vitals || {};
      rows.push([r.date, r.mood != null ? r.mood : "", r.pain != null ? r.pain : "",
        r.spasticity != null ? r.spasticity : "", r.urine != null ? r.urine : "",
        r.bowel != null ? r.bowel : "", r.skin ? SKIN_LABELS[r.skin] : "",
        v.bpSys != null ? v.bpSys : "", v.bpDia != null ? v.bpDia : "",
        v.pulse != null ? v.pulse : "", v.temp != null ? v.temp : "",
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
    var avgPain = pains.length ? (pains.reduce(function (a, b) { return a + b; }) / pains.length).toFixed(1) : "–";
    var moods = mrecs.filter(function (r) { return r.mood != null; }).map(function (r) { return r.mood; });
    var avgMood = moods.length ? MOOD_FACES[Math.round(moods.reduce(function (a, b) { return a + b; }) / moods.length)] : "–";

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
      else if (trendMetric === "pain") { val = r && r.pain != null ? r.pain : 0; max = 10; label = (r && r.pain != null) ? String(val) : ""; }
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
    var highPain = recent.filter(function (r) { return r.pain != null && r.pain >= 6; });
    if (highPain.length >= 2) {
      alerts.push({ level: "warn", icon: "⚡", title: "통증이 높은 날이 이어지고 있어요", desc: "최근 통증 점수가 6 이상인 날이 " + highPain.length + "일 있어요. 무리하지 말고 담당 의료진과 상의해 보세요." });
    } else if (recent[0] && recent[0].pain != null && recent[0].pain >= 8) {
      alerts.push({ level: "warn", icon: "⚡", title: "오늘 통증이 심해요", desc: "통증 " + recent[0].pain + "점. 자세·휴식을 점검하고 필요 시 도움을 요청하세요." });
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
    if (recent[0] && recent[0].spasticity != null && recent[0].spasticity >= 7) {
      alerts.push({ level: "warn", icon: "🌀", title: "경직이 심한 편이에요", desc: "경직 " + recent[0].spasticity + "점. 스트레칭·자세 관리를 신경 써 주세요." });
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
    var p = Store.getProfile();
    $("#pName").value = p.name || ""; $("#pId").value = p.id || "";
    $("#pAge").value = p.age || ""; $("#pSex").value = p.sex || "";
    $("#pLevel").value = p.level || ""; $("#pCompleteness").value = p.completeness || "";
    $("#pInjuryDate").value = p.injuryDate || "";

    $("#saveProfileBtn").addEventListener("click", function () {
      Store.saveProfile({
        name: $("#pName").value.trim(), id: $("#pId").value.trim(),
        age: $("#pAge").value ? Number($("#pAge").value) : "",
        sex: $("#pSex").value, level: $("#pLevel").value,
        completeness: $("#pCompleteness").value, injuryDate: $("#pInjuryDate").value
      });
      $("#profileHint").textContent = "✓ 내 정보가 저장되었어요.";
      refreshUserChip();
      toast("정보 저장 완료!");
    });
    $("#clearAllBtn").addEventListener("click", function () {
      if (!confirm("정말 모든 기록과 정보를 삭제할까요?\n이 작업은 되돌릴 수 없습니다.")) return;
      Store.clearAll();
      location.reload();
    });
  }

  /* =========================================================
     init
     ========================================================= */
  function init() {
    initNav();
    initOnboarding();
    initSurvey();
    initAnalysis();
    initMonthly();
    initRecord();
    initProfile();
    initGoals();
    $("#exportBtn").addEventListener("click", exportCSV);

    refreshUserChip();
    showView("dashboard");
    maybeOnboard();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else { init(); }
})();
