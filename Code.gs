/*****************************************************************
 *  SPSMUN 2026 — Delegate System Backend (rebuild)
 *  Powers: Dashboard, Check-in/out Station, Admin Terminal.
 *  Paste into your Google Sheet (Extensions ▸ Apps Script),
 *  then Deploy as a Web App (Execute as: Me · Access: Anyone).
 *
 *  Tabs used:
 *   Delegates   : S. No. | Name | Class | Section | Committee | Portfolio | Phone | Email
 *   Committees  : Committee | Agenda | Room Day1 | Room Day2 | Room Day3
 *   Announcements (auto) : ID | Timestamp | Type | Title | Body | Active
 *   Attendance  (auto)   : Phone | Name | Committee | D1 In | D1 Out | D2 In | D2 Out | D3 In | D3 Out | Last Action | Last By
 *****************************************************************/

/* ===== CONFIG ===== */
var ADMIN_PASSWORD = "CHANGE_THIS_PASSWORD";
var EVENT_DAYS     = ["2026-07-27","2026-07-28","2026-07-29"];
var TIMEZONE       = "Asia/Kolkata";
/* ================== */

var T_DEL="Delegates", T_COM="Committees", T_ANN="Announcements", T_ATT="Attendance";
var ATT_HEADERS=["Phone","Name","Committee","Day 1 In","Day 1 Out","Day 2 In","Day 2 Out","Day 3 In","Day 3 Out","Last Action","Last By"];
var ANN_HEADERS=["ID","Timestamp","Type","Title","Body","Active","Options","Closes"];

function doGet(e){
  var cb=(e&&e.parameter&&e.parameter.callback)?e.parameter.callback:"callback";
  var out;
  try{
    var p=(e&&e.parameter)?e.parameter:{};
    switch(p.action){
      case "lookup":        out=lookup(p.phone,p.committee); break;
      case "committees":    out=committeeList(); break;
      case "search":        out=search(p.q); break;
      case "checkin":       out=mark(p.phone,p.day,"In",p.by); break;
      case "checkout":      out=mark(p.phone,p.day,"Out",p.by); break;
      case "announcements": out=listAnnouncements(p.phone); break;
      case "vote":          out=vote(p.pollId,p.option,p.phone); break;
      case "meta":          out={ok:true,today:currentDay(),days:EVENT_DAYS}; break;
      /* admin (password) */
      case "adminsearch":   out=adminSearch(p.q,p.pass); break;
      case "stats":         out=stats(p.pass); break;
      case "postann":       out=postAnnouncement(p.pass,p.type,p.title,p.body,p.options,p.minutes); break;
      case "delann":        out=deleteAnnouncement(p.pass,p.id); break;
      case "getcommittees": out=getCommittees(p.pass); break;
      case "setroom":       out=setRoom(p.pass,p.committee,p.day,p.room); break;
      case "savegame":      out=saveGameResult(p.phone,p.result); break;
      case "gamestats":     out=getGameStats(p.phone); break;
      case "gameleader":    out=getGameLeaderboard(p.pass); break;
      default:              out={ok:false,error:"Unknown action."};
    }
  }catch(err){ out={ok:false,error:"Server error: "+(err&&err.message?err.message:err)}; }
  return ContentService.createTextOutput(cb+"("+JSON.stringify(out)+")")
                       .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

/* ---------- helpers ---------- */
function ss(){ return SpreadsheetApp.getActiveSpreadsheet(); }
function normPhone(v){ if(v==null)return ""; var d=String(v).replace(/\D/g,""); return d.length>10?d.slice(-10):d; }
function normName(s){ return String(s||"").toLowerCase().replace(/\s+/g," ").trim(); }
function nameTokens(s){ return normName(s).split(" ").filter(function(x){return x;}); }
function nameMatches(recName,typed){
  var rt=nameTokens(recName), tt=nameTokens(typed);
  if(tt.length===0) return false;
  for(var i=0;i<tt.length;i++){ if(rt.indexOf(tt[i])===-1) return false; }
  return true;
}
function maskPhone(p){ p=String(p); return p.length>=4 ? p.slice(0,2)+"\u2022\u2022\u2022"+p.slice(-2) : p; }
function nowStr(){ return Utilities.formatDate(new Date(),TIMEZONE,"HH:mm"); }
function fmtTime(v){ if(v instanceof Date) return Utilities.formatDate(v,TIMEZONE,"HH:mm"); return String(v==null?"":v); }
function todayStr(){ return Utilities.formatDate(new Date(),TIMEZONE,"yyyy-MM-dd"); }
function currentDay(){ var t=todayStr(); for(var i=0;i<EVENT_DAYS.length;i++){ if(EVENT_DAYS[i]===t) return i+1; } return 0; }
function hIdx(H,re){ for(var i=0;i<H.length;i++){ if(re.test(String(H[i]).trim())) return i; } return -1; }
function admin(pass){ return pass===ADMIN_PASSWORD; }

function delData(){ var s=ss().getSheetByName(T_DEL); return s?s.getDataRange().getValues():null; }

function findDelegate(want){
  var data=delData(); if(!data) return {error:"Delegates sheet not found."};
  var H=data[0].map(function(h){return String(h).trim();});
  var pi=hIdx(H,/phone|contact/i); if(pi===-1) return {error:"No phone column."};
  for(var i=1;i<data.length;i++){
    if(!data[i][pi]) continue;
    if(normPhone(data[i][pi])===want){
      var o={}; for(var j=0;j<H.length;j++){ o[H[j]]=(data[i][j]==null?"":data[i][j]); }
      o[H[pi]]=want; return {obj:o};
    }
  }
  return {error:"No delegate found with this phone number."};
}

function committeeInfo(committee){
  var s=ss().getSheetByName(T_COM); if(!s) return {agenda:"",rooms:["","",""]};
  var data=s.getDataRange().getValues();
  var H=data[0].map(function(h){return String(h).trim().toLowerCase();});
  var ci=H.indexOf("committee"), ai=H.indexOf("agenda");
  var r1=H.indexOf("room day1"), r2=H.indexOf("room day2"), r3=H.indexOf("room day3");
  for(var i=1;i<data.length;i++){
    if(String(data[i][ci]).trim().toLowerCase()===String(committee).trim().toLowerCase()){
      return { agenda: ai>-1?data[i][ai]:"", rooms:[ r1>-1?data[i][r1]:"", r2>-1?data[i][r2]:"", r3>-1?data[i][r3]:"" ] };
    }
  }
  return {agenda:"",rooms:["","",""]};
}

function attSheet(){
  var s=ss().getSheetByName(T_ATT);
  if(!s){ s=ss().insertSheet(T_ATT); s.appendRow(ATT_HEADERS); s.getRange(1,1,1,ATT_HEADERS.length).setFontWeight("bold"); s.setFrozenRows(1); }
  return s;
}
function attRow(phone){ var s=attSheet(); var d=s.getDataRange().getValues(); for(var i=1;i<d.length;i++){ if(normPhone(d[i][0])===phone) return {rowNum:i+1,values:d[i]}; } return null; }
function attObj(v){ return {"Day 1 In":v?fmtTime(v[3]):"","Day 1 Out":v?fmtTime(v[4]):"","Day 2 In":v?fmtTime(v[5]):"","Day 2 Out":v?fmtTime(v[6]):"","Day 3 In":v?fmtTime(v[7]):"","Day 3 Out":v?fmtTime(v[8]):"","Last Action":v?String(v[9]||""):"","Last By":v?String(v[10]||""):""}; }

/* ---------- public actions ---------- */
function canonCommittee(c){ var n=normName(c); return (n==="who") ? "who beginners" : n; }
function lookup(phone,committee){
  var want=normPhone(phone);
  if(want.length!==10) return {ok:false,error:"Please enter a valid 10-digit phone number."};
  if(committee==null || String(committee).trim()==="") return {ok:false,error:"Please select your committee."};
  var d=findDelegate(want); if(d.error) return {ok:false,error:d.error};
  if(canonCommittee(d.obj["Committee"])!==canonCommittee(committee))
    return {ok:false,error:"That committee doesn't match this phone number. Please pick your own committee."};
  var ci=committeeInfo(d.obj["Committee"]);
  var a=attRow(want);
  return {ok:true, delegate:d.obj, agenda:ci.agenda, rooms:ci.rooms,
          attendance:attObj(a?a.values:null), today:currentDay()};
}
function committeeList(){
  var data=delData(); if(!data) return {ok:false,error:"Delegates sheet not found."};
  var H=data[0].map(function(h){return String(h).trim();});
  var ci=hIdx(H,/committee/i); if(ci===-1) return {ok:false,error:"No committee column."};
  var seen={}, list=[];
  for(var i=1;i<data.length;i++){ var raw=String(data[i][ci]||"").trim(); if(!raw) continue;
    var disp=(normName(raw)==="who")?"WHO Beginners":raw; var key=canonCommittee(disp);
    if(!seen[key]){ seen[key]=1; list.push(disp); } }
  list.sort();
  return {ok:true, committees:list};
}

function search(q){
  q=String(q||"").trim();
  var qd=q.replace(/\D/g,"");
  var byPhone = qd.length>=4;
  var byName  = (!byPhone) && q.length>=2;
  if(!byPhone && !byName) return {ok:true, results:[]};
  var data=delData(); if(!data) return {ok:false,error:"Delegates sheet not found."};
  var H=data[0].map(function(h){return String(h).trim();});
  var ni=hIdx(H,/name/i), pi=hIdx(H,/phone|contact/i), comi=hIdx(H,/committee/i);
  var res=[]; var ql=q.toLowerCase();
  for(var i=1;i<data.length && res.length<12;i++){
    var nm=String(data[i][ni]||""); if(!nm) continue;
    var ph=normPhone(data[i][pi]);
    var hit = byPhone ? (ph.indexOf(qd)===0) : (nm.toLowerCase().indexOf(ql)>-1);
    if(hit) res.push({name:nm, phone:ph, masked:maskPhone(ph), committee:String(data[i][comi]||"")});
  }
  return {ok:true, results:res};
}

function mark(phone,day,type,by){
  var want=normPhone(phone); if(want.length!==10) return {ok:false,error:"Invalid phone number."};
  day=parseInt(day,10); if(!(day>=1&&day<=3)) return {ok:false,error:"Invalid day."};
  var d=findDelegate(want); if(d.error) return {ok:false,error:d.error};
  var s=attSheet(); var row=attRow(want);
  if(!row){ s.appendRow([want,d.obj["Name"],d.obj["Committee"],"","","","","","","",""]); row=attRow(want); }
  var inCol=4+(day-1)*2, outCol=5+(day-1)*2;
  if(type==="Out"){
    var inVal=row.values[inCol-1];
    if(inVal==="" || inVal==null) return {ok:false,error:d.obj["Name"]+" has not checked in for Day "+day+" yet \u2014 check in first."};
  }
  var col=(type==="Out")?outCol:inCol;
  var stamp=nowStr();
  var cell=s.getRange(row.rowNum,col); cell.setNumberFormat("@"); cell.setValue(stamp);
  s.getRange(row.rowNum,10).setValue("Checked "+type+" \u00b7 Day "+day+" \u00b7 "+stamp);
  s.getRange(row.rowNum,11).setValue(by||"Desk");
  var fresh=attRow(want);
  return {ok:true, name:d.obj["Name"], committee:d.obj["Committee"], type:type, day:day, time:stamp, attendance:attObj(fresh.values)};
}

/* ---------- announcements ---------- */
function annSheet(){
  var s=ss().getSheetByName(T_ANN);
  if(!s){ s=ss().insertSheet(T_ANN); s.appendRow(ANN_HEADERS); s.getRange(1,1,1,ANN_HEADERS.length).setFontWeight("bold"); s.setFrozenRows(1); }
  return s;
}
function listAnnouncements(phone){
  var s=annSheet(); var d=s.getDataRange().getValues(); var out=[]; var ph=normPhone(phone);
  for(var i=1;i<d.length;i++){
    var active=d[i][5]; if(active===false||String(active).toLowerCase()==="no"||String(active).toLowerCase()==="false") continue;
    var type=String(d[i][2]||"Update");
    if(!d[i][3] && !d[i][4] && type!=="Poll") continue;
    var item={ id:String(d[i][0]), ts:d[i][1]?Utilities.formatDate(new Date(d[i][1]),TIMEZONE,"dd MMM, hh:mm a"):"", type:type, title:String(d[i][3]||""), body:String(d[i][4]||"") };
    if(type==="Poll"){
      var opts=String(d[i][6]||"").split("|").map(function(x){return x.trim();}).filter(function(x){return x;});
      var t=tallyPoll(item.id,ph);
      item.options=opts.map(function(o){return {text:o,count:(t.counts[o]||0)};});
      item.total=t.total; item.myChoice=t.mine;
      var c=d[i][7]; var closesMs = c ? (c instanceof Date ? c.getTime() : new Date(c).getTime()) : 0;
      if(isNaN(closesMs)) closesMs=0;
      item.closesAt=closesMs;
      item.open = closesMs ? (new Date().getTime() < closesMs) : true;
    }
    out.push(item);
  }
  out.reverse();
  return {ok:true, announcements:out};
}
/* ---------- polls ---------- */
function pollVotesSheet(){
  var s=ss().getSheetByName("PollVotes");
  if(!s){ s=ss().insertSheet("PollVotes"); s.appendRow(["PollID","Phone","Option","Timestamp"]); s.getRange(1,1,1,4).setFontWeight("bold"); s.setFrozenRows(1); }
  return s;
}
function tallyPoll(pollId,ph){
  var s=pollVotesSheet(); var d=s.getDataRange().getValues(); var counts={},total=0,mine="";
  for(var i=1;i<d.length;i++){ if(String(d[i][0])===String(pollId)){ var o=String(d[i][2]); counts[o]=(counts[o]||0)+1; total++; if(ph&&normPhone(d[i][1])===ph) mine=o; } }
  return {counts:counts,total:total,mine:mine};
}
function getPollClose(pollId){
  var s=annSheet(); var d=s.getDataRange().getValues();
  for(var i=1;i<d.length;i++){ if(String(d[i][0])===String(pollId)){ var c=d[i][7]; if(c instanceof Date) return c.getTime(); if(c) { var t=new Date(c).getTime(); return isNaN(t)?0:t; } return 0; } }
  return 0;
}
function vote(pollId,option,phone){
  pollId=String(pollId||""); option=String(option||""); var ph=normPhone(phone);
  if(!pollId||!option) return {ok:false,error:"Invalid vote."};
  if(ph.length!==10) return {ok:false,error:"Please log in to vote."};
  var close=getPollClose(pollId);
  if(close && new Date().getTime()>=close) return {ok:false,error:"This poll has closed."};
  var s=pollVotesSheet(); var d=s.getDataRange().getValues();
  for(var i=1;i<d.length;i++){ if(String(d[i][0])===pollId && normPhone(d[i][1])===ph) return {ok:false,error:"You have already voted in this poll."}; }
  s.appendRow([pollId,ph,option,new Date()]);
  var t=tallyPoll(pollId,ph);
  return {ok:true, counts:t.counts, total:t.total, myChoice:t.mine};
}
function postAnnouncement(pass,type,title,body,options,minutes){
  if(!admin(pass)) return {ok:false,error:"Wrong admin password."};
  if(!title && !body && type!=="Poll") return {ok:false,error:"Add a title or message."};
  var closesAt="";
  if(type==="Poll"){ var oo=String(options||"").split("|").map(function(x){return x.trim();}).filter(function(x){return x;});
    if(oo.length<2) return {ok:false,error:"A poll needs at least two options."}; options=oo.join("|");
    var mins=parseFloat(minutes); if(!(mins>0)) mins=5;
    closesAt=new Date(Date.now()+mins*60000); }
  var s=annSheet(); var id="A"+Date.now();
  s.appendRow([id,new Date(),type||"Update",title||"",body||"",true,options||"",closesAt]);
  return {ok:true, id:id};
}
function deleteAnnouncement(pass,id){
  if(!admin(pass)) return {ok:false,error:"Wrong admin password."};
  var s=annSheet(); var d=s.getDataRange().getValues();
  for(var i=1;i<d.length;i++){ if(String(d[i][0])===String(id)){ s.deleteRow(i+1); return {ok:true}; } }
  return {ok:false,error:"Announcement not found."};
}

/* ---------- committees / rooms ---------- */
function getCommittees(pass){
  if(!admin(pass)) return {ok:false,error:"Wrong admin password."};
  var s=ss().getSheetByName(T_COM); if(!s) return {ok:false,error:"Committees sheet not found."};
  var d=s.getDataRange().getValues(); var H=d[0].map(function(h){return String(h).trim().toLowerCase();});
  var ci=H.indexOf("committee"),ai=H.indexOf("agenda"),r1=H.indexOf("room day1"),r2=H.indexOf("room day2"),r3=H.indexOf("room day3");
  var out=[];
  for(var i=1;i<d.length;i++){ if(!d[i][ci]) continue;
    out.push({committee:String(d[i][ci]), agenda:ai>-1?String(d[i][ai]):"", rooms:[ r1>-1?d[i][r1]:"", r2>-1?d[i][r2]:"", r3>-1?d[i][r3]:"" ]}); }
  return {ok:true, committees:out, today:currentDay()};
}
function setRoom(pass,committee,day,room){
  if(!admin(pass)) return {ok:false,error:"Wrong admin password."};
  day=parseInt(day,10); if(!(day>=1&&day<=3)) return {ok:false,error:"Invalid day."};
  var s=ss().getSheetByName(T_COM); var d=s.getDataRange().getValues();
  var H=d[0].map(function(h){return String(h).trim().toLowerCase();});
  var ci=H.indexOf("committee"); var rc=H.indexOf("room day"+day);
  if(rc===-1) return {ok:false,error:"Room Day"+day+" column missing."};
  for(var i=1;i<d.length;i++){ if(String(d[i][ci]).trim().toLowerCase()===String(committee).trim().toLowerCase()){
    s.getRange(i+1,rc+1).setValue(room); return {ok:true}; } }
  return {ok:false,error:"Committee not found."};
}

/* ---------- admin search / stats ---------- */
function adminSearch(q,pass){
  if(!admin(pass)) return {ok:false,error:"Wrong admin password."};
  q=String(q||"").trim().toLowerCase(); if(!q) return {ok:false,error:"Type a name or phone number."};
  var qd=q.replace(/\D/g,"");
  var data=delData(); var H=data[0].map(function(h){return String(h).trim();});
  var ni=hIdx(H,/name/i),pi=hIdx(H,/phone|contact/i),comi=hIdx(H,/committee/i),poi=hIdx(H,/portfolio/i),cli=hIdx(H,/class/i),sei=hIdx(H,/section/i);
  var res=[];
  for(var i=1;i<data.length && res.length<30;i++){
    var nm=String(data[i][ni]||""); if(!nm) continue; var ph=normPhone(data[i][pi]);
    if(nm.toLowerCase().indexOf(q)>-1 || (qd && ph.indexOf(qd)>-1)){
      var a=attRow(ph);
      res.push({name:nm,phone:ph,committee:String(data[i][comi]||""),portfolio:String(data[i][poi]||""),cls:String(data[i][cli]||""),section:String(data[i][sei]||""),attendance:attObj(a?a.values:null)});
    }
  }
  return {ok:true,results:res,today:currentDay()};
}
function stats(pass){
  if(!admin(pass)) return {ok:false,error:"Wrong admin password."};
  var dnum=ss().getSheetByName(T_DEL).getDataRange().getValues().length-1;
  var dy=currentDay(); var ci=0,co=0;
  if(dy>=1){ var s=attSheet(); var d=s.getDataRange().getValues(); var inC=3+(dy-1)*2,outC=4+(dy-1)*2;
    for(var i=1;i<d.length;i++){ if(d[i][inC])ci++; if(d[i][outC])co++; } }
  return {ok:true,today:dy,totalDelegates:dnum,checkedInToday:ci,checkedOutToday:co};
}

/* ========== GAME RECORDS ========== */
var T_GAME="GameRecords";
var GAME_HEADERS=["Phone","Name","Committee","Wins","Losses","LastPlayed"];

function gameSheet(){
  var sh=ss().getSheetByName(T_GAME);
  if(!sh){ sh=ss().insertSheet(T_GAME); sh.appendRow(GAME_HEADERS);
    sh.getRange(1,1,1,GAME_HEADERS.length).setFontWeight("bold").setBackground("#1a3a2a").setFontColor("#d4af37"); }
  return sh;
}

function gameRow(phone){
  var sh=gameSheet(); var d=sh.getDataRange().getValues();
  for(var i=1;i<d.length;i++){ if(normPhone(d[i][0])===phone) return {rowNum:i+1,values:d[i]}; }
  return null;
}

function saveGameResult(phone,result){
  phone=normPhone(phone);
  if(phone.length!==10) return {ok:false,error:"Invalid phone."};
  if(result!=="win" && result!=="loss") return {ok:false,error:"Result must be win or loss."};
  var d=findDelegate(phone); if(d.error) return {ok:false,error:d.error};
  var sh=gameSheet(); var row=gameRow(phone);
  var now=Utilities.formatDate(new Date(),TIMEZONE,"dd MMM yyyy HH:mm");
  if(!row){
    sh.appendRow([phone, d.obj["Name"], d.obj["Committee"], result==="win"?1:0, result==="loss"?1:0, now]);
  } else {
    var wins=parseInt(row.values[3]||0,10); var losses=parseInt(row.values[4]||0,10);
    if(result==="win") wins++; else losses++;
    sh.getRange(row.rowNum,4).setValue(wins);
    sh.getRange(row.rowNum,5).setValue(losses);
    sh.getRange(row.rowNum,6).setValue(now);
  }
  var fresh=gameRow(phone);
  return {ok:true, wins:parseInt(fresh.values[3]||0,10), losses:parseInt(fresh.values[4]||0,10)};
}

function getGameStats(phone){
  phone=normPhone(phone); if(phone.length!==10) return {ok:false,error:"Invalid phone."};
  var row=gameRow(phone);
  if(!row) return {ok:true, wins:0, losses:0};
  return {ok:true, wins:parseInt(row.values[3]||0,10), losses:parseInt(row.values[4]||0,10), lastPlayed:String(row.values[5]||"")};
}

function getGameLeaderboard(pass){
  if(!admin(pass)) return {ok:false,error:"Wrong admin password."};
  var sh=gameSheet(); var d=sh.getDataRange().getValues();
  var rows=[];
  for(var i=1;i<d.length;i++){
    var w=parseInt(d[i][3]||0,10); var l=parseInt(d[i][4]||0,10);
    if(w+l===0) continue;
    rows.push({phone:String(d[i][0]),name:String(d[i][1]),committee:String(d[i][2]),wins:w,losses:l,lastPlayed:String(d[i][5]||"")});
  }
  rows.sort(function(a,b){ return b.wins-a.wins || a.losses-b.losses; });
  rows.forEach(function(r,i){ r.rank=i+1; });
  return {ok:true, leaderboard:rows};
}
