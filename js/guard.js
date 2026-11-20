// Anti-clickjacking (script normale, parte PRIMA di tutto il resto).
// La pagina resta invisibile finché non è sicuro che NON sia dentro il sito di qualcun altro.
(function () {
  if (window.top === window.self) {
    document.documentElement.classList.add("ok-frame");
  } else {
    try { window.top.location.replace(window.self.location.href); } catch (e) { }
    document.write("");
  }
})();
