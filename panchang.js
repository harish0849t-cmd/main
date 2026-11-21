// panchang.js — offline Telugu panchangam (amanta) calculations.
// Uses Meeus-style sun/moon longitudes; no internet or library needed.
// Tithi is the one running at local sunrise (standard panchangam convention).

const R = Math.PI / 180;
const norm = (x) => ((x % 360) + 360) % 360;
const sin = (x) => Math.sin(x * R);
const cos = (x) => Math.cos(x * R);

export const TITHI_EN = ['Padyami', 'Vidiya', 'Tadiya', 'Chavithi', 'Panchami', 'Shashti', 'Saptami', 'Ashtami', 'Navami', 'Dasami', 'Ekadasi', 'Dwadasi', 'Trayodasi', 'Chaturdasi', 'Pournami', 'Amavasya'];
export const TITHI_TE = ['పాడ్యమి', 'విదియ', 'తదియ', 'చవితి', 'పంచమి', 'షష్ఠి', 'సప్తమి', 'అష్టమి', 'నవమి', 'దశమి', 'ఏకాదశి', 'ద్వాదశి', 'త్రయోదశి', 'చతుర్దశి', 'పౌర్ణమి', 'అమావాస్య'];
export const MONTH_EN = ['Chaitra', 'Vaisakha', 'Jyeshtha', 'Ashadha', 'Shravana', 'Bhadrapada', 'Ashvayuja', 'Kartika', 'Margashira', 'Pushya', 'Magha', 'Phalguna'];
export const MONTH_TE = ['చైత్రం', 'వైశాఖం', 'జ్యేష్ఠం', 'ఆషాఢం', 'శ్రావణం', 'భాద్రపదం', 'ఆశ్వయుజం', 'కార్తీకం', 'మార్గశిరం', 'పుష్యం', 'మాఘం', 'ఫాల్గుణం'];
export const NAK_EN = ['Ashwini', 'Bharani', 'Krittika', 'Rohini', 'Mrigashira', 'Ardra', 'Punarvasu', 'Pushya', 'Ashlesha', 'Magha', 'Purva Phalguni', 'Uttara Phalguni', 'Hasta', 'Chitra', 'Swati', 'Vishakha', 'Anuradha', 'Jyeshtha', 'Moola', 'Purvashadha', 'Uttarashadha', 'Shravana', 'Dhanishta', 'Shatabhisha', 'Purva Bhadrapada', 'Uttara Bhadrapada', 'Revati'];
export const NAK_TE = ['అశ్విని', 'భరణి', 'కృత్తిక', 'రోహిణి', 'మృగశిర', 'ఆరుద్ర', 'పునర్వసు', 'పుష్యమి', 'ఆశ్లేష', 'మఘ', 'పుబ్బ', 'ఉత్తర', 'హస్త', 'చిత్త', 'స్వాతి', 'విశాఖ', 'అనూరాధ', 'జ్యేష్ఠ', 'మూల', 'పూర్వాషాఢ', 'ఉత్తరాషాఢ', 'శ్రవణం', 'ధనిష్ఠ', 'శతభిషం', 'పూర్వాభాద్ర', 'ఉత్తరాభాద్ర', 'రేవతి'];

export const LOCATIONS = {
  hyderabad: { name: 'Hyderabad', lat: 17.385, lon: 78.4867 },
  vijayawada: { name: 'Vijayawada', lat: 16.5062, lon: 80.648 },
  bhimavaram: { name: 'Bhimavaram', lat: 16.5449, lon: 81.5212 },
  nellore: { name: 'Nellore', lat: 14.4426, lon: 79.9865 },
  ongole: { name: 'Ongole', lat: 15.5057, lon: 80.0499 },
  kakinada: { name: 'Kakinada', lat: 16.9891, lon: 82.2475 },
  visakhapatnam: { name: 'Visakhapatnam', lat: 17.6868, lon: 83.2185 },
  tirupati: { name: 'Tirupati', lat: 13.6288, lon: 79.4192 },
  chennai: { name: 'Chennai', lat: 13.0827, lon: 80.2707 },
};

const jdFromMs = (ms) => ms / 86400000 + 2440587.5;
const msFromJd = (jd) => (jd - 2440587.5) * 86400000;

export function sunLon(jd) {
  const T = (jd - 2451545) / 36525;
  const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
  const M = 357.52911 + 35999.05029 * T - 0.0001537 * T * T;
  const C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * sin(M) + (0.019993 - 0.000101 * T) * sin(2 * M) + 0.000289 * sin(3 * M);
  const omega = 125.04 - 1934.136 * T;
  return norm(L0 + C - 0.00569 - 0.00478 * sin(omega));
}

// [D, M, M', F, coefficient (1e-6 deg)]
const MOON_TERMS = [
  [0, 0, 1, 0, 6288774], [2, 0, -1, 0, 1274027], [2, 0, 0, 0, 658314], [0, 0, 2, 0, 213618],
  [0, 1, 0, 0, -185116], [0, 0, 0, 2, -114332], [2, 0, -2, 0, 58793], [2, -1, -1, 0, 57066],
  [2, 0, 1, 0, 53322], [2, -1, 0, 0, 45758], [0, 1, -1, 0, -40923], [1, 0, 0, 0, -34720],
  [0, 1, 1, 0, -30383], [2, 0, 0, -2, 15327], [0, 0, 1, 2, -12528], [0, 0, 1, -2, 10980],
  [4, 0, -1, 0, 10675], [0, 0, 3, 0, 10034], [4, 0, -2, 0, 8548], [2, 1, -1, 0, -7888],
  [2, 1, 0, 0, -6766], [1, 0, -1, 0, -5163], [1, 1, 0, 0, 4987], [2, -1, 1, 0, 4036],
  [2, 0, 2, 0, 3994], [4, 0, 0, 0, 3861], [2, 0, -3, 0, 3665], [0, 1, -2, 0, -2689],
  [2, 0, -1, 2, -2602], [2, -1, -2, 0, 2390], [1, 0, 1, 0, -2348], [2, -2, 0, 0, 2236],
  [0, 1, 2, 0, -2120], [0, 2, 0, 0, -2069], [2, -2, -1, 0, 2048],
];

export function moonLon(jd) {
  const T = (jd - 2451545) / 36525;
  const Lp = 218.3164477 + 481267.88123421 * T - 0.0015786 * T * T;
  const D = 297.8501921 + 445267.1114034 * T - 0.0018819 * T * T;
  const M = 357.5291092 + 35999.0502909 * T;
  const Mp = 134.9633964 + 477198.8675055 * T + 0.0087414 * T * T;
  const F = 93.272095 + 483202.0175233 * T - 0.0036539 * T * T;
  const E = 1 - 0.002516 * T - 0.0000074 * T * T;
  let sum = 0;
  for (const [d, m, mp, f, c] of MOON_TERMS) {
    const e = Math.abs(m) === 1 ? E : Math.abs(m) === 2 ? E * E : 1;
    sum += c * e * sin(d * D + m * M + mp * Mp + f * F);
  }
  const A1 = 119.75 + 131.849 * T, A2 = 53.09 + 479264.29 * T;
  sum += 3958 * sin(A1) + 1962 * sin(Lp - F) + 318 * sin(A2);
  return norm(Lp + sum / 1e6);
}

// Lahiri (Chitrapaksha) ayanamsa, accurate to a few arc-seconds for this use
export const ayanamsa = (jd) => 23.85306 + ((jd - 2451545) / 365.25) * 0.013969;

const elong = (jd) => norm(moonLon(jd) - sunLon(jd));
const signed = (x) => ((x + 540) % 360) - 180;

// Sunrise in minutes after 00:00 UTC of the given calendar date (NOAA method)
export function sunriseUtcMin(y, m, d, lat, lon) {
  const jd = jdFromMs(Date.UTC(y, m - 1, d)) + (12 - lon / 15) / 24;
  const T = (jd - 2451545) / 36525;
  const L0 = norm(280.46646 + 36000.76983 * T);
  const M = 357.52911 + 35999.05029 * T;
  const e = 0.016708634 - 0.000042037 * T;
  const C = (1.914602 - 0.004817 * T) * sin(M) + 0.019993 * sin(2 * M) + 0.000289 * sin(3 * M);
  const lam = L0 + C - 0.00569;
  const eps = 23.4393 - 0.013 * T;
  const decl = Math.asin(sin(eps) * sin(lam)) / R;
  const y2 = Math.tan((eps * R) / 2) ** 2;
  const eot = 4 * ((y2 * sin(2 * L0) - 2 * e * sin(M) + 4 * e * y2 * sin(M) * cos(2 * L0) - 0.5 * y2 * y2 * sin(4 * L0) - 1.25 * e * e * sin(2 * M)) / R);
  const cosH = (cos(90.833) - sin(lat) * sin(decl)) / (cos(lat) * cos(decl));
  const H = Math.acos(Math.max(-1, Math.min(1, cosH))) / R;
  return 720 - 4 * (lon + H) - eot;
}

function newMoonNear(jd) {
  let t = jd;
  for (let i = 0; i < 8; i++) t -= signed(elong(t)) / 12.1907;
  return t;
}

function tithiEndMs(jd) {
  const target = (Math.floor(elong(jd) / 12) + 1) * 12;
  let t = jd;
  for (let i = 0; i < 8; i++) t += signed(target - elong(t)) / 12.1907;
  return msFromJd(t);
}

// IST clock helpers (farms are in India; panchangam is shown in IST)
const IST = 19800000;
export function fmtIST(ms, refDayStartMs) {
  const d = new Date(ms + IST);
  let h = d.getUTCHours();
  const mi = String(d.getUTCMinutes()).padStart(2, '0');
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  let s = `${h}:${mi} ${ap}`;
  if (refDayStartMs != null && ms - refDayStartMs >= 86400000) {
    s += `, ${d.getUTCDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]}`;
  }
  return s;
}

const cache = new Map();

/** Panchangam for a calendar date (y, m = 1..12, d) at a location. */
export function panchang(y, m, d, loc = LOCATIONS.hyderabad) {
  const key = `${y}-${m}-${d}-${loc.lat}-${loc.lon}`;
  if (cache.has(key)) return cache.get(key);
  const dayStartUtc = Date.UTC(y, m - 1, d);
  const sunriseMs = dayStartUtc + sunriseUtcMin(y, m, d, loc.lat, loc.lon) * 60000;
  const jd = jdFromMs(sunriseMs);
  const e = elong(jd);
  const t = Math.floor(e / 12) + 1; // 1..30
  const inPaksha = t <= 15 ? t : t - 15;
  const paksha = t <= 15 ? 'Shukla' : 'Krishna';
  const ayan = ayanamsa(jd);
  const nak = Math.floor(norm(moonLon(jd) - ayan) / (360 / 27));

  // Telugu (amanta) month: named by the sidereal sign the Sun is in at the
  // new moon that began this month, +1. Adhika if the next new moon is in the same sign.
  const prevNM = newMoonNear(jd - e / 12.1907);
  const nextNM = newMoonNear(prevNM + 29.53);
  const s0 = Math.floor(norm(sunLon(prevNM) - ayanamsa(prevNM)) / 30);
  const s1 = Math.floor(norm(sunLon(nextNM) - ayanamsa(nextNM)) / 30);
  const monthIdx = (s0 + 1) % 12;

  const endMs = tithiEndMs(jd);
  const tithiName = t === 30 ? 15 : t === 15 ? 14 : inPaksha - 1;
  // Spring tides follow new/full moon by 1-2 days; neap tides at the quarters
  let tide = null;
  if ([14, 15, 16, 17, 29, 30, 1, 2].includes(t)) tide = 'spring';
  else if ([7, 8, 9, 22, 23, 24].includes(t)) tide = 'neap';

  const out = {
    tithiNum: t, inPaksha, paksha,
    pakshaTe: paksha === 'Shukla' ? 'శుక్ల' : 'కృష్ణ',
    tithiEn: TITHI_EN[tithiName], tithiTe: TITHI_TE[tithiName],
    isPournami: t === 15, isAmavasya: t === 30, isEkadasi: inPaksha === 11,
    tithiEndMs: endMs, tithiEndLabel: fmtIST(endMs, dayStartUtc),
    nakEn: NAK_EN[nak], nakTe: NAK_TE[nak],
    monthEn: MONTH_EN[monthIdx], monthTe: MONTH_TE[monthIdx], adhika: s0 === s1,
    tide, sunriseLabel: fmtIST(sunriseMs),
  };
  cache.set(key, out);
  return out;
}
