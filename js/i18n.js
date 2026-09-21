(function (global) {
  const packs = global.STLK2_LOCALES || {};
  let current = "en";
  const KEY = "stlk2_lang";

  function dig(obj, path) {
    return path.split(".").reduce((o, k) => (o && o[k] != null ? o[k] : null), obj);
  }

  function detectBrowserLanguage() {
    var list = [];
    if (navigator.languages && navigator.languages.length) {
      list = Array.prototype.slice.call(navigator.languages);
    } else if (navigator.language) {
      list = [navigator.language];
    }
    for (var i = 0; i < list.length; i++) {
      var raw = String(list[i] || "").toLowerCase();
      var code = raw.slice(0, 2);
      if (code === "uk" || code === "be") code = "ru";
      if (packs[code]) return code;
    }
    return "en";
  }

  function init() {
    let saved = localStorage.getItem(KEY);
    if (saved === "uk") saved = "ru";
    setLanguage(saved || detectBrowserLanguage());
  }

  function setLanguage(code) {
    if (code === "uk") code = "ru";
    if (!packs[code]) code = "en";
    current = code;
    localStorage.setItem(KEY, code);
    document.documentElement.lang = code;
    var title = dig(packs[current], "ui.appTitle") || dig(packs.en, "ui.appTitle") || "PDA";
    document.title = title + " — S.T.A.L.K.E.R. 2";
  }

  function t(key) {
    return dig(packs[current], "ui." + key) ?? dig(packs.en, "ui." + key) ?? key;
  }

  function questName(id) {
    const cur = packs[current] && packs[current].quests && packs[current].quests[id];
    const en = packs.en && packs.en.quests && packs.en.quests[id];
    return cur || en || id;
  }

  function regionName(region) {
    if (!region) return "";
    const cur = packs[current] && packs[current].regions && packs[current].regions[region];
    const en = packs.en && packs.en.regions && packs.en.regions[region];
    return cur || en || region;
  }

  function note(id, fallback) {
    const cur = packs[current] && packs[current].notes && packs[current].notes[id];
    const en = packs.en && packs.en.notes && packs.en.notes[id];
    return cur || en || fallback || "";
  }

  function locationText(loc) {
    if (!loc) return "";
    const cur = packs[current] && packs[current].locations && packs[current].locations[loc];
    const en = packs.en && packs.en.locations && packs.en.locations[loc];
    return cur || en || loc;
  }

  function getLanguage() {
    return current;
  }

  global.I18n = {
    init,
    setLanguage,
    t,
    questName,
    regionName,
    note,
    locationText,
    getLanguage,
  };
})(window);
