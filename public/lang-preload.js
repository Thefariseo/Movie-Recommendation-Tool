// Starts downloading the interface dictionary alongside the app, instead of
// after it, for those who read Umbrify in another language than English. It
// mirrors currentLanguage() in src/i18n/index.js. The build writes each
// dictionary's file into this script tag's data attributes.
(function () {
  var script = document.currentScript;
  if (!script) return;
  var read = function (key) { try { return localStorage.getItem(key); } catch (e) { return null; } };
  var lang = read("umbrify_lang_v1") || read("umbrify_lang_country_v1") ||
    ((navigator.language || "en").toLowerCase().indexOf("it") === 0 ? "it" : "en");
  var file = script.getAttribute("data-" + lang);
  if (!file) return;
  var link = document.createElement("link");
  link.rel = "modulepreload";
  link.href = file;
  document.head.appendChild(link);
})();
