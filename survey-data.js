/* =========================================================
   survey-data.js — 기능평가 설문 정의
   ---------------------------------------------------------
   척수손상(SCI) 참여자의 기능 상태 · 자립도 · 활동 수준 ·
   삶의 질을 5단계(0~4)로 평가한다.

   중요 규칙: 모든 문항은 "점수가 높을수록 좋은 상태"로 통일.
   → 초기 대비 재평가 시 "점수가 오르면 개선"으로 일관되게
     비교/분석할 수 있다.

   구조:
   SURVEY_SECTIONS = [{ id, title, icon, desc, questions: [
     { id, text, options: [4단계 라벨...] }  // index 0 = 0점
   ]}]
   ========================================================= */
(function (global) {
  "use strict";

  // 자립도 계열 공통 5단계 라벨
  var IND = ["전혀 못함", "많은 도움 필요", "약간 도움 필요", "대체로 혼자", "완전히 혼자"];

  var SURVEY_SECTIONS = [
    {
      id: "function",
      title: "신체 기능 상태",
      icon: "🦾",
      desc: "기본적인 신체 기능을 스스로 얼마나 수행할 수 있나요?",
      questions: [
        { id: "reach",   text: "팔 뻗기 (물건을 향해 팔을 뻗을 수 있음)",
          options: ["전혀 못함", "약간 움직임", "도움받아 가능", "대체로 혼자", "완전히 자유롭게"] },
        { id: "grasp",   text: "손으로 잡기 (물건을 쥐고 놓을 수 있음)",
          options: ["전혀 못함", "약간 움직임", "도움받아 가능", "대체로 혼자", "완전히 자유롭게"] },
        { id: "sitting", text: "앉은 자세 유지 (지지 없이 앉아 있기)",
          options: ["전혀 못함", "기대야만 가능", "잠깐 가능", "대체로 안정적", "완전히 안정적"] },
        { id: "standing", text: "서기 (지지대/보조기 포함)",
          options: ["전혀 못함", "도움 많이 필요", "잡고 잠깐 가능", "대체로 혼자", "완전히 혼자"] },
        { id: "breathing", text: "호흡 (숨쉬기의 편안함)",
          options: ["인공호흡기 필요", "많이 힘듦", "가끔 힘듦", "대체로 편함", "완전히 정상"] }
      ]
    },
    {
      id: "adl",
      title: "일상생활 자립도",
      icon: "🧼",
      desc: "일상적인 자기관리를 얼마나 스스로 하나요?",
      questions: [
        { id: "eating",  text: "식사하기", options: IND },
        { id: "bathing", text: "목욕 / 씻기", options: IND },
        { id: "dressing", text: "옷 입고 벗기", options: IND },
        { id: "toileting", text: "용변 처리 (화장실 이용)", options: IND },
        { id: "bladder", text: "배뇨 관리",
          options: ["전혀 못함", "많은 도움 필요", "약간 도움 필요", "대체로 혼자", "완전히 스스로 관리"] },
        { id: "bowel",   text: "배변 관리",
          options: ["전혀 못함", "많은 도움 필요", "약간 도움 필요", "대체로 혼자", "완전히 스스로 관리"] }
      ]
    },
    {
      id: "mobility",
      title: "이동 능력",
      icon: "🦽",
      desc: "자세 변경과 이동을 얼마나 스스로 하나요?",
      questions: [
        { id: "turning", text: "침대에서 자세 바꾸기 (돌아눕기)", options: IND },
        { id: "transfer", text: "침대 ↔ 휠체어 이동 (트랜스퍼)", options: IND },
        { id: "indoor",  text: "실내 이동",
          options: ["전혀 못함", "많은 도움 필요", "약간 도움 필요", "대체로 혼자", "완전히 혼자"] },
        { id: "outdoor", text: "실외 이동",
          options: ["전혀 못함", "많은 도움 필요", "약간 도움 필요", "대체로 혼자", "완전히 혼자"] }
      ]
    },
    {
      id: "activity",
      title: "활동 수준",
      icon: "🏃",
      desc: "평소 활동량은 어느 정도인가요?",
      questions: [
        { id: "sitting_time", text: "하루 중 앉아서 활동하는 시간",
          options: ["거의 누워 지냄", "1~2시간", "3~4시간", "5~7시간", "8시간 이상"] },
        { id: "exercise_freq", text: "일주일 운동/재활 빈도",
          options: ["전혀 안 함", "주 1회", "주 2~3회", "주 4~5회", "거의 매일"] },
        { id: "outing_freq", text: "외출 빈도",
          options: ["거의 못 나감", "월 1~2회", "주 1회", "주 2~3회", "거의 매일"] }
      ]
    },
    {
      id: "wellbeing",
      title: "신체 · 삶의 질",
      icon: "💗",
      desc: "요즘 몸과 마음 상태는 어떤가요?",
      questions: [
        { id: "pain",    text: "통증 (적을수록 좋음)",
          options: ["매우 심함", "심함", "보통", "약간", "거의 없음"] },
        { id: "fatigue", text: "피로 (적을수록 좋음)",
          options: ["매우 심함", "심함", "보통", "약간", "거의 없음"] },
        { id: "mood",    text: "전반적 기분 / 컨디션",
          options: ["매우 나쁨", "나쁨", "보통", "좋음", "매우 좋음"] }
      ]
    }
  ];

  /* ---- 집계 유틸 ---- */
  var SurveyUtil = {
    sections: SURVEY_SECTIONS,

    totalQuestions: function () {
      return SURVEY_SECTIONS.reduce(function (n, s) { return n + s.questions.length; }, 0);
    },

    // 한 섹션의 최대 점수 (문항수 * 4)
    sectionMax: function (section) {
      return section.questions.length * 4;
    },

    totalMax: function () {
      return this.totalQuestions() * 4;
    },

    // 응답(answers: {questionId: score})에서 섹션 점수 합
    sectionScore: function (section, answers) {
      return section.questions.reduce(function (sum, q) {
        var v = answers[q.id];
        return sum + (typeof v === "number" ? v : 0);
      }, 0);
    },

    totalScore: function (answers) {
      var self = this;
      return SURVEY_SECTIONS.reduce(function (sum, s) {
        return sum + self.sectionScore(s, answers);
      }, 0);
    },

    // 0~100 백분율
    totalPercent: function (answers) {
      var max = this.totalMax();
      return max ? Math.round((this.totalScore(answers) / max) * 100) : 0;
    },

    // 특정 문항 정보 찾기
    findQuestion: function (qid) {
      for (var i = 0; i < SURVEY_SECTIONS.length; i++) {
        var s = SURVEY_SECTIONS[i];
        for (var j = 0; j < s.questions.length; j++) {
          if (s.questions[j].id === qid) {
            return { section: s, question: s.questions[j] };
          }
        }
      }
      return null;
    }
  };

  global.SurveyData = SurveyUtil;
})(window);
