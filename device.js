// Raccoglie info sul dispositivo e sulla rete per la Console accessi (solo admin la vede).

export function deviceInfo() {
  const ua = navigator.userAgent || "";
  const uad = navigator.userAgentData;
  let os = "Sconosciuto", browser = "Sconosciuto", tipo = "Desktop";
  if (/Windows NT 10/.test(ua)) os = "Windows 10/11";
  else if (/Windows/.test(ua)) os = "Windows";
  else if (/iPhone/.test(ua)) os = "iOS (iPhone)";
  else if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) os = "iPadOS";
  else if (/Mac OS X/.test(ua)) os = "macOS";
  else if (/Android ([\d.]+)/.test(ua)) os = "Android " + RegExp.$1;
  else if (/CrOS/.test(ua)) os = "ChromeOS";
  else if (/Linux/.test(ua)) os = "Linux";
  if (uad && uad.platform && os === "Sconosciuto") os = uad.platform;

  if (/Edg\/([\d]+)/.test(ua)) browser = "Edge " + RegExp.$1;
  else if (/OPR\/([\d]+)/.test(ua)) browser = "Opera " + RegExp.$1;
  else if (/SamsungBrowser\/([\d]+)/.test(ua)) browser = "Samsung Internet " + RegExp.$1;
  else if (/Firefox\/([\d]+)/.test(ua)) browser = "Firefox " + RegExp.$1;
  else if (/CriOS\/([\d]+)/.test(ua)) browser = "Chrome iOS " + RegExp.$1;
  else if (/Chrome\/([\d]+)/.test(ua)) browser = "Chrome " + RegExp.$1;
  else if (/Version\/([\d.]+).*Safari/.test(ua)) browser = "Safari " + RegExp.$1;

  if (/iPad|Tablet/.test(ua) || os === "iPadOS" || (/Android/.test(ua) && !/Mobile/.test(ua))) tipo = "Tablet";
  else if (/Mobi|iPhone|Android/.test(ua)) tipo = "Smartphone";

  let modello = "";
  const m = ua.match(/Android [\d.]+; ([^;)]+?)(?: Build|\))/);
  if (m) modello = m[1].trim();
  if (/iPhone/.test(ua)) modello = "iPhone";

  return {
    tipo, os, browser, modello,
    schermo: `${screen.width}×${screen.height}@${window.devicePixelRatio || 1}x`,
    lingua: navigator.language || "",
    fuso: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
    touch: navigator.maxTouchPoints > 0,
    ua: ua.slice(0, 400),
  };
}

let netCache = null;
// IP pubblico + città/provider. Prova più servizi; se tutti falliscono restituisce IP "n.d."
export async function netInfo() {
  if (netCache) return netCache;
  const tries = [
    async () => {
      const r = await fetch("https://ipapi.co/json/", { cache: "no-store" });
      const j = await r.json();
      if (!j.ip) throw 0;
      return { ip: j.ip, citta: j.city || "", regione: j.region || "", paese: j.country_name || "", provider: j.org || "" };
    },
    async () => {
      const r = await fetch("https://ipwho.is/", { cache: "no-store" });
      const j = await r.json();
      if (!j.ip) throw 0;
      return { ip: j.ip, citta: j.city || "", regione: j.region || "", paese: j.country || "", provider: (j.connection && j.connection.isp) || "" };
    },
    async () => {
      const r = await fetch("https://api64.ipify.org?format=json", { cache: "no-store" });
      const j = await r.json();
      return { ip: j.ip, citta: "", regione: "", paese: "", provider: "" };
    },
  ];
  for (const t of tries) {
    try {
      const res = await Promise.race([t(), new Promise((_, rej) => setTimeout(rej, 2500))]);
      netCache = res;
      return res;
    } catch (e) { /* prova il prossimo */ }
  }
  return { ip: "n.d.", citta: "", regione: "", paese: "", provider: "" };
}
