/* SCI 재활 플랫폼 — 공통 스크립트
 *
 * [발전 가이드]
 * 데이터 접근은 모두 window.SCIStore 를 통해서만 이루어집니다.
 * 지금은 /data/*.json 을 fetch 하지만, 나중에 Supabase 등 실제 API로
 * 바꿀 때 이 store 내부 구현만 교체하면 화면 코드는 그대로 동작합니다.
 */

(function () {
  "use strict";

  // ---- 데이터 접근 계층 (이후 Supabase 등으로 교체하는 유일한 지점) ----
  const cache = {};
  async function load(name) {
    if (cache[name]) return cache[name];
    const res = await fetch(`data/${name}.json`, { cache: "no-cache" });
    if (!res.ok) throw new Error(`데이터를 불러오지 못했습니다: ${name}`);
    const json = await res.json();
    cache[name] = json;
    return json;
  }

  const Store = {
    getContent: async () => (await load("content")).items,
    getInjuryLevels: async () => (await load("injury-levels")),
    getJourney: async () => (await load("journey")).stages,
    getPrograms: async () => (await load("programs")).programs,
    getTreatments: async () => (await load("treatments")),
  };
  window.SCIStore = Store;

  // ---- 태그 라벨 사전 (화면 표시에 사용) ----
  const AREA_LABELS = {
    sci: "SCI 이해", adl: "일상생활(ADL)", wheelchair: "휠체어", skin: "피부관리",
    bladder: "배뇨", bowel: "배변", exercise: "운동", transfer: "이동(Transfer)",
    discharge: "퇴원준비", at: "보조공학", community: "지역사회",
  };
  const AUDIENCE_LABELS = { patient: "환자", caregiver: "보호자", professional: "전문가" };
  const TYPE_LABELS = { video: "영상", document: "문서", guide: "가이드" };
  const STATUS_LABELS = { draft: "초안", in_review: "검토중", approved: "검토완료" };
  window.SCILabels = { AREA_LABELS, AUDIENCE_LABELS, TYPE_LABELS, STATUS_LABELS };

  // ---- 안전한 DOM 헬퍼 ----
  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") node.className = v;
      else if (k === "html") node.innerHTML = v;
      else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
      else if (v !== null && v !== undefined) node.setAttribute(k, v);
    }
    (Array.isArray(children) ? children : [children]).forEach((c) => {
      if (c == null) return;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return node;
  }
  window.el = el;

  // ---- 공통 헤더/푸터 주입 ----
  const NAV = [
    { href: "index.html", label: "홈" },
    { href: "treatments.html", label: "치료 안내" },
    { href: "journey.html", label: "재활 여정" },
    { href: "injury-levels.html", label: "손상수준 가이드" },
    { href: "programs.html", label: "재활 프로그램" },
    { href: "library.html", label: "교육자료실" },
  ];

  function buildHeader(current) {
    const nav = el("nav", { class: "main-nav", "aria-label": "주 메뉴" },
      NAV.map((n) => el("a", {
        href: n.href,
        ...(n.href === current ? { "aria-current": "page" } : {}),
      }, n.label))
    );

    const tools = el("div", { class: "a11y-tools", role: "group", "aria-label": "접근성 도구" }, [
      el("button", {
        type: "button", "aria-pressed": "false", title: "글자 크기 키우기",
        onclick: (e) => { const on = document.body.classList.toggle("large-text"); e.currentTarget.setAttribute("aria-pressed", String(on)); localStorage.setItem("sci-large", on); },
      }, "가+"),
      el("button", {
        type: "button", "aria-pressed": "false", title: "고대비 모드",
        onclick: (e) => { const on = document.body.classList.toggle("high-contrast"); e.currentTarget.setAttribute("aria-pressed", String(on)); localStorage.setItem("sci-contrast", on); },
      }, "◑"),
    ]);

    return el("header", { class: "site-header" },
      el("div", { class: "container" },
        el("div", { class: "bar" }, [
          el("a", { class: "brand", href: "index.html" }, [
            el("span", { class: "logo", "aria-hidden": "true" }, "SCI"),
            el("span", {}, "척수손상 재활 플랫폼"),
          ]),
          nav,
          tools,
        ])
      )
    );
  }

  function buildFooter() {
    return el("footer", { class: "site-footer" },
      el("div", { class: "container" }, [
        el("div", { class: "grid grid-3" }, [
          el("div", {}, [
            el("strong", {}, "척수손상 재활 플랫폼"),
            el("p", { style: "color:#9fb0c0;margin:.4rem 0 0" }, "평가부터 재활, 휠체어, 보호자 교육, 퇴원과 지역사회 복귀까지 함께합니다."),
          ]),
          el("div", {}, [
            el("strong", {}, "바로가기"),
            el("p", { style: "margin:.4rem 0 0" }, [
              el("a", { href: "treatments.html" }, "치료 안내"), " · ",
              el("a", { href: "journey.html" }, "재활 여정"), " · ",
              el("a", { href: "library.html" }, "교육자료실"), " · ",
              el("a", { href: "injury-levels.html" }, "손상수준 가이드"),
            ]),
          ]),
          el("div", {}, [
            el("strong", {}, "문의"),
            el("p", { style: "color:#9fb0c0;margin:.4rem 0 0" }, "입원·상담 문의는 담당 센터로 연락해 주세요."),
          ]),
        ]),
        el("div", { class: "disclaimer" },
          "본 플랫폼의 정보는 교육 목적이며, 담당 의료진의 진단·치료 판단을 대체하지 않습니다. " +
          "증상이 갑자기 악화되거나 응급 상황(심한 두통·혈압 상승, 호흡곤란, 발열, 욕창 악화 등)이 의심되면 즉시 의료진에게 연락하거나 119에 도움을 요청하세요."),
      ])
    );
  }

  function initChrome(current) {
    // 저장된 접근성 설정 복원
    if (localStorage.getItem("sci-large") === "true") document.body.classList.add("large-text");
    if (localStorage.getItem("sci-contrast") === "true") document.body.classList.add("high-contrast");

    const skip = el("a", { class: "skip-link", href: "#main" }, "본문 바로가기");
    document.body.insertBefore(skip, document.body.firstChild);
    document.body.insertBefore(buildHeader(current), skip.nextSibling);
    document.body.appendChild(buildFooter());

    // 접근성 버튼 상태 반영
    document.querySelectorAll(".a11y-tools button").forEach((b, i) => {
      if (i === 0 && document.body.classList.contains("large-text")) b.setAttribute("aria-pressed", "true");
      if (i === 1 && document.body.classList.contains("high-contrast")) b.setAttribute("aria-pressed", "true");
    });
  }
  window.SCIChrome = { init: initChrome };
})();
