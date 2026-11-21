/**
 * Approximate NOAA-style astronomical sunrise/sunset computation in UTC.
 *
 * Solar elevation at visible sunset: -0.833 degrees (solar radius and average
 * atmospheric refraction). Ignores terrain, elevation and local atmosphere.
 * Valid for contemporary Gregorian dates and ordinary latitudes; not a
 * halachic ruling or a substitute for authoritative local zmanim.
 *
 * References:
 * https://gml.noaa.gov/grad/solcalc/calcdetails.html
 * https://gml.noaa.gov/grad/solcalc/solareqns.PDF
 */
const RAD = Math.PI / 180;
const MS_DAY = 86_400_000;

export function parseDay(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new RangeError('Date must use YYYY-MM-DD.');
  }
  const [year,month,day] = date.split('-').map(Number);
  const time = Date.UTC(year,month-1,day);
  const result = new Date(time);
  if (!Number.isFinite(time) || result.toISOString().slice(0,10) !== date) {
    throw new RangeError('Invalid calendar date.');
  }
  if (year < 1900 || year > 2100) {
    throw new RangeError('Supported dates: 1900–2100.');
  }
  return result;
}
export function addCalendarDays(date, number) {
  if (!Number.isInteger(number) || Math.abs(number) > 366) {
    throw new RangeError('Invalid day offset.');
  }
  const start = parseDay(date);
  return new Date(start.getTime() + number * MS_DAY).toISOString().slice(0,10);
}
function leap(year) { return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0; }
function dayNumber(date) {
  const year = date.getUTCFullYear();
  return Math.floor((Date.UTC(year,date.getUTCMonth(),date.getUTCDate()) - Date.UTC(year,0,1)) / MS_DAY) + 1;
}
function solarAngles(utcTime) {
  const day = new Date(utcTime);
  const year = day.getUTCFullYear();
  const hour = day.getUTCHours() + day.getUTCMinutes()/60 + day.getUTCSeconds()/3600;
  const gamma = 2 * Math.PI / (leap(year) ? 366 : 365) *
    (dayNumber(day) - 1 + (hour-12)/24);
  const equationOfTime = 229.18 * (
    0.000075 + 0.001868*Math.cos(gamma) - 0.032077*Math.sin(gamma) -
    0.014615*Math.cos(2*gamma) - 0.040849*Math.sin(2*gamma)
  );
  const declination =
    0.006918 - 0.399912*Math.cos(gamma) + 0.070257*Math.sin(gamma) -
    0.006758*Math.cos(2*gamma) + 0.000907*Math.sin(2*gamma) -
    0.002697*Math.cos(3*gamma) + 0.00148*Math.sin(3*gamma);
  return { equationOfTime, declination };
}
function utcEventForCandidate(utcDay, latitude, longitude, kind) {
  const base = utcDay.getTime();
  // Iterate: the event time changes the equation-of-time and declination.
  let estimate = base + 12*60*60*1000;
  const phi = latitude * RAD;
  for (let step=0; step<4; step++) {
    const { equationOfTime, declination } = solarAngles(estimate);
    const divisor = Math.cos(phi)*Math.cos(declination);
    const cosine = (Math.cos(90.833*RAD) / divisor) -
      Math.tan(phi)*Math.tan(declination);
    if (!Number.isFinite(cosine) || cosine < -1 || cosine > 1) return null;
    const hourAngle = Math.acos(cosine) / RAD;
    const utcMinutes = 720 - 4*(longitude + (kind === 'sunset' ? -hourAngle : hourAngle)) - equationOfTime;
    estimate = base + utcMinutes*60_000;
  }
  return new Date(Math.round(estimate/1000)*1000);
}
export function dayInTimeZone(instant, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone, year:'numeric', month:'2-digit', day:'2-digit',
  });
  const parts = Object.fromEntries(formatter.formatToParts(instant).map(p=>[p.type,p.value]));
  return parts.year+'-'+parts.month+'-'+parts.day;
}
export function localClock(instant,timeZone,locale='he-IL') {
  return new Intl.DateTimeFormat(locale, {
    timeZone, hour:'2-digit', minute:'2-digit', hourCycle:'h23',
  }).format(instant);
}

/**
 * Compute sunset or sunrise for a civil date in the requested IANA timezone.
 * Search neighboring UTC dates to handle locations east/west of UTC and DST.
 */
export function solarEventOnDate({date,latitude,longitude,timeZone,kind='sunset'}) {
  parseDay(date);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
      Math.abs(latitude)>90 || Math.abs(longitude)>180) {
    throw new RangeError('Latitude or longitude is outside its allowed range.');
  }
  if (!['sunrise','sunset'].includes(kind)) throw new RangeError('Unsupported solar event.');
  if (typeof timeZone !== 'string' || !timeZone.trim()) throw new Error('Choose a time zone.');
  try { new Intl.DateTimeFormat('en-US',{timeZone}); }
  catch { throw new Error('Invalid IANA time zone.'); }
  // A UTC date can differ from the location's local date by up to two days.
  const calendar = parseDay(date);
  const matches = [];
  for (let offset=-2; offset<=2; offset++) {
    const utcDay = new Date(calendar.getTime() + offset*MS_DAY);
    const event = utcEventForCandidate(utcDay,latitude,longitude,kind);
    if (event && dayInTimeZone(event,timeZone)===date) matches.push(event);
  }
  if (!matches.length) {
    throw new RangeError('No '+kind+' found on this local date (polar conditions or mismatched time zone/location).');
  }
  // For rare duplicates caused by timezone transitions, prefer closest to local evening/morning.
  const targetHour = kind === 'sunset' ? 18 : 6;
  function localHour(instant) {
    const parts = new Intl.DateTimeFormat('en-US',{
      timeZone,hour:'2-digit',minute:'2-digit',hourCycle:'h23',
    }).formatToParts(instant);
    const map=Object.fromEntries(parts.map(p=>[p.type,p.value]));
    return Number(map.hour)+Number(map.minute)/60;
  }
  matches.sort((a,b)=>Math.abs(localHour(a)-targetHour)-Math.abs(localHour(b)-targetHour));
  return matches[0];
}
