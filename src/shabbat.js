import { addCalendarDays, parseDay, solarEventOnDate } from './solar.js';

export const CITIES = Object.freeze([
  { id:'jerusalem', name:'ירושלים', latitude:31.7683, longitude:35.2137, timeZone:'Asia/Jerusalem', candle:40 },
  { id:'tel-aviv', name:'תל אביב–יפו', latitude:32.0853, longitude:34.7818, timeZone:'Asia/Jerusalem', candle:20 },
  { id:'haifa', name:'חיפה', latitude:32.7940, longitude:34.9896, timeZone:'Asia/Jerusalem', candle:30 },
  { id:'beer-sheva', name:'באר שבע', latitude:31.2518, longitude:34.7913, timeZone:'Asia/Jerusalem', candle:20 },
  { id:'ashdod', name:'אשדוד', latitude:31.8044, longitude:34.6553, timeZone:'Asia/Jerusalem', candle:20 },
  { id:'bnei-brak', name:'בני ברק', latitude:32.0832, longitude:34.8347, timeZone:'Asia/Jerusalem', candle:20 },
  { id:'new-york', name:'ניו יורק', latitude:40.7128, longitude:-74.0060, timeZone:'America/New_York', candle:18 },
  { id:'los-angeles', name:'לוס אנג׳לס', latitude:34.0522, longitude:-118.2437, timeZone:'America/Los_Angeles', candle:18 },
  { id:'london', name:'לונדון', latitude:51.5074, longitude:-0.1278, timeZone:'Europe/London', candle:18 },
  { id:'paris', name:'פריז', latitude:48.8566, longitude:2.3522, timeZone:'Europe/Paris', candle:18 },
  { id:'sydney', name:'סידני', latitude:-33.8688, longitude:151.2093, timeZone:'Australia/Sydney', candle:18 },
  { id:'melbourne', name:'מלבורן', latitude:-37.8136, longitude:144.9631, timeZone:'Australia/Melbourne', candle:18 },
  { id:'miami', name:'מיאמי', latitude:25.7617, longitude:-80.1918, timeZone:'America/New_York', candle:18 },
  { id:'toronto', name:'טורונטו', latitude:43.6532, longitude:-79.3832, timeZone:'America/Toronto', candle:18 },
]);

function validateOffset(name, value, min, max) {
  if (!Number.isInteger(value) || value < min || value > max)
    throw new RangeError(name+' must be a whole number between '+min+' and '+max+'.');
}
export function upcomingFriday(date) {
  const calendar=parseDay(date);
  const until=(5-calendar.getUTCDay()+7)%7;
  return addCalendarDays(date,until);
}

/**
 * Calculate purely illustrative offsets around geometric sunset.
 * This is not a halachic calendar; check actual local practice and guidance.
 */
export function calculateShabbat({
  friday, latitude, longitude, timeZone, candleMinutes=20, havdalahMinutes=50,
}) {
  const date=parseDay(friday);
  if (date.getUTCDay()!==5) throw new RangeError('Date must be a Friday.');
  validateOffset('Candle-lighting offset',candleMinutes,0,120);
  validateOffset('Havdalah offset',havdalahMinutes,0,180);
  const saturday=addCalendarDays(friday,1);
  const location={ latitude,longitude,timeZone };
  const fridaySunrise=solarEventOnDate({ ...location,date:friday,kind:'sunrise' });
  const fridaySunset=solarEventOnDate({ ...location,date:friday,kind:'sunset' });
  const saturdaySunrise=solarEventOnDate({ ...location,date:saturday,kind:'sunrise' });
  const saturdaySunset=solarEventOnDate({ ...location,date:saturday,kind:'sunset' });
  const fridayDaylightMinutes=Math.round((fridaySunset-fridaySunrise)/60_000);
  const saturdayDaylightMinutes=Math.round((saturdaySunset-saturdaySunrise)/60_000);
  if(fridayDaylightMinutes<=0 || fridayDaylightMinutes>1440 ||
     saturdayDaylightMinutes<=0 || saturdayDaylightMinutes>1440) {
    throw new RangeError('Inconsistent sunrise/sunset order for this location and timezone.');
  }
  return {
    friday,saturday,latitude,longitude,timeZone,candleMinutes,havdalahMinutes,
    fridaySunrise,
    fridaySunset,
    fridayDaylightMinutes,
    candleLighting:new Date(fridaySunset.getTime()-candleMinutes*60_000),
    saturdaySunrise,
    saturdaySunset,
    saturdayDaylightMinutes,
    daylightChangeMinutes:saturdayDaylightMinutes-fridayDaylightMinutes,
    havdalah:new Date(saturdaySunset.getTime()+havdalahMinutes*60_000),
    approximation:true,
  };
}
function icalDate(date) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
    throw new TypeError('Expected a valid UTC calendar event.');
  }
  return date.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
}
function icalText(text) {
  return String(text).replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');
}

// RFC 5545 limits each physical content line to 75 UTF-8 octets.
// Fold by code point, counting the leading continuation space as one octet.
const encoder = new TextEncoder();
export function foldIcsLine(line) {
  if (typeof line !== 'string' || /[\r\n]/u.test(line)) {
    throw new TypeError('ICS content lines must not contain raw line breaks.');
  }
  let physical = '', current = '', bytes = 0;
  for (const point of line) {
    const width = encoder.encode(point).length;
    if (current && bytes + width > 75) {
      physical += current + '\r\n ';
      current = '';
      bytes = 1;
    }
    current += point;
    bytes += width;
  }
  return physical + current;
}
/** Optional calendar export with absolute UTC instants and clear draft labels. */
export function toIcs(result,cityName='') {
  if (!result || typeof result !== 'object') throw new TypeError('Expected a Shabbat estimate.');
  parseDay(result.friday);
  if (typeof cityName !== 'string' || cityName.length > 150) {
    throw new RangeError('City label must be 150 characters or fewer.');
  }
  const events=[
    { start:result.candleLighting, label:'הדלקת נרות — אומדן בלבד' },
    { start:result.havdalah, label:'הבדלה — אומדן בלבד' },
  ];
  const lines=[
    'BEGIN:VCALENDAR','VERSION:2.0','CALSCALE:GREGORIAN',
    'PRODID:-//MeiRR17//Shabbat Times Estimate//HE',
    'X-WR-CALNAME:Shabbat times (approximate)',
  ];
  events.forEach((event,index)=>{
    const end=new Date(event.start.getTime()+15*60_000);
    const uid=result.friday+'-'+index+'-'+Math.round(result.latitude*10000)+'-'+Math.round(result.longitude*10000)+'@shabbat-times.local';
    lines.push('BEGIN:VEVENT','UID:'+uid,'DTSTAMP:'+icalDate(new Date()),
      'DTSTART:'+icalDate(event.start),'DTEND:'+icalDate(end),
      'SUMMARY:'+icalText(event.label+(cityName?' — '+cityName:'')),
      'DESCRIPTION:'+icalText('אומדן אסטרונומי בלבד. זמנים ומנהגים מחייבים בדיקה מול לוח מוסמך ורב מקומי.'),
      'END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  return lines.map(foldIcsLine).join('\r\n')+'\r\n';
}
