// Regels zonder Electron, zodat scripts/test-rules.js ze kan testen:
// welke adressen in de app laden en wanneer een update kritiek is.

const START_URL = 'https://snglng.lovable.app/qrm-connect';
const APP_HOSTNAME = new URL(START_URL).hostname;

function isInternalUrl(url) {
  try {
    const hostname = new URL(url).hostname;
    return hostname === APP_HOSTNAME || hostname.endsWith(`.${APP_HOSTNAME}`);
  } catch {
    return false;
  }
}

// Inloggen (bv. "Inloggen met Microsoft") loopt via een keten van redirects en
// formulier-POSTs langs Supabase en Microsoft. Die domeinen zijn niet "intern",
// dus zonder uitzondering werd elke stap naar de standaardbrowser gestuurd via
// shell.openExternal(url) - en dat opent altijd een GET zonder de POST-body.
// Microsoft antwoordt dan met AADSTS900561 ("endpoint only accepts POST").
// Bovendien zou de sessie dan in de browser landen i.p.v. in de app. Daarom
// mag de volledige inlogflow gewoon binnen het tabblad zelf plaatsvinden.
const AUTH_HOST_SUFFIXES = [
  'login.microsoftonline.com',
  'login.microsoft.com',
  'login.live.com',
  'login.windows.net',
  'account.live.com',
  'supabase.co',
  'oauth.lovable.app'
];

function isAuthUrl(url) {
  try {
    const hostname = new URL(url).hostname;
    return AUTH_HOST_SUFFIXES.some(suffix => hostname === suffix || hostname.endsWith(`.${suffix}`));
  } catch {
    return false;
  }
}

// Een bestand uit de opslag van Supabase (bv. "Document" bij een stuklijst).
// Zelfde domein als inloggen, maar geen inlogvenster: dit hoort in een tab.
function isFileUrl(url) {
  try {
    return isAuthUrl(url) && new URL(url).pathname.startsWith('/storage/');
  } catch {
    return false;
  }
}

function parseVersion(version) {
  const match = String(version || '').match(/^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/);
  return match ? { parts: match.slice(1, 4).map(Number), pre: match[4] || null } : null;
}

// < 0 als a ouder is dan b, 0 gelijk, > 0 nieuwer. Een gewone versie is
// nieuwer dan de bèta's ervan (1.3.0 > 1.3.0-beta.2).
function compareVersions(a, b) {
  const va = parseVersion(a);
  const vb = parseVersion(b);
  if (!va || !vb) return 0;
  for (let i = 0; i < 3; i++) {
    if (va.parts[i] !== vb.parts[i]) return va.parts[i] - vb.parts[i];
  }
  if (va.pre === vb.pre) return 0;
  if (va.pre === null) return 1;
  if (vb.pre === null) return -1;
  return va.pre.localeCompare(vb.pre, undefined, { numeric: true });
}

// Release-tekst als platte tekst (de updater geeft HTML, soms per versie).
function releaseNotesText(updateInfo) {
  const notes = updateInfo.releaseNotes;
  const raw = Array.isArray(notes) ? notes.map(entry => entry && entry.note).join('\n') : String(notes || '');
  return `${updateInfo.releaseName || ''}\n${raw}`
    .replace(/<\/(p|li|h\d|div)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

// "Kritieke update" telt alleen aan het begin van een regel (na eventuele
// opmaak zoals **), zodat "dit is geen kritieke update" niet meetelt.
function criticalUpdateFrom(updateInfo, currentVersion) {
  const text = releaseNotesText(updateInfo);
  if (!/^\W*kritieke update/im.test(text)) return null;
  const minimum = (text.match(/minimale versie:?\s*v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/i) || [])[1] || updateInfo.version;
  if (compareVersions(currentVersion, minimum) >= 0) return null;
  const reason = ((text.match(/reden:?\s*([^\n]+)/i) || [])[1] || '').trim();
  return { reason };
}

// Pagina-soort voor de anonieme gebruiksgegevens (telemetry.js): alleen het pad
// van een app-pagina, zonder query en zonder nummers. /sales-orders/30044?tab=x
// wordt /sales-orders/:id. Een stuk met 4 of meer cijfers achter elkaar, een
// uuid of alleen cijfers is een id; zo komt er geen ordernummer of klant in
// het rapport. Max 3 stukken en 80 tekens. Geen app-pagina: null.
function pageKind(url) {
  if (!isInternalUrl(url)) return null;
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean).slice(0, 3).map(part => (
      /^\d+$/.test(part) || /^[A-Za-z_-]*\d{4,}/.test(part) || /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(part) ? ':id' : part.toLowerCase()
    ));
    return ('/' + parts.join('/')).slice(0, 80);
  } catch {
    return null;
  }
}

module.exports = { START_URL, APP_HOSTNAME, isInternalUrl, isAuthUrl, isFileUrl, compareVersions, criticalUpdateFrom, pageKind };
