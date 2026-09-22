(function () {
  const STORAGE = "stlk2_progress_v1";
  const VALID_STATUS = { done: true, missed: true };
  const SORT_MODES = { region: true, name: true, status: true };
  const UNDO_MS = 10000;

  const TYPE_OF = {
    SQ: "quest",
    E_SQ: "quest",
    DLC_SQ: "quest",
    E_MQ_C: "quest",
    MQ: "main",
    DLC_MQ: "main",
    EQ: "encounter",
    E_EQ: "encounter",
    ANCQ: "encounter",
    DLC_EQ: "encounter",
    UX_EQ: "encounter",
    UX_ANCQ: "encounter",
    RQ: "trader",
    DLC_ANEQ: "radio",
  };

  const MODES = { side: true, story: true };
  const CAMPAIGNS = { base: true, coh: true, all: true };
  const BRANCHES = {
    all: true,
    ward: true,
    spark: true,
    independent: true,
    duty: true,
    freedom: true,
  };
  const BASE_BRANCHES = { all: true, ward: true, spark: true, independent: true };
  const COH_BRANCHES = { all: true, duty: true, freedom: true };

  const state = {
    items: (window.STLK2_CATALOG && window.STLK2_CATALOG.items) || [],
    progress: {},
    mode: "side",
    campaign: "base",
    branch: "all",
    query: "",
    region: [],
    type: [],
    timing: [],
    status: [],
    sort: "region",
    openNotes: {},
    openSpoilers: {},
  };

  var undoTimer = null;
  var undoSnapshot = null;
  var urlSyncReady = false;

  const el = {
    title: document.getElementById("app-title"),
    search: document.getElementById("search"),
    region: document.getElementById("filter-region"),
    type: document.getElementById("filter-type"),
    timing: document.getElementById("filter-timing"),
    status: document.getElementById("filter-status"),
    sort: document.getElementById("sort"),
    sortLabel: document.getElementById("sort-label"),
    langSwitch: document.getElementById("lang-switch"),
    langLabel: document.getElementById("lang-label"),
    list: document.getElementById("list"),
    progressBar: document.getElementById("progress-bar"),
    progressFill: document.getElementById("progress-fill"),
    progressText: document.getElementById("progress-text"),
    progressMissed: document.getElementById("progress-missed"),
    showing: document.getElementById("showing"),
    chips: document.getElementById("filter-chips"),
    legend: document.getElementById("legend"),
    legendLabel: document.getElementById("legend-label"),
    modeSwitch: document.getElementById("mode-switch"),
    modeLabel: document.getElementById("mode-label"),
    campaignSwitch: document.getElementById("campaign-switch"),
    campaignLabel: document.getElementById("campaign-label"),
    branchSwitch: document.getElementById("branch-switch"),
    branchLabel: document.getElementById("branch-label"),
    btnExport: document.getElementById("btn-export"),
    btnImport: document.getElementById("btn-import"),
    btnReset: document.getElementById("btn-reset"),
    fileImport: document.getElementById("file-import"),
    toast: document.getElementById("toast"),
    railUnit: document.getElementById("rail-unit"),
    railCredits: document.getElementById("rail-credits"),
    pdaSignal: document.getElementById("pda-signal"),
    pdaEmission: document.getElementById("pda-emission"),
  };

  function loadProgress() {
    try {
      var parsed = JSON.parse(localStorage.getItem(STORAGE) || "{}") || {};
      state.progress = sanitizeProgress(parsed).progress;
    } catch (_) {
      state.progress = {};
    }
  }

  function saveProgress() {
    localStorage.setItem(STORAGE, JSON.stringify(state.progress));
  }

  function knownIds() {
    var map = {};
    state.items.forEach(function (item) {
      map[item.id] = true;
    });
    return map;
  }

  function sanitizeProgress(raw) {
    var out = {};
    var skipped = 0;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return { progress: null, skipped: 0 };
    }
    var known = knownIds();
    Object.keys(raw).forEach(function (id) {
      var value = raw[id];
      if (!VALID_STATUS[value]) {
        skipped += 1;
        return;
      }
      if (!known[id]) {
        skipped += 1;
        return;
      }
      out[id] = value;
    });
    return { progress: out, skipped: skipped };
  }

  function getStatus(id) {
    return state.progress[id] || "open";
  }

  function setStatus(id, status, opts) {
    opts = opts || {};
    if (status === "open") delete state.progress[id];
    else state.progress[id] = status;
    saveProgress();
    if (opts.flash) state.flashId = id;
    render();
  }

  function clearFilters() {
    state.query = "";
    state.region = [];
    state.type = [];
    state.timing = [];
    state.status = [];
    if (isStoryMode()) {
      state.campaign = "base";
      state.branch = "all";
    }
    el.search.value = "";
    render();
  }

  function hasActiveFilters() {
    return (
      !!state.query.trim() ||
      state.region.length > 0 ||
      state.type.length > 0 ||
      state.timing.length > 0 ||
      state.status.length > 0 ||
      (isStoryMode() && state.campaign && state.campaign !== "base") ||
      (isStoryMode() && state.branch && state.branch !== "all")
    );
  }

  function itemTags(item) {
    return item && Array.isArray(item.tags) ? item.tags : [];
  }

  function hasTag(item, tag) {
    return itemTags(item).indexOf(tag) !== -1;
  }

  function hasTagPrefix(item, prefix) {
    var tags = itemTags(item);
    for (var i = 0; i < tags.length; i++) {
      if (String(tags[i]).indexOf(prefix) === 0) return true;
    }
    return false;
  }

  function isExclusiveItem(item) {
    return hasTag(item, "exclusive") || hasTagPrefix(item, "ending:");
  }

  function isPonrItem(item) {
    return hasTag(item, "point-of-no-return");
  }

  function isCohItem(item) {
    return item.category === "DLC_MQ" || hasTag(item, "dlc:coh");
  }

  /** Route/ending family for Story branch chips; null = shared trunk. */
  function storyBranchKey(item) {
    var tags = itemTags(item);
    if (tags.indexOf("branch:ward") !== -1 || tags.indexOf("ending:ward") !== -1) {
      return "ward";
    }
    if (tags.indexOf("branch:spark") !== -1 || tags.indexOf("ending:spark") !== -1) {
      return "spark";
    }
    if (
      tags.indexOf("branch:independent") !== -1 ||
      tags.indexOf("ending:strelok") !== -1 ||
      tags.indexOf("ending:kaymanov") !== -1
    ) {
      return "independent";
    }
    if (tags.indexOf("branch:duty") !== -1 || tags.indexOf("ending:coh-duty") !== -1) {
      return "duty";
    }
    if (
      tags.indexOf("branch:freedom") !== -1 ||
      tags.indexOf("ending:coh-freedom") !== -1
    ) {
      return "freedom";
    }
    return null;
  }

  function campaignBranchSet() {
    return state.campaign === "coh" ? COH_BRANCHES : BASE_BRANCHES;
  }

  function branchAllowedForCampaign(branch, campaign) {
    var set = campaign === "coh" ? COH_BRANCHES : BASE_BRANCHES;
    return !!set[branch];
  }

  function passesCampaignFilter(item) {
    if (!isStoryMode() || !state.campaign || state.campaign === "all") return true;
    var coh = isCohItem(item);
    if (state.campaign === "coh") return coh;
    if (state.campaign === "base") return !coh;
    return true;
  }

  function passesBranchFilter(item) {
    if (!isStoryMode() || !state.branch || state.branch === "all") return true;
    var key = storyBranchKey(item);
    if (key === null) return true;
    return key === state.branch;
  }

  /** v1 Story 100%: shared trunk always; exclusives/endings only if marked. */
  function progressPool(pool) {
    if (!isStoryMode()) return pool;
    return pool.filter(function (item) {
      if (!isExclusiveItem(item)) return true;
      return getStatus(item.id) !== "open";
    });
  }

  function playerType(item) {
    if (item.kind === "collectible_group") return "radio";
    if (item.kind === "repeatable_slot") return "trader";
    if (item.kind === "followup" || item.kind === "subobjective" || item.kind === "prerequisite")
      return "extra";
    return TYPE_OF[item.category] || "extra";
  }

  function isMainStoryItem(item) {
    return playerType(item) === "main" || item.category === "MQ" || item.category === "DLC_MQ";
  }

  function isStoryMode() {
    return state.mode === "story";
  }

  function modeItems() {
    return state.items.filter(function (item) {
      return isStoryMode() ? isMainStoryItem(item) : !isMainStoryItem(item);
    });
  }

  function typePairsForMode() {
    if (isStoryMode()) {
      return [
        ["main", I18n.t("typeMain")],
        ["extra", I18n.t("typeExtra")],
      ];
    }
    return [
      ["quest", I18n.t("typeQuest")],
      ["encounter", I18n.t("typeEncounter")],
      ["trader", I18n.t("typeTrader")],
      ["radio", I18n.t("typeRadio")],
      ["extra", I18n.t("typeExtra")],
    ];
  }

  function sanitizeModeFilters() {
    var allowed = {};
    typePairsForMode().forEach(function (pair) {
      allowed[pair[0]] = true;
    });
    state.type = state.type.filter(function (v) {
      return allowed[v];
    });
  }

  function setMode(next) {
    if (!MODES[next] || next === state.mode) return;
    state.mode = next;
    if (next !== "story") {
      state.campaign = "base";
      state.branch = "all";
    }
    sanitizeModeFilters();
    render();
  }

  function setCampaign(next) {
    if (!CAMPAIGNS[next] || next === state.campaign) return;
    if (!isStoryMode()) return;
    state.campaign = next;
    if (!branchAllowedForCampaign(state.branch, next)) state.branch = "all";
    render();
  }

  function setBranch(next) {
    if (!BRANCHES[next] || next === state.branch) return;
    if (!isStoryMode()) return;
    if (!campaignBranchSet()[next]) return;
    state.branch = next;
    render();
  }

  function isRelatedStep(item) {
    return (
      item.kind === "followup" ||
      item.kind === "subobjective" ||
      item.kind === "prerequisite"
    );
  }

  var childrenOf = (function buildChildrenIndex() {
    var map = {};
    state.items.forEach(function (item) {
      if (!item.parentId) return;
      if (!map[item.parentId]) map[item.parentId] = [];
      map[item.parentId].push(item);
    });
    return map;
  })();

  var itemsById = (function buildById() {
    var map = {};
    state.items.forEach(function (item) {
      map[item.id] = item;
    });
    return map;
  })();

  function hasOpenRelated(id) {
    var kids = childrenOf[id];
    if (!kids) return false;
    for (var i = 0; i < kids.length; i++) {
      if (getStatus(kids[i].id) === "open") return true;
    }
    return false;
  }

  function passesSearch(item, q) {
    if (!q) return true;
    var hay = [
      I18n.questName(item.id),
      I18n.regionName(item.region),
      I18n.locationText(item.location),
      I18n.note(item.id, item.summary_en),
      I18n.hint(item.id, item.hint_en),
    ]
      .join(" ")
      .toLowerCase();
    return hay.indexOf(q) !== -1;
  }

  function passesCoreFilters(item, q) {
    if (!inFilter(state.region, item.region)) return false;
    if (!inFilter(state.timing, item.pm ? "pm" : "pre")) return false;
    return passesSearch(item, q);
  }

  function fillSelect(select, pairs, current) {
    select.innerHTML = "";
    pairs.forEach(function (pair) {
      var o = document.createElement("option");
      o.value = pair[0];
      o.textContent = pair[1];
      select.appendChild(o);
    });
    select.value = current;
  }

  function closeAllMultis(except) {
    document.querySelectorAll(".ms.is-open").forEach(function (node) {
      if (node === except) return;
      node.classList.remove("is-open");
      var btn = node.querySelector(".ms-btn");
      if (btn) btn.setAttribute("aria-expanded", "false");
      clearMsHighlight(node);
    });
  }

  function selectedLabel(pairs, selected, allLabel) {
    if (!selected.length) return allLabel;
    var labels = [];
    pairs.forEach(function (pair) {
      if (selected.indexOf(pair[0]) !== -1) labels.push(pair[1]);
    });
    if (labels.length === 1) return labels[0];
    return I18n.t("filterN").replace("{n}", String(labels.length));
  }

  function syncMulti(root, pairs, key, allLabel) {
    var selected = state[key];
    var lab = root.querySelector(".ms-lab");
    if (lab) lab.textContent = selectedLabel(pairs, selected, allLabel);
    root.classList.toggle("has-pick", selected.length > 0);
    root.querySelectorAll(".ms-opt input").forEach(function (cb) {
      if (cb.dataset.all) cb.checked = selected.length === 0;
      else cb.checked = selected.indexOf(cb.value) !== -1;
    });
  }

  function msOptions(root) {
    return Array.prototype.slice.call(root.querySelectorAll(".ms-opt"));
  }

  function clearMsHighlight(root) {
    msOptions(root).forEach(function (opt) {
      opt.classList.remove("is-active");
    });
    root._msIndex = -1;
  }

  function setMsHighlight(root, index) {
    var opts = msOptions(root);
    if (!opts.length) return;
    if (index < 0) index = 0;
    if (index >= opts.length) index = opts.length - 1;
    opts.forEach(function (opt, i) {
      opt.classList.toggle("is-active", i === index);
    });
    root._msIndex = index;
    var active = opts[index];
    if (active && active.scrollIntoView) {
      active.scrollIntoView({ block: "nearest" });
    }
  }

  function toggleMsOption(root, opt) {
    var cb = opt && opt.querySelector("input");
    if (!cb) return;
    cb.checked = !cb.checked;
    cb.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function handleMsKeydown(root, e) {
    if (!root.classList.contains("is-open")) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        closeAllMultis();
        root.classList.add("is-open");
        var btn = root.querySelector(".ms-btn");
        if (btn) btn.setAttribute("aria-expanded", "true");
        setMsHighlight(root, e.key === "ArrowUp" ? msOptions(root).length - 1 : 0);
      }
      return;
    }

    var opts = msOptions(root);
    var idx = typeof root._msIndex === "number" ? root._msIndex : -1;

    if (e.key === "Escape") {
      e.preventDefault();
      closeAllMultis();
      var b = root.querySelector(".ms-btn");
      if (b) b.focus();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setMsHighlight(root, idx < 0 ? 0 : idx + 1);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setMsHighlight(root, idx < 0 ? opts.length - 1 : idx - 1);
      return;
    }
    if (e.key === "Home") {
      e.preventDefault();
      setMsHighlight(root, 0);
      return;
    }
    if (e.key === "End") {
      e.preventDefault();
      setMsHighlight(root, opts.length - 1);
      return;
    }
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      if (idx >= 0 && opts[idx]) toggleMsOption(root, opts[idx]);
    }
  }

  function fillMulti(root, pairs, key, allLabel, ariaLabel) {
    var sig =
      key +
      "\n" +
      allLabel +
      "\n" +
      pairs
        .map(function (p) {
          return p[0] + "\0" + p[1];
        })
        .join("\n");

    if (!root._msReady) {
      root.classList.add("ms");
      root.innerHTML = "";

      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ms-btn";
      btn.setAttribute("aria-haspopup", "listbox");
      btn.setAttribute("aria-expanded", "false");
      var lab = document.createElement("span");
      lab.className = "ms-lab";
      btn.appendChild(lab);

      var menu = document.createElement("div");
      menu.className = "ms-menu";
      menu.setAttribute("role", "listbox");
      menu.setAttribute("aria-multiselectable", "true");

      btn.addEventListener("click", function () {
        var willOpen = !root.classList.contains("is-open");
        closeAllMultis();
        if (willOpen) {
          root.classList.add("is-open");
          btn.setAttribute("aria-expanded", "true");
          setMsHighlight(root, 0);
        }
      });

      btn.addEventListener("keydown", function (e) {
        handleMsKeydown(root, e);
      });

      menu.addEventListener("keydown", function (e) {
        handleMsKeydown(root, e);
      });

      root.appendChild(btn);
      root.appendChild(menu);
      root._msReady = true;
      root._msIndex = -1;
    }

    var btn = root.querySelector(".ms-btn");
    var menu = root.querySelector(".ms-menu");
    btn.title = ariaLabel;
    btn.setAttribute("aria-label", ariaLabel);

    if (root._msSig !== sig) {
      root._msSig = sig;
      menu.innerHTML = "";

      function addRow(value, label, isAll) {
        var row = document.createElement("label");
        row.className = "ms-opt" + (isAll ? " is-all" : "");
        row.setAttribute("role", "option");
        var cb = document.createElement("input");
        cb.type = "checkbox";
        cb.value = value;
        if (isAll) cb.dataset.all = "1";
        var text = document.createElement("span");
        text.textContent = label;
        row.appendChild(cb);
        row.appendChild(text);
        row.addEventListener("mousemove", function () {
          var opts = msOptions(root);
          setMsHighlight(root, opts.indexOf(row));
        });
        cb.addEventListener("change", function () {
          if (isAll) {
            if (!cb.checked && !state[key].length) {
              cb.checked = true;
              return;
            }
            state[key] = [];
          } else if (cb.checked) {
            if (state[key].indexOf(value) === -1) state[key] = state[key].concat([value]);
          } else {
            state[key] = state[key].filter(function (v) {
              return v !== value;
            });
          }
          syncMulti(root, pairs, key, allLabel);
          render();
        });
        menu.appendChild(row);
      }

      addRow("all", allLabel, true);
      pairs.forEach(function (pair) {
        addRow(pair[0], pair[1], false);
      });
    }

    syncMulti(root, pairs, key, allLabel);
  }

  function inFilter(selected, value) {
    return !selected.length || selected.indexOf(value) !== -1;
  }

  function compareLocale(a, b) {
    return String(a).localeCompare(String(b), I18n.getLanguage());
  }

  function statusRank(id) {
    var st = getStatus(id);
    if (st === "open") return 0;
    if (hasOpenRelated(id)) return 0;
    if (st === "done") return 1;
    return 2;
  }

  function urgencyRank(item) {
    if (!item.pm && getStatus(item.id) === "open") return 0;
    // Keep a finished parent near open work while its sequence steps remain open.
    if (hasOpenRelated(item.id)) return 0;
    return 1;
  }

  function compareRoots(a, b) {
    var mode = SORT_MODES[state.sort] ? state.sort : "region";

    if (mode === "name") {
      return compareLocale(I18n.questName(a.id), I18n.questName(b.id));
    }

    if (mode === "status") {
      var sa = statusRank(a.id);
      var sb = statusRank(b.id);
      if (sa !== sb) return sa - sb;
      return compareLocale(I18n.questName(a.id), I18n.questName(b.id));
    }

    var ra = I18n.regionName(a.region) || "";
    var rb = I18n.regionName(b.region) || "";
    var regionCmp = compareLocale(ra, rb);
    if (regionCmp) return regionCmp;
    var urgentA = urgencyRank(a);
    var urgentB = urgencyRank(b);
    if (urgentA !== urgentB) return urgentA - urgentB;
    return compareLocale(I18n.questName(a.id), I18n.questName(b.id));
  }

  function flattenHierarchy(rows) {
    var byId = {};
    rows.forEach(function (item) {
      byId[item.id] = item;
    });
    var childrenOf = {};
    rows.forEach(function (item) {
      if (item.parentId && byId[item.parentId]) {
        if (!childrenOf[item.parentId]) childrenOf[item.parentId] = [];
        childrenOf[item.parentId].push(item);
      }
    });
    Object.keys(childrenOf).forEach(function (pid) {
      childrenOf[pid].sort(function (a, b) {
        return compareLocale(I18n.questName(a.id), I18n.questName(b.id));
      });
    });

    var roots = rows.filter(function (item) {
      return !(item.parentId && byId[item.parentId]);
    });
    roots.sort(compareRoots);

    var out = [];
    roots.forEach(function (root) {
      out.push({ item: root, depth: 0 });
      (childrenOf[root.id] || []).forEach(function (child) {
        out.push({ item: child, depth: 1 });
      });
    });
    return out;
  }

  function regionHeader(regionKey) {
    var head = document.createElement("h2");
    head.className = "region-head";
    head.textContent = regionKey ? I18n.regionName(regionKey) : "—";
    return head;
  }

  function removeFilterValue(key, value) {
    if (key === "query") {
      state.query = "";
      el.search.value = "";
    } else if (key === "branch") {
      state.branch = "all";
    } else if (key === "campaign") {
      state.campaign = "base";
      if (!branchAllowedForCampaign(state.branch, "base")) state.branch = "all";
    } else {
      state[key] = state[key].filter(function (v) {
        return v !== value;
      });
    }
    render();
  }

  function parseListParam(raw) {
    if (!raw) return [];
    return String(raw)
      .split(",")
      .map(function (s) {
        return s.trim();
      })
      .filter(Boolean);
  }

  function readUrlState() {
    var params = new URLSearchParams(location.search);
    if (params.has("mode")) {
      var mode = params.get("mode");
      if (MODES[mode]) state.mode = mode;
    }
    if (params.has("q")) {
      state.query = params.get("q") || "";
      el.search.value = state.query;
    }
    if (params.has("region")) state.region = parseListParam(params.get("region"));
    if (params.has("type")) state.type = parseListParam(params.get("type"));
    if (params.has("timing")) state.timing = parseListParam(params.get("timing"));
    if (params.has("status")) state.status = parseListParam(params.get("status"));
    if (params.has("campaign")) {
      var campaign = params.get("campaign");
      if (CAMPAIGNS[campaign]) state.campaign = campaign;
    }
    if (params.has("branch")) {
      var branch = params.get("branch");
      if (BRANCHES[branch]) state.branch = branch;
    }
    if (params.has("sort")) {
      var sort = params.get("sort");
      if (SORT_MODES[sort]) state.sort = sort;
    }
    if (state.mode !== "story") {
      state.campaign = "base";
      state.branch = "all";
    } else if (!branchAllowedForCampaign(state.branch, state.campaign)) {
      state.branch = "all";
    }
    sanitizeModeFilters();
  }

  function writeUrlState() {
    if (!urlSyncReady) return;
    var params = new URLSearchParams();
    // Default is side — omit so existing side links stay clean.
    if (state.mode && state.mode !== "side") params.set("mode", state.mode);
    if (state.mode === "story" && state.campaign && state.campaign !== "base") {
      params.set("campaign", state.campaign);
    }
    if (state.mode === "story" && state.branch && state.branch !== "all") {
      params.set("branch", state.branch);
    }
    if (state.query.trim()) params.set("q", state.query.trim());
    if (state.region.length) params.set("region", state.region.join(","));
    if (state.type.length) params.set("type", state.type.join(","));
    if (state.timing.length) params.set("timing", state.timing.join(","));
    if (state.status.length) params.set("status", state.status.join(","));
    if (state.sort && state.sort !== "region") params.set("sort", state.sort);
    var next = params.toString();
    var url = location.pathname + (next ? "?" + next : "") + location.hash;
    if (url !== location.pathname + location.search + location.hash) {
      history.replaceState(null, "", url);
    }
  }

  function sortDefaultLabel() {
    return I18n.t("filterRegion") + " · " + I18n.t("pillDoEarly");
  }

  function renderChips() {
    if (!el.chips) return;
    el.chips.innerHTML = "";
    var entries = [];

    if (state.query.trim()) {
      entries.push({
        key: "query",
        value: state.query,
        label: state.query.trim(),
      });
    }

    function pushSelected(key, pairs) {
      state[key].forEach(function (value) {
        var label = value;
        pairs.forEach(function (pair) {
          if (pair[0] === value) label = pair[1];
        });
        entries.push({ key: key, value: value, label: label });
      });
    }

    var regionPairs = [];
    var seen = {};
    modeItems().forEach(function (i) {
      if (i.region && !seen[i.region]) {
        seen[i.region] = true;
        regionPairs.push([i.region, I18n.regionName(i.region)]);
      }
    });
    pushSelected("region", regionPairs);
    pushSelected("type", typePairsForMode());
    pushSelected("timing", [
      ["pre", I18n.t("timingPrePm")],
      ["pm", I18n.t("timingPm")],
    ]);
    pushSelected("status", [
      ["open", I18n.t("statusTodo")],
      ["done", I18n.t("statusDone")],
      ["missed", I18n.t("statusMissed")],
    ]);

    if (isStoryMode() && state.campaign && state.campaign !== "base") {
      var campaignLabel = state.campaign;
      if (state.campaign === "coh") campaignLabel = I18n.t("campaignCoh");
      else if (state.campaign === "all") campaignLabel = I18n.t("campaignAll");
      entries.push({ key: "campaign", value: state.campaign, label: campaignLabel });
    }

    if (isStoryMode() && state.branch && state.branch !== "all") {
      var branchLabel = state.branch;
      if (state.branch === "ward") branchLabel = I18n.t("branchWard");
      else if (state.branch === "spark") branchLabel = I18n.t("branchSpark");
      else if (state.branch === "independent") branchLabel = I18n.t("branchIndependent");
      else if (state.branch === "duty") branchLabel = I18n.t("branchDuty");
      else if (state.branch === "freedom") branchLabel = I18n.t("branchFreedom");
      entries.push({ key: "branch", value: state.branch, label: branchLabel });
    }

    if (!entries.length) {
      el.chips.hidden = true;
      return;
    }

    el.chips.hidden = false;
    entries.forEach(function (entry) {
      var chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip";
      chip.title = I18n.t("clearFilters");
      var lab = document.createElement("span");
      lab.textContent = entry.label;
      var x = document.createElement("span");
      x.className = "chip-x";
      x.textContent = "×";
      x.setAttribute("aria-hidden", "true");
      chip.appendChild(lab);
      chip.appendChild(x);
      chip.addEventListener("click", function () {
        removeFilterValue(entry.key, entry.value);
      });
      el.chips.appendChild(chip);
    });

    var clear = document.createElement("button");
    clear.type = "button";
    clear.className = "chip is-clear";
    clear.textContent = I18n.t("clearFilters");
    clear.addEventListener("click", clearFilters);
    el.chips.appendChild(clear);
  }

  function hideToast() {
    if (!el.toast) return;
    el.toast.hidden = true;
    el.toast.innerHTML = "";
  }

  function clearUndo() {
    if (undoTimer) {
      clearTimeout(undoTimer);
      undoTimer = null;
    }
    undoSnapshot = null;
    hideToast();
  }

  function showUndoToast() {
    if (!el.toast || !undoSnapshot) return;
    el.toast.hidden = false;
    el.toast.innerHTML = "";
    var msg = document.createElement("span");
    msg.className = "toast-msg";
    msg.textContent = I18n.t("undoToastMode");
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "toast-action";
    btn.textContent = I18n.t("btnRestore");
    btn.addEventListener("click", function () {
      if (!undoSnapshot) return;
      state.progress = undoSnapshot;
      saveProgress();
      clearUndo();
      render();
    });
    el.toast.appendChild(msg);
    el.toast.appendChild(btn);
  }

  function syncLangSwitch() {
    if (!el.langSwitch) return;
    var code = I18n.getLanguage();
    var buttons = el.langSwitch.querySelectorAll(".lang-opt");
    for (var i = 0; i < buttons.length; i++) {
      var btn = buttons[i];
      var on = btn.getAttribute("data-lang") === code;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    }
  }

  function syncModeSwitch() {
    if (!el.modeSwitch) return;
    var buttons = el.modeSwitch.querySelectorAll(".mode-opt");
    for (var i = 0; i < buttons.length; i++) {
      var btn = buttons[i];
      var on = btn.getAttribute("data-mode") === state.mode;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      if (btn.getAttribute("data-mode") === "side") {
        btn.textContent = I18n.t("modeSide");
      } else if (btn.getAttribute("data-mode") === "story") {
        btn.textContent = I18n.t("modeStory");
      }
    }
  }

  function syncCampaignSwitch() {
    if (!el.campaignSwitch) return;
    var show = isStoryMode();
    el.campaignSwitch.hidden = !show;
    if (el.campaignLabel) el.campaignLabel.textContent = I18n.t("campaignFilter");
    var buttons = el.campaignSwitch.querySelectorAll(".campaign-opt");
    for (var i = 0; i < buttons.length; i++) {
      var btn = buttons[i];
      var key = btn.getAttribute("data-campaign");
      var on = key === state.campaign;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      if (key === "base") btn.textContent = I18n.t("campaignBase");
      else if (key === "coh") btn.textContent = I18n.t("campaignCoh");
      else if (key === "all") btn.textContent = I18n.t("campaignAll");
    }
  }

  function syncBranchSwitch() {
    if (!el.branchSwitch) return;
    var show = isStoryMode();
    el.branchSwitch.hidden = !show;
    if (el.branchLabel) {
      el.branchLabel.textContent =
        state.campaign === "coh" ? I18n.t("branchFilterCoh") : I18n.t("branchFilter");
    }
    var cohBranches = state.campaign === "coh";
    var buttons = el.branchSwitch.querySelectorAll(".branch-opt");
    for (var i = 0; i < buttons.length; i++) {
      var btn = buttons[i];
      var key = btn.getAttribute("data-branch");
      var group = btn.getAttribute("data-branch-group");
      if (group === "base") btn.hidden = cohBranches;
      else if (group === "coh") btn.hidden = !cohBranches;
      var on = key === state.branch;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      if (key === "all") btn.textContent = I18n.t("branchAll");
      else if (key === "ward") btn.textContent = I18n.t("branchWard");
      else if (key === "spark") btn.textContent = I18n.t("branchSpark");
      else if (key === "independent") btn.textContent = I18n.t("branchIndependent");
      else if (key === "duty") btn.textContent = I18n.t("branchDuty");
      else if (key === "freedom") btn.textContent = I18n.t("branchFreedom");
    }
  }

  function chrome() {
    el.title.textContent = I18n.t("appTitle");
    if (el.railUnit) el.railUnit.textContent = I18n.t("unitId");
    var signalParts = String(I18n.t("signalOk") || "").split(/\s*·\s*/);
    if (el.pdaSignal) el.pdaSignal.textContent = signalParts[0] || "";
    if (el.pdaEmission) el.pdaEmission.textContent = signalParts[1] || signalParts[0] || "";
    if (el.railCredits) el.railCredits.textContent = I18n.t("credits");
    el.search.placeholder = I18n.t("searchPlaceholder");
    el.search.setAttribute("aria-label", I18n.t("searchPlaceholder"));
    if (el.langLabel) el.langLabel.textContent = I18n.t("languageSwitch");
    if (el.modeLabel) el.modeLabel.textContent = I18n.t("modeSwitch");
    syncLangSwitch();
    syncModeSwitch();
    syncCampaignSwitch();
    syncBranchSwitch();
    el.btnExport.textContent = I18n.t("exportProgress");
    el.btnImport.textContent = I18n.t("importProgress");
    el.btnReset.textContent = I18n.t("resetProgress");
    if (isStoryMode() && state.campaign === "coh") {
      el.legend.textContent = I18n.t("legendHintStoryCoh");
    } else if (isStoryMode()) {
      el.legend.textContent = I18n.t("legendHintStory");
    } else {
      el.legend.textContent = I18n.t("legendHint");
    }
    if (el.legendLabel) el.legendLabel.textContent = I18n.t("legendLabel");

    if (el.sort && el.sortLabel) {
      el.sortLabel.textContent = I18n.t("sortBy");
      fillSelect(
        el.sort,
        [
          ["region", sortDefaultLabel()],
          ["name", I18n.t("sortName")],
          ["status", I18n.t("filterStatus")],
        ],
        SORT_MODES[state.sort] ? state.sort : "region"
      );
      el.sort.setAttribute("aria-label", I18n.t("sortBy"));
    }

    fillMulti(
      el.type,
      typePairsForMode(),
      "type",
      I18n.t("typeAll"),
      I18n.t("filterType")
    );

    fillMulti(
      el.timing,
      [
        ["pre", I18n.t("timingPrePm")],
        ["pm", I18n.t("timingPm")],
      ],
      "timing",
      I18n.t("timingAny"),
      I18n.t("filterTiming")
    );

    fillMulti(
      el.status,
      [
        ["open", I18n.t("statusTodo")],
        ["done", I18n.t("statusDone")],
        ["missed", I18n.t("statusMissed")],
      ],
      "status",
      I18n.t("statusAll"),
      I18n.t("filterStatus")
    );

    var regions = [];
    var seen = {};
    modeItems().forEach(function (i) {
      if (i.region && !seen[i.region]) {
        seen[i.region] = true;
        regions.push([i.region, I18n.regionName(i.region)]);
      }
    });
    regions.sort(function (a, b) {
      return a[1].localeCompare(b[1], I18n.getLanguage());
    });
    fillMulti(el.region, regions, "region", I18n.t("regionAll"), I18n.t("filterRegion"));

    if (undoSnapshot) showUndoToast();
  }

  function filtered() {
    var q = state.query.trim().toLowerCase();
    var matched = {};
    var pool = modeItems();
    var poolIds = {};
    pool.forEach(function (item) {
      poolIds[item.id] = true;
    });

    pool.forEach(function (item) {
      if (!passesCoreFilters(item, q)) return;
      if (!passesCampaignFilter(item)) return;
      if (!passesBranchFilter(item)) return;
      if (!inFilter(state.type, playerType(item))) return;
      if (!inFilter(state.status, getStatus(item.id))) return;
      matched[item.id] = true;
    });

    // Related steps are type "extra"; still show them under a matching parent.
    Object.keys(matched).forEach(function (id) {
      (childrenOf[id] || []).forEach(function (child) {
        if (!poolIds[child.id]) return;
        if (!isRelatedStep(child)) return;
        if (!passesCoreFilters(child, q)) return;
        if (!passesCampaignFilter(child)) return;
        if (!passesBranchFilter(child)) return;
        if (!inFilter(state.status, getStatus(child.id))) return;
        matched[child.id] = true;
      });
    });

    // If the parent is filtered out (e.g. marked done while Status = Todo),
    // keep unfinished sequence steps — and the parent for nesting context.
    pool.forEach(function (item) {
      if (!isRelatedStep(item) || !item.parentId) return;
      if (matched[item.id]) return;
      if (!passesCoreFilters(item, q)) return;
      if (!passesCampaignFilter(item)) return;
      if (!passesBranchFilter(item)) return;
      if (!inFilter(state.status, getStatus(item.id))) return;
      var parent = itemsById[item.parentId];
      if (!parent || !poolIds[parent.id] || !passesCoreFilters(parent, q)) return;
      if (!passesCampaignFilter(parent)) return;
      if (!passesBranchFilter(parent)) return;
      var typeOk =
        inFilter(state.type, playerType(item)) ||
        inFilter(state.type, playerType(parent));
      if (!typeOk) return;
      matched[item.id] = true;
      matched[parent.id] = true;
    });

    return pool.filter(function (item) {
      return matched[item.id];
    });
  }

  function render() {
    var scrollY = window.scrollY || document.documentElement.scrollTop || 0;
    var active = document.activeElement;
    var restoreSearch =
      active === el.search ? { start: el.search.selectionStart, end: el.search.selectionEnd } : null;
    var restoreSort = active === el.sort;

    chrome();

    var pool = modeItems();
    var progressItems = progressPool(pool);
    var missedCount = progressItems.filter(function (i) {
      return getStatus(i.id) === "missed";
    }).length;
    var countable = progressItems.filter(function (i) {
      return getStatus(i.id) !== "missed";
    });
    var done = countable.filter(function (i) {
      return getStatus(i.id) === "done";
    }).length;
    var total = countable.length;
    var pct = total ? Math.round((done / total) * 100) : 0;
    var progressLabel = I18n.t("progress")
      .replace("{done}", String(done))
      .replace("{total}", String(total))
      .replace("{pct}", String(pct));
    el.progressFill.style.width = pct + "%";
    el.progressText.textContent = progressLabel;

    var missedLabel = missedCount
      ? missedCount + " · " + I18n.t("statusMissed")
      : "";
    if (el.progressMissed) {
      if (missedCount) {
        el.progressMissed.hidden = false;
        el.progressMissed.textContent = missedLabel;
      } else {
        el.progressMissed.hidden = true;
        el.progressMissed.textContent = "";
      }
    }

    if (el.progressBar) {
      el.progressBar.setAttribute("aria-valuenow", String(pct));
      el.progressBar.setAttribute(
        "aria-valuetext",
        missedLabel ? progressLabel + ". " + missedLabel : progressLabel
      );
    }

    var rows = filtered();
    el.showing.textContent = I18n.t("showing")
      .replace("{n}", String(rows.length))
      .replace("{total}", String(pool.length));

    el.list.innerHTML = "";
    if (!rows.length) {
      var empty = document.createElement("div");
      empty.className = "empty";
      var msg = document.createElement("p");
      msg.className = "empty-msg";
      if (isStoryMode() && !pool.length) {
        msg.textContent = I18n.t("emptyStory");
      } else if (
        isStoryMode() &&
        state.campaign === "coh" &&
        !pool.some(function (item) {
          return isCohItem(item);
        })
      ) {
        msg.textContent = I18n.t("emptyStoryCoh");
      } else if (isStoryMode()) {
        msg.textContent = I18n.t("emptyStoryFiltered");
      } else {
        msg.textContent = I18n.t("empty");
      }
      empty.appendChild(msg);
      if (hasActiveFilters()) {
        var actions = document.createElement("div");
        actions.className = "empty-actions";
        var clearBtn = document.createElement("button");
        clearBtn.type = "button";
        clearBtn.textContent = I18n.t("clearFilters");
        clearBtn.addEventListener("click", clearFilters);
        actions.appendChild(clearBtn);
        empty.appendChild(actions);
      }
      el.list.appendChild(empty);
    } else {
      var frag = document.createDocumentFragment();
      var ordered = flattenHierarchy(rows);
      var lastRegion = null;
      ordered.forEach(function (entry) {
        var regionKey = entry.item.region || "";
        if (regionKey !== lastRegion) {
          lastRegion = regionKey;
          frag.appendChild(regionHeader(regionKey));
        }
        frag.appendChild(card(entry.item, entry.depth));
      });
      el.list.appendChild(frag);
    }

    renderChips();
    writeUrlState();

    if (state.flashId) {
      var flashId = state.flashId;
      state.flashId = null;
      window.setTimeout(function () {
        var node = el.list.querySelector('.card[data-id="' + flashId + '"]');
        if (node) node.classList.remove("is-flash");
      }, 480);
    }

    window.scrollTo(0, scrollY);
    if (restoreSearch) {
      el.search.focus();
      try {
        el.search.setSelectionRange(restoreSearch.start, restoreSearch.end);
      } catch (_) {}
    } else if (restoreSort && el.sort) {
      el.sort.focus();
    }
  }

  function card(item, depth) {
    var st = getStatus(item.id);
    var questName = I18n.questName(item.id);
    var mainStory = isMainStoryItem(item);
    var article = document.createElement("article");
    article.className =
      "card" +
      (mainStory ? " is-main-story" : "") +
      (st === "done" ? " is-done" : "") +
      (st === "missed" ? " is-missed" : "") +
      (!item.pm && st === "open" && !mainStory ? " is-urgent" : "") +
      (depth ? " is-child" : "") +
      (state.flashId === item.id ? " is-flash" : "");
    article.dataset.id = item.id;

    var check = document.createElement("input");
    check.type = "checkbox";
    check.className = "mark";
    check.checked = st === "done";
    check.title = I18n.t("tipMarkDone");
    check.setAttribute("aria-label", I18n.t("tipMarkDone") + ": " + questName);
    check.addEventListener("change", function () {
      setStatus(item.id, check.checked ? "done" : "open", {
        flash: true,
      });
    });

    var body = document.createElement("div");
    body.className = "body";

    var name = document.createElement("div");
    name.className = "name";
    name.textContent = questName;

    var where = document.createElement("div");
    where.className = "where";
    var bits = [];
    if (item.region) bits.push(I18n.regionName(item.region));
    if (item.location) bits.push(I18n.locationText(item.location));
    where.textContent = bits.join(" · ");

    var tags = document.createElement("div");
    tags.className = "tags";
    if (mainStory) {
      var storyPill = document.createElement("span");
      storyPill.className = "pill story";
      storyPill.textContent = I18n.t("pillMainStory");
      tags.appendChild(storyPill);
    }
    if (mainStory && isCohItem(item)) {
      var cohPill = document.createElement("span");
      cohPill.className = "pill coh";
      cohPill.textContent = I18n.t("pillCostOfHope");
      tags.appendChild(cohPill);
    }
    // Skip type_main on story cards — pillMainStory already says the same thing.
    // Keep type pills for children (Related) and all Side-mode types.
    var pType = playerType(item);
    if (!(mainStory && pType === "main")) {
      var typePill = document.createElement("span");
      typePill.className = "pill soft";
      typePill.textContent = I18n.t("type_" + pType);
      tags.appendChild(typePill);
    }
    if (mainStory && hasTag(item, "exclusive")) {
      var exclPill = document.createElement("span");
      exclPill.className = "pill branch";
      exclPill.textContent = I18n.t("pillExclusive");
      tags.appendChild(exclPill);
    }
    if (mainStory) {
      var routeKey = storyBranchKey(item);
      if (routeKey === "ward") {
        var wardPill = document.createElement("span");
        wardPill.className = "pill branch";
        wardPill.textContent = I18n.t("pillBranchWard");
        tags.appendChild(wardPill);
      } else if (routeKey === "spark") {
        var sparkPill = document.createElement("span");
        sparkPill.className = "pill branch";
        sparkPill.textContent = I18n.t("pillBranchSpark");
        tags.appendChild(sparkPill);
      } else if (routeKey === "independent") {
        var indepPill = document.createElement("span");
        indepPill.className = "pill branch";
        indepPill.textContent = I18n.t("pillBranchIndependent");
        tags.appendChild(indepPill);
      } else if (routeKey === "duty") {
        var dutyPill = document.createElement("span");
        dutyPill.className = "pill branch";
        dutyPill.textContent = I18n.t("pillBranchDuty");
        tags.appendChild(dutyPill);
      } else if (routeKey === "freedom") {
        var freedomPill = document.createElement("span");
        freedomPill.className = "pill branch";
        freedomPill.textContent = I18n.t("pillBranchFreedom");
        tags.appendChild(freedomPill);
      }
      if (hasTagPrefix(item, "ending:")) {
        var endingPill = document.createElement("span");
        endingPill.className = "pill branch";
        endingPill.textContent = I18n.t("pillEnding");
        tags.appendChild(endingPill);
      }
      if (isPonrItem(item)) {
        var ponrPill = document.createElement("span");
        ponrPill.className = "pill warn";
        ponrPill.textContent = I18n.t("pillPonr");
        tags.appendChild(ponrPill);
      }
    }
    if (st === "done") {
      var donePill = document.createElement("span");
      donePill.className = "pill ok";
      donePill.textContent = I18n.t("statusDone");
      tags.appendChild(donePill);
    } else if (st === "missed") {
      var missPill = document.createElement("span");
      missPill.className = "pill bad";
      missPill.textContent = I18n.t("statusMissed");
      tags.appendChild(missPill);
    }
    if (item.pm) {
      var pm = document.createElement("span");
      pm.className = "pill warn";
      pm.textContent = I18n.t("pillAfterStory");
      tags.appendChild(pm);
    } else if (st === "open" && !mainStory) {
      var pre = document.createElement("span");
      pre.className = "pill warn";
      pre.textContent = I18n.t("pillDoEarly");
      tags.appendChild(pre);
    }

    var premiseText = I18n.note(item.id, item.summary_en);
    var hintText = mainStory ? I18n.hint(item.id, item.hint_en) : "";
    var spoilerText = mainStory ? I18n.spoiler(item.id, item.spoiler_en) : "";
    var spoilerExtras = [];
    if (mainStory && hasTag(item, "exclusive")) {
      spoilerExtras.push(I18n.t("spoilerExclusiveHint"));
    }
    if (mainStory && isPonrItem(item)) {
      spoilerExtras.push(I18n.t("spoilerPonrHint"));
    }
    if (spoilerExtras.length) {
      spoilerText = [spoilerText].concat(spoilerExtras).filter(Boolean).join("\n\n");
    }
    var hasDetails = mainStory ? !!(premiseText || hintText) : !!premiseText;

    var noteEl = document.createElement("div");
    noteEl.className = "note";
    noteEl.id = "note-" + item.id;
    var noteOpen = !!state.openNotes[item.id];
    noteEl.hidden = !noteOpen;

    if (mainStory && (premiseText || hintText)) {
      if (premiseText) {
        var premiseEl = document.createElement("div");
        premiseEl.className = "note-premise";
        premiseEl.textContent = premiseText;
        noteEl.appendChild(premiseEl);
      }
      if (hintText) {
        var hintBlock = document.createElement("div");
        hintBlock.className = "note-hint";
        var hintLabel = document.createElement("div");
        hintLabel.className = "note-label";
        hintLabel.textContent = I18n.t("labelHint");
        var hintBody = document.createElement("div");
        hintBody.className = "note-hint-body";
        hintBody.textContent = hintText;
        hintBlock.appendChild(hintLabel);
        hintBlock.appendChild(hintBody);
        noteEl.appendChild(hintBlock);
      }
    } else {
      noteEl.textContent = premiseText;
    }

    var spoilerEl = null;
    var spoilerOpen = false;
    if (spoilerText) {
      spoilerEl = document.createElement("div");
      spoilerEl.className = "note is-spoiler";
      spoilerEl.id = "spoiler-" + item.id;
      spoilerOpen = !!state.openSpoilers[item.id];
      spoilerEl.hidden = !spoilerOpen;
      var spoilerLabel = document.createElement("div");
      spoilerLabel.className = "note-label";
      spoilerLabel.textContent = I18n.t("labelSpoilers");
      var spoilerBody = document.createElement("div");
      spoilerBody.className = "note-spoiler-body";
      spoilerBody.textContent = spoilerText;
      spoilerEl.appendChild(spoilerLabel);
      spoilerEl.appendChild(spoilerBody);
    }

    body.appendChild(name);
    if (bits.length) body.appendChild(where);
    body.appendChild(tags);
    if (hasDetails) body.appendChild(noteEl);
    if (spoilerEl) body.appendChild(spoilerEl);

    var side = document.createElement("div");
    side.className = "side";

    var btnNote = document.createElement("button");
    btnNote.type = "button";
    btnNote.setAttribute("aria-expanded", noteOpen ? "true" : "false");
    if (hasDetails) btnNote.setAttribute("aria-controls", noteEl.id);
    btnNote.textContent = noteOpen ? I18n.t("btnHideDetails") : I18n.t("btnDetails");
    if (noteOpen) btnNote.classList.add("active-mark");
    if (!hasDetails) {
      btnNote.disabled = true;
      btnNote.hidden = true;
    } else {
      btnNote.addEventListener("click", function () {
        var open = !!noteEl.hidden;
        noteEl.hidden = !open;
        btnNote.classList.toggle("active-mark", open);
        btnNote.textContent = open ? I18n.t("btnHideDetails") : I18n.t("btnDetails");
        btnNote.setAttribute("aria-expanded", open ? "true" : "false");
        if (open) {
          state.openNotes[item.id] = true;
        } else {
          delete state.openNotes[item.id];
        }
      });
    }

    var btnSpoiler = null;
    if (spoilerEl) {
      btnSpoiler = document.createElement("button");
      btnSpoiler.type = "button";
      btnSpoiler.className = "btn-spoiler";
      btnSpoiler.setAttribute("aria-expanded", spoilerOpen ? "true" : "false");
      btnSpoiler.setAttribute("aria-controls", spoilerEl.id);
      btnSpoiler.textContent = spoilerOpen
        ? I18n.t("btnHideSpoilers")
        : I18n.t("btnShowSpoilers");
      if (spoilerOpen) btnSpoiler.classList.add("active-mark");
      btnSpoiler.addEventListener("click", function () {
        var open = !!spoilerEl.hidden;
        spoilerEl.hidden = !open;
        btnSpoiler.classList.toggle("active-mark", open);
        btnSpoiler.textContent = open
          ? I18n.t("btnHideSpoilers")
          : I18n.t("btnShowSpoilers");
        btnSpoiler.setAttribute("aria-expanded", open ? "true" : "false");
        if (open) {
          state.openSpoilers[item.id] = true;
        } else {
          delete state.openSpoilers[item.id];
        }
      });
    }

    var btnMiss = document.createElement("button");
    btnMiss.type = "button";
    btnMiss.textContent = st === "missed" ? I18n.t("btnRestore") : I18n.t("btnMissed");
    if (st === "missed") btnMiss.classList.add("active-mark");
    btnMiss.title = I18n.t("tipMissed");
    btnMiss.setAttribute("aria-label", I18n.t("tipMissed") + ": " + questName);
    btnMiss.addEventListener("click", function () {
      setStatus(item.id, st === "missed" ? "open" : "missed", {
        flash: true,
      });
    });

    side.appendChild(btnNote);
    if (btnSpoiler) side.appendChild(btnSpoiler);
    side.appendChild(btnMiss);

    article.appendChild(check);
    article.appendChild(body);
    article.appendChild(side);
    return article;
  }

  function applyImportedProgress(raw) {
    var result = sanitizeProgress(raw);
    if (!result.progress) {
      alert(I18n.t("importInvalid"));
      return;
    }
    if (Object.keys(state.progress).length && !confirm(I18n.t("importConfirm"))) {
      return;
    }
    clearUndo();
    state.progress = result.progress;
    saveProgress();
    render();
  }

  function isEditableTarget(target) {
    if (!target || !target.tagName) return false;
    var tag = target.tagName.toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return true;
    if (target.isContentEditable) return true;
    return false;
  }

  function syncLegendMode() {
    var details = document.querySelector(".rail-legend");
    if (!details) return;
    if (window.matchMedia("(min-width: 901px)").matches) {
      details.open = true;
    }
  }

  function bind() {
    syncLegendMode();
    window.addEventListener("resize", syncLegendMode);

    el.search.addEventListener("input", function () {
      state.query = el.search.value;
      render();
    });
    if (el.sort) {
      el.sort.addEventListener("change", function () {
        state.sort = SORT_MODES[el.sort.value] ? el.sort.value : "region";
        render();
      });
    }
    document.addEventListener("click", function (e) {
      if (!e.target.closest(".ms")) closeAllMultis();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        closeAllMultis();
        return;
      }
      if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey && !isEditableTarget(e.target)) {
        e.preventDefault();
        el.search.focus();
        el.search.select();
      }
    });
    if (el.langSwitch) {
      el.langSwitch.addEventListener("click", function (e) {
        var btn = e.target.closest(".lang-opt");
        if (!btn || !el.langSwitch.contains(btn)) return;
        var next = btn.getAttribute("data-lang");
        if (!next || next === I18n.getLanguage()) return;
        I18n.setLanguage(next);
        render();
      });
    }
    if (el.modeSwitch) {
      el.modeSwitch.addEventListener("click", function (e) {
        var btn = e.target.closest(".mode-opt");
        if (!btn || !el.modeSwitch.contains(btn)) return;
        var next = btn.getAttribute("data-mode");
        if (!next) return;
        setMode(next);
      });
    }
    if (el.campaignSwitch) {
      el.campaignSwitch.addEventListener("click", function (e) {
        var btn = e.target.closest(".campaign-opt");
        if (!btn || !el.campaignSwitch.contains(btn)) return;
        var next = btn.getAttribute("data-campaign");
        if (!next) return;
        setCampaign(next);
      });
    }
    if (el.branchSwitch) {
      el.branchSwitch.addEventListener("click", function (e) {
        var btn = e.target.closest(".branch-opt");
        if (!btn || !el.branchSwitch.contains(btn)) return;
        if (btn.hidden) return;
        var next = btn.getAttribute("data-branch");
        if (!next) return;
        setBranch(next);
      });
    }
    el.btnExport.addEventListener("click", function () {
      var blob = new Blob([JSON.stringify(state.progress, null, 2)], { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "stlk2-progress.json";
      a.click();
      URL.revokeObjectURL(a.href);
    });
    el.btnImport.addEventListener("click", function () {
      el.fileImport.click();
    });
    el.fileImport.addEventListener("change", function () {
      var file = el.fileImport.files && el.fileImport.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          applyImportedProgress(JSON.parse(reader.result));
        } catch (_) {
          alert(I18n.t("importInvalid"));
        }
      };
      reader.readAsText(file);
      el.fileImport.value = "";
    });
    el.btnReset.addEventListener("click", function () {
      var modeConfirm = isStoryMode()
        ? I18n.t("resetConfirmStory")
        : I18n.t("resetConfirmSide");
      if (!confirm(modeConfirm)) return;

      undoSnapshot = JSON.parse(JSON.stringify(state.progress));
      var clearOther = false;
      var otherHasProgress = state.items.some(function (item) {
        if (!state.progress[item.id]) return false;
        return isStoryMode() ? !isMainStoryItem(item) : isMainStoryItem(item);
      });
      if (otherHasProgress && confirm(I18n.t("resetConfirmOther"))) {
        clearOther = true;
      }

      if (clearOther) {
        state.progress = {};
      } else {
        var next = {};
        Object.keys(state.progress).forEach(function (id) {
          var item = itemsById[id];
          if (!item) return;
          var keep = isStoryMode() ? !isMainStoryItem(item) : isMainStoryItem(item);
          if (keep) next[id] = state.progress[id];
        });
        state.progress = next;
      }

      saveProgress();
      if (undoTimer) clearTimeout(undoTimer);
      showUndoToast();
      undoTimer = setTimeout(function () {
        clearUndo();
      }, UNDO_MS);
      render();
    });
  }

  loadProgress();
  I18n.init();
  readUrlState();
  bind();
  urlSyncReady = true;
  render();
  window.setTimeout(function () {
    document.body.classList.add("is-booted");
  }, 900);
})();
