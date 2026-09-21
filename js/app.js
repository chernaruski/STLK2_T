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
    EQ: "encounter",
    E_EQ: "encounter",
    ANCQ: "encounter",
    DLC_EQ: "encounter",
    UX_EQ: "encounter",
    UX_ANCQ: "encounter",
    RQ: "trader",
    DLC_ANEQ: "radio",
  };

  const state = {
    items: (window.STLK2_CATALOG && window.STLK2_CATALOG.items) || [],
    progress: {},
    query: "",
    region: [],
    type: [],
    timing: [],
    status: [],
    sort: "region",
    openNotes: {},
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
    lang: document.getElementById("lang"),
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
    btnExport: document.getElementById("btn-export"),
    btnImport: document.getElementById("btn-import"),
    btnReset: document.getElementById("btn-reset"),
    fileImport: document.getElementById("file-import"),
    toast: document.getElementById("toast"),
    railUnit: document.getElementById("rail-unit"),
    pdaSignal: document.getElementById("pda-signal"),
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
    el.search.value = "";
    render();
  }

  function hasActiveFilters() {
    return (
      !!state.query.trim() ||
      state.region.length > 0 ||
      state.type.length > 0 ||
      state.timing.length > 0 ||
      state.status.length > 0
    );
  }

  function playerType(item) {
    if (item.kind === "collectible_group") return "radio";
    if (item.kind === "repeatable_slot") return "trader";
    if (item.kind === "followup" || item.kind === "subobjective" || item.kind === "prerequisite")
      return "extra";
    return TYPE_OF[item.category] || "extra";
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
      item.id,
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
    if (params.has("q")) {
      state.query = params.get("q") || "";
      el.search.value = state.query;
    }
    if (params.has("region")) state.region = parseListParam(params.get("region"));
    if (params.has("type")) state.type = parseListParam(params.get("type"));
    if (params.has("timing")) state.timing = parseListParam(params.get("timing"));
    if (params.has("status")) state.status = parseListParam(params.get("status"));
    if (params.has("sort")) {
      var sort = params.get("sort");
      if (SORT_MODES[sort]) state.sort = sort;
    }
  }

  function writeUrlState() {
    if (!urlSyncReady) return;
    var params = new URLSearchParams();
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
    state.items.forEach(function (i) {
      if (i.region && !seen[i.region]) {
        seen[i.region] = true;
        regionPairs.push([i.region, I18n.regionName(i.region)]);
      }
    });
    pushSelected("region", regionPairs);
    pushSelected("type", [
      ["quest", I18n.t("typeQuest")],
      ["encounter", I18n.t("typeEncounter")],
      ["trader", I18n.t("typeTrader")],
      ["radio", I18n.t("typeRadio")],
      ["extra", I18n.t("typeExtra")],
    ]);
    pushSelected("timing", [
      ["pre", I18n.t("timingPrePm")],
      ["pm", I18n.t("timingPm")],
    ]);
    pushSelected("status", [
      ["open", I18n.t("statusTodo")],
      ["done", I18n.t("statusDone")],
      ["missed", I18n.t("statusMissed")],
    ]);

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
    msg.textContent = I18n.t("undoToast");
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

  function chrome() {
    el.title.textContent = I18n.t("appTitle");
    if (el.railUnit) el.railUnit.textContent = I18n.t("unitId");
    if (el.pdaSignal) el.pdaSignal.textContent = I18n.t("signalOk");
    el.search.placeholder = I18n.t("searchPlaceholder");
    el.search.setAttribute("aria-label", I18n.t("searchPlaceholder"));
    el.langLabel.textContent = I18n.t("language");
    el.btnExport.textContent = I18n.t("exportProgress");
    el.btnImport.textContent = I18n.t("importProgress");
    el.btnReset.textContent = I18n.t("resetProgress");
    el.legend.textContent = I18n.t("legendHint");
    if (el.legendLabel) el.legendLabel.textContent = I18n.t("legendLabel");

    fillSelect(el.lang, [
      ["en", "English"],
      ["ru", "Русский"],
    ], I18n.getLanguage());

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
      [
        ["quest", I18n.t("typeQuest")],
        ["encounter", I18n.t("typeEncounter")],
        ["trader", I18n.t("typeTrader")],
        ["radio", I18n.t("typeRadio")],
        ["extra", I18n.t("typeExtra")],
      ],
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
    state.items.forEach(function (i) {
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

    state.items.forEach(function (item) {
      if (!passesCoreFilters(item, q)) return;
      if (!inFilter(state.type, playerType(item))) return;
      if (!inFilter(state.status, getStatus(item.id))) return;
      matched[item.id] = true;
    });

    // Related steps are type "extra"; still show them under a matching parent.
    Object.keys(matched).forEach(function (id) {
      (childrenOf[id] || []).forEach(function (child) {
        if (!isRelatedStep(child)) return;
        if (!passesCoreFilters(child, q)) return;
        if (!inFilter(state.status, getStatus(child.id))) return;
        matched[child.id] = true;
      });
    });

    // If the parent is filtered out (e.g. marked done while Status = Todo),
    // keep unfinished sequence steps — and the parent for nesting context.
    state.items.forEach(function (item) {
      if (!isRelatedStep(item) || !item.parentId) return;
      if (matched[item.id]) return;
      if (!passesCoreFilters(item, q)) return;
      if (!inFilter(state.status, getStatus(item.id))) return;
      var parent = itemsById[item.parentId];
      if (!parent || !passesCoreFilters(parent, q)) return;
      var typeOk =
        inFilter(state.type, playerType(item)) ||
        inFilter(state.type, playerType(parent));
      if (!typeOk) return;
      matched[item.id] = true;
      matched[parent.id] = true;
    });

    return state.items.filter(function (item) {
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

    var missedCount = state.items.filter(function (i) {
      return getStatus(i.id) === "missed";
    }).length;
    var countable = state.items.filter(function (i) {
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
      .replace("{total}", String(state.items.length));

    el.list.innerHTML = "";
    if (!rows.length) {
      var empty = document.createElement("div");
      empty.className = "empty";
      var msg = document.createElement("p");
      msg.className = "empty-msg";
      msg.textContent = I18n.t("empty");
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
    var article = document.createElement("article");
    article.className =
      "card" +
      (st === "done" ? " is-done" : "") +
      (st === "missed" ? " is-missed" : "") +
      (!item.pm && st === "open" ? " is-urgent" : "") +
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
    var typePill = document.createElement("span");
    typePill.className = "pill soft";
    typePill.textContent = I18n.t("type_" + playerType(item));
    tags.appendChild(typePill);
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
    } else if (st === "open") {
      var pre = document.createElement("span");
      pre.className = "pill warn";
      pre.textContent = I18n.t("pillDoEarly");
      tags.appendChild(pre);
    }

    var noteText = I18n.note(item.id, item.summary_en);
    var noteEl = document.createElement("div");
    noteEl.className = "note";
    noteEl.id = "note-" + item.id;
    var noteOpen = !!state.openNotes[item.id];
    noteEl.hidden = !noteOpen;
    noteEl.textContent = noteText;

    body.appendChild(name);
    if (bits.length) body.appendChild(where);
    body.appendChild(tags);
    if (noteText) body.appendChild(noteEl);

    var side = document.createElement("div");
    side.className = "side";

    var btnNote = document.createElement("button");
    btnNote.type = "button";
    btnNote.setAttribute("aria-expanded", noteOpen ? "true" : "false");
    if (noteText) btnNote.setAttribute("aria-controls", noteEl.id);
    btnNote.textContent = noteOpen ? I18n.t("btnHideDetails") : I18n.t("btnDetails");
    if (noteOpen) btnNote.classList.add("active-mark");
    if (!noteText) {
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
    el.lang.addEventListener("change", function () {
      I18n.setLanguage(el.lang.value);
      render();
    });
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
      if (!confirm(I18n.t("resetConfirm"))) return;
      undoSnapshot = JSON.parse(JSON.stringify(state.progress));
      state.progress = {};
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
