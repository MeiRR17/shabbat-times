import { CITIES, upcomingFriday, calculateShabbat, toIcs, estimateJson } from './src/shabbat.js';
import { dayInTimeZone, localClock } from './src/solar.js';

const $=id=>document.getElementById(id);
const city=$('city');
let current=null,displayName='';
let summary='';
let outputRevision=0; // Invalidates pending clipboard responses after edits.
const formatter=new Intl.DateTimeFormat('he-IL',{year:'numeric',month:'long',day:'numeric',timeZone:'UTC'});

function status(text,error=false){
  $('message').textContent=text;
  $('message').className='message'+(error?' error':'');
}
function locationData(){
  const preset=CITIES.find(item=>item.id===city.value);
  if(preset)return {
    name:preset.name,latitude:preset.latitude,longitude:preset.longitude,
    timeZone:preset.timeZone,candle:preset.candle,
  };
  const latitude=Number($('latitude').value);
  const longitude=Number($('longitude').value);
  const timeZone=$('timezone').value.trim();
  if(!$('latitude').value.trim() || !$('longitude').value.trim() ||
     !Number.isFinite(latitude)||!Number.isFinite(longitude)) {
    throw new Error('יש להזין קווי אורך ורוחב תקינים.');
  }
  return {name:'מיקום מותאם אישית',latitude,longitude,timeZone,candle:null};
}
function formatHebDate(ymd){
  const date=new Date(ymd+'T12:00:00Z');
  return formatter.format(date);
}
function nearestFriday(){
  try{
    const {timeZone}=locationData();
    const today=dayInTimeZone(new Date(),timeZone);
    $('reference-date').value=upcomingFriday(today);
  }catch{
    $('reference-date').value=upcomingFriday(new Date().toISOString().slice(0,10));
  }
}
function disableOutput(){
  outputRevision++;
  current=null;summary='';
  for(const id of ['copy','text-export','json-export','calendar','print'])$(id).disabled=true;
  for(const id of ['friday-sunrise','friday-sunset','candle-time',
    'saturday-sunrise','saturday-sunset','havdalah-time'])$(id).textContent='--:--';
  for(const id of ['friday-daylight','saturday-daylight','daylight-change'])$(id).textContent='—';
  $('display-date').textContent='—';
  $('display-place').textContent='בחר מיקום ולחץ על חישוב';
}
function updateCity(){
  const preset=CITIES.find(item=>item.id===city.value);
  $('custom-location').hidden=Boolean(preset);
  if(preset){
    $('latitude').value=String(preset.latitude);
    $('longitude').value=String(preset.longitude);
    $('timezone').value=preset.timeZone;
    $('candle-minutes').value=String(preset.candle);
  }
  nearestFriday();
  disableOutput();
  status('המיקום עודכן. לחץ על חישוב להצגת אומדן זמנים.');
}
function durationLabel(minutes) {
  const hours=Math.floor(minutes/60);
  const remainder=minutes%60;
  return hours+' שעות ו־'+remainder+' דקות';
}
// Explicitly disclose civil-day rollover for estimates near midnight.
function zonedEventLabel(instant, expectedDay, timeZone){
  const actualDay=dayInTimeZone(instant,timeZone);
  const clock=localClock(instant,timeZone);
  return actualDay===expectedDay?clock:clock+' ('+actualDay+')';
}
function changeLabel(minutes){
  if(minutes===0)return 'ללא שינוי';
  return (minutes>0?'+':'−')+Math.abs(minutes)+' דקות';
}
function display(){
  try{
    const place=locationData();
    const reference=$('reference-date').value;
    const friday=upcomingFriday(reference);
    const candleMinutes=Number($('candle-minutes').value);
    const havdalahMinutes=Number($('havdalah-minutes').value);
    const calculated=calculateShabbat({
      friday,latitude:place.latitude,longitude:place.longitude,
      timeZone:place.timeZone,candleMinutes,havdalahMinutes,
    });
    current=calculated;
    displayName=place.name;
    $('reference-date').value=friday;
    $('display-date').textContent='יום שישי, '+formatHebDate(friday)+' – שבת, '+formatHebDate(calculated.saturday);
    $('display-place').textContent=place.name+' · '+place.timeZone;
    $('friday-sunrise').textContent=zonedEventLabel(calculated.fridaySunrise,friday,place.timeZone);
    $('friday-sunset').textContent=zonedEventLabel(calculated.fridaySunset,friday,place.timeZone);
    $('candle-time').textContent=zonedEventLabel(calculated.candleLighting,friday,place.timeZone);
    $('saturday-sunrise').textContent=zonedEventLabel(calculated.saturdaySunrise,calculated.saturday,place.timeZone);
    $('saturday-sunset').textContent=zonedEventLabel(calculated.saturdaySunset,calculated.saturday,place.timeZone);
    $('havdalah-time').textContent=zonedEventLabel(calculated.havdalah,calculated.saturday,place.timeZone);
    $('friday-daylight').textContent=durationLabel(calculated.fridayDaylightMinutes);
    $('saturday-daylight').textContent=durationLabel(calculated.saturdayDaylightMinutes);
    $('daylight-change').textContent=changeLabel(calculated.daylightChangeMinutes);
    $('candle-description').textContent=candleMinutes+' דקות לפני השקיעה (לפי בחירתך)';
    $('havdalah-description').textContent=havdalahMinutes+' דקות לאחר השקיעה (לפי בחירתך)';
    summary=[
      'אומדן זמני שבת — לא לשימוש הלכתי מעשי',
      place.name+' ('+place.timeZone+')',
      'שישי '+friday+': זריחה '+$('friday-sunrise').textContent+
        ', שקיעה '+$('friday-sunset').textContent+
        ', הדלקת נרות '+$('candle-time').textContent+' ('+candleMinutes+' דקות לפני השקיעה)',
      'שבת '+calculated.saturday+': זריחה '+$('saturday-sunrise').textContent+
        ', שקיעה '+$('saturday-sunset').textContent+
        ', הבדלה '+$('havdalah-time').textContent+' ('+havdalahMinutes+' דקות לאחר השקיעה)',
      'משך אור יום משוער: שישי '+$('friday-daylight').textContent+', שבת '+$('saturday-daylight').textContent+
        ', שינוי '+$('daylight-change').textContent+'.',
      'הנתונים מחושבים בקירוב בלבד. חובה לאמת בלוח מקומי מוסמך.',
    ].join('\n');
    for(const id of ['copy','text-export','json-export','calendar','print'])$(id).disabled=false;
    status('חושב אומדן אסטרונומי ליום שישי '+friday+'. יש לאמת זמנים הלכתיים במקור מוסמך.');
  }catch(error){
    disableOutput();
    status('החישוב נכשל: '+error.message,true);
  }
}
function download(text,name,type){
  const blob=new Blob([text],{type});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;a.download=name;document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
for(const place of CITIES){
  const option=document.createElement('option');
  option.value=place.id;
  option.textContent=place.name;
  city.append(option);
}
city.value='jerusalem';
city.addEventListener('change',updateCity);
$('calculate').addEventListener('click',display);
for(const id of ['latitude','longitude','timezone','reference-date','candle-minutes','havdalah-minutes']){
  for(const eventName of ['change','input'])$(id).addEventListener(eventName,()=>{
    disableOutput();
    status('ההגדרות השתנו. יש לחשב מחדש.');
  });
}
$('copy').addEventListener('click',async()=>{
  if(!current)return;
  const revision=outputRevision;
  const text=summary;
  try{
    await navigator.clipboard.writeText(text);
    if(revision!==outputRevision){
      status('ההעתקה הסתיימה עבור אומדן קודם. ייתכן שהוא עדיין בלוח ההעתקה; יש לחשב מחדש ולהעתיק את התוצאה המעודכנת.',true);
      return;
    }
    status('האומדן הועתק, יחד עם אזהרת אי־ההסתמכות.');
  }catch{
    if(revision===outputRevision)
      status('אין גישה ללוח ההעתקה בדפדפן. נסה להעתיק ידנית.',true);
  }
});
$('text-export').addEventListener('click',()=>{
  if(!current || !summary)return;
  // Export the same snapshot and non-authoritative notice used for Copy.
  // Editing location/date/offsets invalidates current and disables this action.
  download(summary+'\n','shabbat-times-estimate-'+current.friday+'.txt','text/plain;charset=utf-8');
  status('סיכום האומדן נשמר כקובץ טקסט עם אזהרת אי־ההסתמכות. אין להשתמש בו במקום לוח הלכתי מוסמך.');
});
$('json-export').addEventListener('click',()=>{
  if(!current)return;
  try{
    download(estimateJson(current,displayName),
      'shabbat-times-estimate-'+current.friday+'.json','application/json;charset=utf-8');
    status('נשמר דוח JSON אסטרונומי המסומן כאומדן בלבד, לא לזמני שבת מעשיים.');
  }catch(error){
    status('ייצוא ה־JSON נכשל: '+error.message,true);
  }
});
$('calendar').addEventListener('click',()=>{
  if(!current)return;
  download(toIcs(current,displayName),'shabbat-times-estimate-'+current.friday+'.ics','text/calendar;charset=utf-8');
  status('נשמר קובץ יומן המסומן כאומדן בלבד. מומלץ לאמת את השעות לפני הוספה ליומן.');
});
$('print').addEventListener('click',()=>{
  if(current)window.print();
});
updateCity();
display();
