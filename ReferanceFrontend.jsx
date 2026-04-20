import React, { useState, useMemo } from "react";
import * as XLSX from "xlsx";
import {
  Music2, ArrowRight, Plus, Upload, ChevronRight, FileSpreadsheet, Download, Tv, Trash2,
  CheckCircle2, AlertCircle, X, LogOut, Users, Hash, Package, Bell, Shield, User,
  Clock, Eye, MessageSquare, Check, XCircle, Send, History, ArrowLeft
} from "lucide-react";

// ========== PALETTE ==========
const C = {
  mint1:"#ACE1AF", mint2:"#B0EBB4", mint3:"#BFF6C3", mint4:"#E0FBE2",
  dark:"#1B3A2D", mid:"#2D5F4A", light:"#F6FFF8", white:"#FFFFFF",
  sub:"#4A7A63", muted:"#8ABEAA",
  danger:"#C0392B", warn:"#E67E22", ok:"#27AE60", blue:"#2980B9",
};
const uid = () => Math.random().toString(36).slice(2, 10);

// ========== USAGE ==========
const USAGE_MAP = {
  "Background Instrumental":["BI","B","BI"],"Background Vocal":["BV","B","BV"],
  "Featured Vocal":["FV","F","VV"],"Featured Instrumental":["FI","F","VI"],
  "Visual Vocal":["VV","F","VV"],"Visual Instrumental":["VI","F","VI"],
  "Opening / Title":["OI","F","MT"],"End Title":["OI","F","ET"],
};
const CODE_REVERSE = {"BI":"Background Instrumental","BV":"Background Vocal","FV":"Featured Vocal","FI":"Featured Instrumental","OI":"Opening / Title","VI":"Visual Instrumental","VV":"Visual Vocal"};
const iprsCode=t=>USAGE_MAP[t]?.[0]||"";const prsCode=t=>USAGE_MAP[t]?.[1]||"";const ascapCode=t=>USAGE_MAP[t]?.[2]||"";

// ========== DUMMY USERS ==========
const USERS_DB = [
  { id:"u1", name:"Rahul Sharma", role:"user", email:"rahul@samraj.in", avatar:"RS" },
  { id:"u2", name:"Priya Nair", role:"user", email:"priya@samraj.in", avatar:"PN" },
  { id:"u3", name:"Admin Samraj", role:"admin", email:"admin@samraj.in", avatar:"AS" },
];

// ========== DUMMY SEED DATA (Kothha with realistic history) ==========
function buildSeedData() {
  const contribs = () => [
    { id:uid(), name:"Sabuj Mukherjee", role:"Composer", society:"IPRS", share:25, ipi:"1280461760" },
    { id:uid(), name:"Ashish Kumar Das", role:"Composer", society:"IPRS", share:25, ipi:"1173883723" },
    { id:uid(), name:"Star India Private Limited", role:"Publisher", society:"NS", share:50, ipi:"" },
  ];
  const mkCue = (t,u,d,sc) => ({ id:uid(), songTitle:t, usageType:u, duration:d, usages:1, songCode:sc, isrc:"", singer:"", workNumber:"", ascapWorkId:"", validationLink:"", contributors:contribs() });

  return [{
    id:"proj1", type:"Serial", title:"Kothha", serialType:"SOAPS", language:"Bengali",
    genre:"Drama, Romance, Comedy", productionCompany:"Bangla Talkies",
    director:"Suman Das", producer:"Nitesh Sharma, Nandini Sharma",
    actors:"Sushmita Dey, Saheb Bhattacharya", year:"2023",
    channel:"Star Jalsha", countryOfOrigin:"India", productionNumber:"",
    backgroundMusicComposer:"Sabuj-Aashish", submittedBy:"Sabuj-Aashish",
    episodes: [
      { id:"ep51", number:51, title:"", airDate:"03 February 2024",
        totalDuration:"00:22:38", musicalDuration:"00:21:09", bgInstrumental:"00:09:09", bgVocal:"00:05:39",
        status:"approved",
        uploadedBy:"u1", uploadedAt:"2024-04-10 09:15",
        editHistory:[
          { userId:"u1", name:"Rahul Sharma", action:"Uploaded rough sheet", at:"2024-04-10 09:15" },
          { userId:"u1", name:"Rahul Sharma", action:"Filled contributor details for 3 songs", at:"2024-04-10 10:30" },
          { userId:"u2", name:"Priya Nair", action:"Updated ISRC & Song Codes", at:"2024-04-10 14:22" },
          { userId:"u1", name:"Rahul Sharma", action:"Submitted for approval", at:"2024-04-10 15:00" },
          { userId:"u3", name:"Admin Samraj", action:"Approved", at:"2024-04-11 09:00" },
        ],
        cues:[
          mkCue("Kothha Background Instrumental","Background Instrumental","00:09:10","30715504"),
          mkCue("Agnibha Theme","Background Vocal","00:00:20","30715498"),
          mkCue("Kothhakali Theme","Background Vocal","00:02:27","30715500"),
        ],
      },
      { id:"ep52", number:52, title:"", airDate:"04 February 2024",
        totalDuration:"00:22:11", musicalDuration:"00:20:37", bgInstrumental:"00:13:06", bgVocal:"00:04:02",
        status:"submitted",
        uploadedBy:"u2", uploadedAt:"2024-04-11 11:00",
        editHistory:[
          { userId:"u2", name:"Priya Nair", action:"Uploaded rough sheet", at:"2024-04-11 11:00" },
          { userId:"u2", name:"Priya Nair", action:"Filled all song details", at:"2024-04-11 13:45" },
          { userId:"u2", name:"Priya Nair", action:"Submitted for approval", at:"2024-04-11 14:00" },
        ],
        cues:[
          mkCue("Kothha Background Instrumental","Background Instrumental","00:13:10","30715504"),
          mkCue("Kakima Theme","Background Vocal","00:00:18","30715497"),
        ],
      },
      { id:"ep53", number:53, title:"", airDate:"05 February 2024",
        totalDuration:"00:22:48", musicalDuration:"00:21:31", bgInstrumental:"00:14:07", bgVocal:"00:00:06",
        status:"rejected",
        rejectionNote:"Song Code missing for 'Montu Da Theme'. Also verify singer name for Agnibha Theme — currently shows 'Sabuj-Ashish' but IPRS catalogue has 'Sabuj Mukherjee'. Please correct and resubmit.",
        uploadedBy:"u1", uploadedAt:"2024-04-12 08:30",
        editHistory:[
          { userId:"u1", name:"Rahul Sharma", action:"Uploaded rough sheet", at:"2024-04-12 08:30" },
          { userId:"u1", name:"Rahul Sharma", action:"Filled partial song details", at:"2024-04-12 10:00" },
          { userId:"u1", name:"Rahul Sharma", action:"Submitted for approval", at:"2024-04-12 11:00" },
          { userId:"u3", name:"Admin Samraj", action:"Rejected — Song Code missing for Montu Da Theme", at:"2024-04-12 16:30" },
        ],
        cues:[
          mkCue("Kothha Background Instrumental","Background Instrumental","00:15:05","30715504"),
          mkCue("Montu Da Theme","Background Instrumental","00:00:26",""),
          mkCue("Agnibha Theme","Background Instrumental","00:01:27","30715498"),
        ],
      },
      { id:"ep54", number:54, title:"", airDate:"06 February 2024",
        totalDuration:"00:22:30", musicalDuration:"00:20:10", bgInstrumental:"00:12:00", bgVocal:"00:03:10",
        status:"in_progress",
        uploadedBy:"u2", uploadedAt:"2024-04-13 09:00",
        editHistory:[
          { userId:"u2", name:"Priya Nair", action:"Uploaded rough sheet", at:"2024-04-13 09:00" },
          { userId:"u2", name:"Priya Nair", action:"Started filling contributor details", at:"2024-04-13 10:15" },
        ],
        cues:[
          mkCue("Kothha Background Instrumental","Background Instrumental","00:12:00","30715504"),
          mkCue("Kothhakali Theme","Background Vocal","00:01:50","30715500"),
        ],
      },
      { id:"ep55", number:55, title:"", airDate:"07 February 2024",
        totalDuration:"00:22:15", musicalDuration:"00:19:45", bgInstrumental:"00:11:30", bgVocal:"00:03:00",
        status:"pending",
        uploadedBy:"u1", uploadedAt:"2024-04-14 08:00",
        editHistory:[
          { userId:"u1", name:"Rahul Sharma", action:"Uploaded rough sheet", at:"2024-04-14 08:00" },
        ],
        cues:[
          mkCue("Kothha Background Instrumental","Background Instrumental","00:11:30",""),
        ],
      },
    ],
  }];
}

// ========== NOTIFICATIONS ==========
function buildNotifications() {
  return [
    { id:"n1", type:"rejection", serial:"Kothha", epNum:53, message:"Song Code missing for 'Montu Da Theme'. Also verify singer name for Agnibha Theme.", from:"Admin Samraj", at:"2024-04-12 16:30", read:false },
    { id:"n2", type:"approval", serial:"Kothha", epNum:51, message:"Episode 51 has been approved. Cue sheets are ready for export.", from:"Admin Samraj", at:"2024-04-11 09:00", read:true },
  ];
}

// ========== STATUS HELPERS ==========
const STATUS = {
  pending:    { label:"Pending",     color:C.muted, bg:"#E8F5E9", icon:Clock },
  in_progress:{ label:"In Progress", color:C.blue,  bg:"#E3F2FD", icon:Clock },
  edited:     { label:"Edited",      color:C.warn,  bg:"#FFF3E0", icon:Clock },
  submitted:  { label:"Submitted",   color:"#7B1FA2", bg:"#F3E5F5", icon:Send },
  approved:   { label:"Approved",    color:C.ok,    bg:"#E8F5E9", icon:CheckCircle2 },
  rejected:   { label:"Rejected",    color:C.danger, bg:"#FFEBEE", icon:XCircle },
};

function StatusBadge({ status }) {
  const s = STATUS[status] || STATUS.pending;
  const Icon = s.icon;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg font-medium" style={{ color:s.color, background:s.bg }}>
      <Icon className="w-3.5 h-3.5" /> {s.label}
    </span>
  );
}

// ========== ROUGH PARSER (simplified) ==========
function parseRoughSheet(wb) {
  const episodes = [];
  for (const sn of wb.SheetNames) {
    const ws = wb.Sheets[sn];
    const data = XLSX.utils.sheet_to_json(ws, { header:1, defval:"" });
    if (!data || data.length < 5) continue;
    let epNum = parseInt(sn) || 0, airDate="", totalDuration="", musicalDuration="", bgInst="", bgVocal="";
    let director="", genre="", language="", prodCo="", actors="", producer="", bgComposer="";
    for (let r=0; r<Math.min(25,data.length); r++) {
      const row=data[r]; const f=String(row[0]||"").trim().toUpperCase();
      if (f==="TITLE"||f.startsWith("TITLE")) { const t=String(row[1]||""); const m1=t.match(/ep[- ]?(\d+)/i); if(m1) epNum=parseInt(m1[1]); const m2=t.match(/(\d{1,2}\s+\w+\s+\d{4})/i); if(m2) airDate=m2[1]; }
      if (f.includes("TOTAL MOVIE DURATION")||f.includes("TOTAL EPISODE DURATION")) totalDuration=fmtD(row[row.length>7?7:1]);
      if (f.includes("TOTAL MUSICAL DURATION")) musicalDuration=fmtD(row[row.length>7?7:1]);
      if (f.includes("BACKGROUND INSTRUMENTAL")) bgInst=fmtD(row[row.length>7?7:1]);
      if (f.includes("BACKGROUND VOCAL")&&!f.includes("INSTRUMENTAL")) bgVocal=fmtD(row[row.length>7?7:1]);
      if (f==="DIRECTOR") director=String(row[1]||row[7]||"").trim();
      if (f.includes("GENRE")) genre=String(row[1]||"").trim();
      if (f==="LANGUAGE") language=String(row[1]||"").trim();
      if (f.includes("BANNER")||f.includes("PRODUCTION COMPANY")) prodCo=String(row[1]||row[7]||"").trim();
      if (f.includes("PRINCIPAL ACTORS")) actors=String(row[1]||row[7]||"").trim();
      if (f==="PRODUCER") producer=String(row[1]||"").trim();
      if (f.includes("BACKGROUND MUSIC COMPOSER")) bgComposer=String(row[1]||row[7]||"").trim();
    }
    let cueStart=-1;
    for (let r=0;r<data.length;r++) { if(String(data[r][0]||"").toUpperCase().includes("SONG TITLE")) { cueStart=r+1; break; } }
    const cues=[];
    if (cueStart>0) {
      let cur=null;
      for (let r=cueStart;r<data.length;r++) {
        const row=data[r]; const st=String(row[0]||"").trim();
        if (String(row[0]||"").toUpperCase().includes("CODE")) break;
        if (st) { cur={ id:uid(), songTitle:st, usageType:CODE_REVERSE[String(row[1]||"").trim().toUpperCase()]||"Background Instrumental", duration:fmtD(row[4]), usages:parseInt(row[2])||1, songCode:String(row[3]||""), singer:String(row[row.length>10?10:6]||""), isrc:"", workNumber:"", ascapWorkId:"", validationLink:"", contributors:[] }; cues.push(cur); }
        if (cur) { const role=String(row[5]||"").trim().toUpperCase(); const name=String(row[6]||"").trim();
          if (role&&name) cur.contributors.push({ id:uid(), name, role:role==="C"?"Composer":role==="A"?"Author":role==="E"?"Publisher":role, society:String(row[7]||""), share:parseFloat(row[8])||0, ipi:String(row[9]||"") });
        }
      }
    }
    episodes.push({ id:uid(), number:epNum, title:"", airDate, totalDuration, musicalDuration, bgInstrumental:bgInst, bgVocal, status:"pending", editHistory:[], uploadedBy:"", uploadedAt:"", extracted:{ director,genre,language,prodCo,actors,producer,bgComposer }, cues });
  }
  return episodes.sort((a,b)=>a.number-b.number);
}
function fmtD(v) { if(!v) return ""; if(typeof v==="string"&&v.includes(":")) return v; if(typeof v==="number") { const s=Math.round(v*86400); return `${String(Math.floor(s/3600)).padStart(2,"0")}:${String(Math.floor((s%3600)/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`; } return String(v); }

// ========== EXPORT BUILDERS ==========
function buildIPRS(p,e) { const rows=[["TV/WEB SERIES CUE SHEET"],["SERIAL TITLE",p.title,"","","","","CHANNEL NAME","",p.channel],["SERIAL TYPE",p.serialType,"","","","","DIRECTOR","",p.director],["GENRE / CATEGORY",p.genre,"","","","","BANNER / PRODUCTION COMPANY","",p.productionCompany],["LANGUAGE",p.language,"","","","","PRINCIPAL ACTORS / ACTRESS","",p.actors],["PRODUCTION NUMBER",p.productionNumber,"","","","","TOTAL EPISODE DURATION","",e.totalDuration],["DATE OF EPISODE 1ST PERFORMED / AIRED",e.airDate,"","","","","TOTAL MUSICAL DURATION","",e.musicalDuration],["PRODUCTION YEAR",p.year,"","","","","BACKGROUND MUSIC COMPOSER","",p.backgroundMusicComposer],["PRODUCER",p.producer,"","","","","Submitted By (Name of C/A/E)","",p.submittedBy],["EPISODE NO.",e.number,"","","","","EPISODE TITLE","",e.title],["TOTAL NO. OF EPISODE",p.episodes?.length||""],["WORK DETAILS","","","","","","COMPOSER / AUTHOR / PUBLISHER / SINGER DETAILS"],["SONG TITLE / TRACK NAME","CHARACTERISTICS","NO. OF USAGE","Internal No/Song Code","ISRC","DURATION (HH:MM:SS)","ROLE (C / A / E)","NAMES","SOCIETY","SHARE","IPI NO.","SINGER","VALIDATION LINK"]]; e.cues.forEach(c=>{c.contributors.forEach((co,i)=>{rows.push([i===0?c.songTitle:"",i===0?iprsCode(c.usageType):"",i===0?String(c.usages).padStart(2,"0"):"",i===0?c.songCode:"",i===0?(c.isrc||""):"",i===0?c.duration:"",co.role==="Composer"?"C":co.role==="Author"?"A":"E",co.name,co.society,co.share?co.share+"%":"",co.ipi,i===0?(c.singer||""):"",i===0?(c.validationLink||""):""]);});}); return rows; }
function buildPRS(p,e) { const rows=[["LICENSOR APPROVED MUSIC CUE SHEET"],["Film/Series/Item Title","",p.title,"","Production Co.",p.productionCompany,"Country of Origin","",p.countryOfOrigin,"T/P/F","","F"],["Episode Title","",e.title,"","Production No.",p.productionNumber,"Production Year","",p.year],["Episode No.","",e.number,"","Director",p.director,"First Tx Date","",e.airDate,"Film Duration","",e.totalDuration],["","","","","Principal Actors",p.actors,"Channel","",p.channel,"Music Duration","",e.musicalDuration],["Music Details"],["Seq","Title","","Role","Interested Parties","","CAE Number","Share %","Society","Usage","Duration","Work Number"]]; e.cues.forEach((c,ci)=>{c.contributors.forEach((co,i)=>{rows.push([i===0?ci+1:"",i===0?c.songTitle:"","",co.role,co.name,"",co.ipi,co.share?co.share+"%":"",co.society,i===0?prsCode(c.usageType):"",i===0?c.duration:"",i===0?(c.workNumber||""):""]);});}); return rows; }
function buildASCAP(p,e) { const rows=[[`${p.title}(${p.language} ${p.type})Cuesheet`],[`Series/Film Title: ${p.title}`,"","","",`Company Name: ${p.productionCompany||"NA"}`],[`Episode Title/Number: ${e.number}`,"","","",`Contact: ${p.submittedBy||"NA"}`],[`Estimated Airdate: ${e.airDate||""}`,"","","",`Network Station: ${p.channel||"NA"}`],[`Program Length: ${e.totalDuration}`,"","","",`Program Type: ${p.serialType||p.genre}`],["Cue #","Cue Title","Use*","Timing","Composer(s) Affiliation / %","Publisher(s) Affiliation / %","Work ID (ASCAP)"]]; e.cues.forEach((c,i)=>{const cm=c.contributors.filter(x=>x.role!=="Publisher").map(x=>`${x.name} (${x.society||"NS"}) ${x.share||""}%`).join("\n");const pb=c.contributors.filter(x=>x.role==="Publisher").map(x=>`${x.name} (${x.society||"NS"}) ${x.share||""}%`).join("\n");rows.push([i+1,c.songTitle,ascapCode(c.usageType),c.duration,cm,pb,c.ascapWorkId||""]);}); return rows; }
function dlExport(builder,label,p,e) { const wb=XLSX.utils.book_new(); const ws=XLSX.utils.aoa_to_sheet(builder(p,e)); XLSX.utils.book_append_sheet(wb,ws,`Ep${String(e.number).padStart(2,"0")}`); XLSX.writeFile(wb,`${p.title.replace(/[^a-z0-9]+/gi,"_")}_Ep${String(e.number).padStart(2,"0")}_${label}.xlsx`); }

// ========================================================================
// MAIN APP
// ========================================================================
export default function CueSync() {
  const [currentUser, setCurrentUser] = useState(null);
  const [screen, setScreen] = useState("login");
  const [projects, setProjects] = useState(buildSeedData);
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [activeEpisodeId, setActiveEpisodeId] = useState(null);
  const [notifications, setNotifications] = useState(buildNotifications);
  const [showNotifs, setShowNotifs] = useState(false);
  const [showNewProject, setShowNewProject] = useState(false);
  const [adminReviewNote, setAdminReviewNote] = useState("");

  const activeProject = projects.find(p=>p.id===activeProjectId)||null;
  const activeEpisode = activeProject?.episodes.find(e=>e.id===activeEpisodeId)||null;
  const isAdmin = currentUser?.role === "admin";

  const updateProject = (pid, fn) => setProjects(prev=>prev.map(p=>p.id===pid?fn(p):p));
  const updateEpisode = (pid, eid, fn) => updateProject(pid, p=>({...p, episodes:p.episodes.map(e=>e.id===eid?fn(e):e)}));

  const now = () => new Date().toLocaleString("en-IN",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"});

  const fonts = <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />;

  const goHome = () => { setScreen("workspace"); setActiveProjectId(null); setActiveEpisodeId(null); };

  // ====================== LOGIN ======================
  if (screen === "login") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background:`linear-gradient(145deg,${C.dark} 0%,${C.mid} 50%,${C.dark} 100%)`, fontFamily:"'DM Sans', sans-serif" }}>
        {fonts}
        <div className="absolute inset-0 opacity-30" style={{ background:`radial-gradient(circle at 30% 40%,${C.mint1} 0%,transparent 50%),radial-gradient(circle at 70% 60%,${C.mint3} 0%,transparent 50%)` }} />
        <div className="w-full max-w-lg relative z-10">
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-6" style={{ background:C.mint1 }}><Music2 className="w-8 h-8" style={{ color:C.dark }} /></div>
            <h1 className="text-6xl mb-3" style={{ fontFamily:"'DM Serif Display', serif", color:C.mint4, letterSpacing:"-0.03em" }}>CueSync</h1>
            <p className="text-xs tracking-[0.3em] uppercase" style={{ color:C.mint2+"99" }}>CUE SHEET AUTOMATION</p>
          </div>
          <div className="p-8 rounded-2xl border" style={{ background:"rgba(255,255,255,0.05)", borderColor:C.mint1+"22", backdropFilter:"blur(12px)" }}>
            <p className="text-center text-sm mb-6" style={{ color:C.mint4+"AA" }}>Select your role to enter the workspace</p>
            <div className="space-y-3">
              {USERS_DB.map(u => (
                <button key={u.id} onClick={() => { setCurrentUser(u); setScreen("workspace"); }}
                  className="w-full py-4 px-5 rounded-xl text-left flex items-center gap-4 transition-all hover:scale-[1.01] active:scale-[0.99]"
                  style={{ background: u.role==="admin" ? C.mint1 : "rgba(255,255,255,0.08)", border:`1px solid ${u.role==="admin"?C.mint1:C.mint1+"33"}`, cursor:"pointer" }}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold" style={{ background:u.role==="admin"?C.dark:C.mint1+"44", color:u.role==="admin"?C.mint1:C.mint4 }}>
                    {u.avatar}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium" style={{ color:u.role==="admin"?C.dark:C.mint4 }}>{u.name}</div>
                    <div className="text-xs" style={{ color:u.role==="admin"?C.mid:C.mint1+"88" }}>{u.email}</div>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider font-medium px-3 py-1 rounded-lg"
                       style={{ background:u.role==="admin"?C.dark:C.mint1+"22", color:u.role==="admin"?C.mint1:C.mint2 }}>
                    {u.role==="admin"?<Shield className="w-3.5 h-3.5"/>:<User className="w-3.5 h-3.5"/>} {u.role}
                  </div>
                </button>
              ))}
            </div>
            <p className="text-center text-xs pt-5 mt-5 border-t" style={{ color:C.mint1+"44", borderColor:C.mint1+"22" }}>Prototype · No credentials required</p>
          </div>
        </div>
      </div>
    );
  }

  // ====================== HEADER ======================
  const Header = () => {
    const unread = notifications.filter(n=>!n.read).length;
    return (
      <header className="sticky top-0 z-30 border-b" style={{ background:C.white, borderColor:C.mint1+"44" }}>
        {fonts}
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={goHome}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background:C.dark }}><Music2 className="w-4 h-4" style={{ color:C.mint1 }} /></div>
            <div>
              <div className="text-lg leading-none font-semibold" style={{ fontFamily:"'DM Serif Display', serif", color:C.dark }}>CueSync</div>
              <div className="text-[9px] uppercase tracking-widest mt-0.5" style={{ color:C.sub }}>v3 · {isAdmin?"Admin":"User"}</div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative">
              <button onClick={() => setShowNotifs(!showNotifs)} className="relative p-2 rounded-xl hover:bg-gray-100 transition">
                <Bell className="w-5 h-5" style={{ color:C.sub }} />
                {unread > 0 && <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center text-white" style={{ background:C.danger }}>{unread}</span>}
              </button>
              {showNotifs && (
                <div className="absolute right-0 top-12 w-96 rounded-2xl border shadow-2xl z-50 overflow-hidden" style={{ background:C.white, borderColor:C.mint1+"44" }}>
                  <div className="px-4 py-3 border-b font-semibold text-sm flex items-center justify-between" style={{ borderColor:C.mint4, background:C.mint4+"66" }}>
                    <span>Notifications</span>
                    <button onClick={()=>{setNotifications(prev=>prev.map(n=>({...n,read:true}))); setShowNotifs(false);}} className="text-[10px] uppercase tracking-wider hover:underline" style={{color:C.sub}}>Mark all read</button>
                  </div>
                  {notifications.length === 0 ? <div className="p-4 text-sm text-center" style={{ color:C.sub }}>No notifications</div> :
                    notifications.map(n => (
                      <div key={n.id} className="px-4 py-3 border-b last:border-0 text-sm" style={{ borderColor:C.mint4+"88", background:n.read?"":"#FFF8F0" }}>
                        <div className="flex items-center gap-2 mb-1">
                          {n.type==="rejection" ? <XCircle className="w-4 h-4 shrink-0" style={{ color:C.danger }} /> : <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color:C.ok }} />}
                          <span className="font-medium" style={{ color:n.type==="rejection"?C.danger:C.ok }}>{n.type==="rejection"?"Rejected":"Approved"}</span>
                          <span style={{ color:C.sub }}>·</span>
                          <span className="font-medium" style={{ color:C.dark }}>{n.serial} Ep {n.epNum}</span>
                        </div>
                        <p className="text-xs leading-relaxed" style={{ color:C.sub }}>{n.message}</p>
                        <div className="text-[10px] mt-1" style={{ color:C.muted }}>by {n.from} · {n.at}</div>
                      </div>
                    ))
                  }
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl" style={{ background:C.mint4+"66" }}>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold" style={{ background:isAdmin?C.dark:C.mint1, color:isAdmin?C.mint1:C.dark }}>{currentUser.avatar}</div>
              <div>
                <div className="text-xs font-medium" style={{ color:C.dark }}>{currentUser.name}</div>
                <div className="text-[9px] uppercase tracking-wider" style={{ color:C.sub }}>{currentUser.role}</div>
              </div>
            </div>
            <button onClick={() => { setCurrentUser(null); setScreen("login"); goHome(); }} className="text-xs flex items-center gap-1 hover:opacity-70" style={{ color:C.sub }}><LogOut className="w-3.5 h-3.5" /> Exit</button>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-6 pb-2 flex items-center gap-2 text-xs" style={{ color:C.sub }}>
          <button onClick={goHome} className="hover:underline">Projects</button>
          {activeProject && <><ChevronRight className="w-3 h-3"/><button onClick={()=>{setActiveEpisodeId(null);setScreen("serial");}} className="hover:underline">{activeProject.title}</button></>}
          {activeEpisode && <><ChevronRight className="w-3 h-3"/><span style={{ color:C.dark }}>Episode {activeEpisode.number}</span></>}
        </div>
      </header>
    );
  };

  // ====================== WORKSPACE ======================
  if (screen === "workspace") {
    return (
      <div className="min-h-screen" style={{ background:C.light, fontFamily:"'DM Sans', sans-serif", color:C.dark }}>
        <Header />
        <main className="max-w-7xl mx-auto px-6 py-10">
          <div className="flex items-end justify-between mb-10">
            <div>
              <h2 className="text-5xl mb-2" style={{ fontFamily:"'DM Serif Display', serif" }}>Projects</h2>
              <p className="text-sm" style={{ color:C.sub }}>{isAdmin ? "Admin view — review and approve episode submissions" : "Data entry — fill cue details and submit for approval"}</p>
            </div>
            {isAdmin && <button onClick={()=>setShowNewProject(true)} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium hover:opacity-90" style={{ background:C.dark, color:C.mint4 }}><Plus className="w-4 h-4"/>New Project</button>}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {projects.map(p => {
              const approved = p.episodes.filter(e=>e.status==="approved").length;
              const submitted = p.episodes.filter(e=>e.status==="submitted").length;
              const rejected = p.episodes.filter(e=>e.status==="rejected").length;
              return (
                <div key={p.id} className="group border rounded-2xl transition-all hover:shadow-lg cursor-pointer" style={{ background:C.white, borderColor:C.mint1+"44" }}
                     onClick={() => { setActiveProjectId(p.id); setScreen("serial"); }}>
                  <div className="p-6">
                    <div className="flex items-center gap-2 text-xs uppercase tracking-wider mb-4" style={{ color:C.sub }}><Tv className="w-3.5 h-3.5"/>{p.type}</div>
                    <h3 className="text-2xl mb-3" style={{ fontFamily:"'DM Serif Display', serif" }}>{p.title}</h3>
                    <div className="text-xs space-y-1 mb-4" style={{ color:C.sub }}>
                      <div>{p.language} · {p.genre} · {p.year}</div>
                      <div>{p.productionCompany} · {p.channel}</div>
                    </div>
                    <div className="flex flex-wrap gap-2 mb-4">
                      <span className="text-[10px] px-2 py-0.5 rounded" style={{ background:"#E8F5E9", color:C.ok }}>{approved} approved</span>
                      {submitted>0 && <span className="text-[10px] px-2 py-0.5 rounded" style={{ background:"#F3E5F5", color:"#7B1FA2" }}>{submitted} pending review</span>}
                      {rejected>0 && <span className="text-[10px] px-2 py-0.5 rounded" style={{ background:"#FFEBEE", color:C.danger }}>{rejected} rejected</span>}
                    </div>
                    <div className="flex items-center justify-between pt-4 border-t" style={{ borderColor:C.mint4 }}>
                      <span className="text-xs" style={{ color:C.sub }}>{p.episodes.length} episodes</span>
                      <span className="text-xs uppercase tracking-wider flex items-center gap-1 font-medium group-hover:gap-2 transition-all" style={{ color:C.dark }}>Open <ChevronRight className="w-3.5 h-3.5"/></span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </main>
      </div>
    );
  }

  // ====================== SERIAL VIEW ======================
  if (screen === "serial" && activeProject) {
    const handleImport = async (e) => {
      const file = e.target.files[0]; if(!file) return;
      const buf = await file.arrayBuffer(); const wb = XLSX.read(buf);
      const eps = parseRoughSheet(wb);
      eps.forEach(ep => { ep.uploadedBy = currentUser.id; ep.uploadedAt = now(); ep.status = "pending";
        ep.editHistory = [{ userId:currentUser.id, name:currentUser.name, action:"Uploaded rough sheet", at:now() }];
      });
      if (eps.length>0 && eps[0].extracted) {
        const ex = eps[0].extracted;
        updateProject(activeProject.id, p => ({...p,
          director:ex.director||p.director, genre:ex.genre||p.genre, language:ex.language||p.language,
          productionCompany:ex.prodCo||p.productionCompany, actors:ex.actors||p.actors,
          producer:ex.producer||p.producer, backgroundMusicComposer:ex.bgComposer||p.backgroundMusicComposer,
          episodes:[...p.episodes,...eps],
        }));
      }
      e.target.value = "";
    };

    const proj = projects.find(p=>p.id===activeProjectId);
    return (
      <div className="min-h-screen" style={{ background:C.light, fontFamily:"'DM Sans', sans-serif", color:C.dark }}>
        <Header />
        <main className="max-w-7xl mx-auto px-6 py-10">
          <div className="flex items-end justify-between mb-8">
            <div>
              <div className="text-xs uppercase tracking-widest mb-2" style={{ color:C.sub }}>{proj.type} · {proj.language}</div>
              <h2 className="text-5xl" style={{ fontFamily:"'DM Serif Display', serif" }}>{proj.title}</h2>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
            <MetaCard label="Director" value={proj.director} /><MetaCard label="Producer" value={proj.producer} />
            <MetaCard label="Channel" value={proj.channel} /><MetaCard label="Episodes" value={proj.episodes.length} mono />
          </div>
          {!isAdmin && (
            <div className="rounded-2xl border overflow-hidden mb-8" style={{ borderColor:C.mint1+"66", background:C.mint4+"88" }}>
              <div className="px-6 py-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background:C.mint1 }}><Upload className="w-5 h-5" style={{ color:C.dark }} /></div>
                  <div><div className="font-semibold text-lg" style={{ fontFamily:"'DM Serif Display', serif" }}>Import Rough Sheet</div><div className="text-xs" style={{ color:C.sub }}>Upload the composer's Excel → auto-extract episode data</div></div>
                </div>
                <label className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium cursor-pointer hover:opacity-90" style={{ background:C.dark, color:C.mint4 }}>
                  <FileSpreadsheet className="w-4 h-4"/>Choose .xlsx<input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} />
                </label>
              </div>
            </div>
          )}
          <div className="rounded-2xl border overflow-hidden" style={{ background:C.white, borderColor:C.mint1+"44" }}>
            <div className="px-6 py-4 border-b" style={{ borderColor:C.mint4, background:C.mint4+"66" }}>
              <h3 className="font-semibold text-lg" style={{ fontFamily:"'DM Serif Display', serif" }}>Episodes ({proj.episodes.length})</h3>
            </div>
            <table className="w-full text-sm">
              <thead><tr className="border-b text-[10px] uppercase tracking-wider" style={{ borderColor:C.mint4, color:C.sub, background:C.mint4+"33" }}>
                <th className="text-left px-5 py-3 w-16">Ep.</th>
                <th className="text-left px-5 py-3">Air Date</th>
                <th className="text-left px-5 py-3 w-28">Duration</th>
                <th className="text-left px-5 py-3 w-16">Songs</th>
                <th className="text-left px-5 py-3 w-32">Status</th>
                <th className="text-left px-5 py-3">Last Activity</th>
                <th className="text-right px-5 py-3 w-24">Action</th>
              </tr></thead>
              <tbody>
                {proj.episodes.map(ep => {
                  const lastEdit = ep.editHistory?.[ep.editHistory.length-1];
                  return (
                    <tr key={ep.id} className="border-b last:border-0 hover:bg-green-50/30 transition" style={{ borderColor:C.mint4+"88" }}>
                      <td className="px-5 py-3 font-mono text-sm">{String(ep.number).padStart(2,"0")}</td>
                      <td className="px-5 py-3 text-xs" style={{ fontFamily:"'DM Mono', monospace", color:C.sub }}>{ep.airDate||"—"}</td>
                      <td className="px-5 py-3 text-xs" style={{ fontFamily:"'DM Mono', monospace", color:C.sub }}>{ep.totalDuration}</td>
                      <td className="px-5 py-3" style={{ color:C.sub }}>{ep.cues.length}</td>
                      <td className="px-5 py-3"><StatusBadge status={ep.status} /></td>
                      <td className="px-5 py-3 text-xs" style={{ color:C.sub }}>{lastEdit ? `${lastEdit.name} · ${lastEdit.at}` : "—"}</td>
                      <td className="px-5 py-3 text-right">
                        <button onClick={() => { setActiveEpisodeId(ep.id); setScreen("episode"); }}
                          className="text-xs uppercase tracking-wider flex items-center gap-1 ml-auto font-medium hover:gap-2 transition-all" style={{ color:C.dark }}>
                          {isAdmin ? "Review" : "Open"} <ChevronRight className="w-3.5 h-3.5"/>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </main>
      </div>
    );
  }

  // ====================== EPISODE VIEW ======================
  if (screen === "episode" && activeProject && activeEpisode) {
    const proj = projects.find(p=>p.id===activeProjectId);
    const ep = proj.episodes.find(e=>e.id===activeEpisodeId);
    if (!ep) return null;

    const uploader = USERS_DB.find(u=>u.id===ep.uploadedBy);
    const shareCheck = c => { const s=c.contributors.reduce((a,x)=>a+Number(x.share||0),0); return { ok:s===100, sum:s }; };
    const allValid = ep.cues.every(c=>shareCheck(c).ok);

    const addEditEntry = (action) => {
      updateEpisode(proj.id, ep.id, e => ({...e, editHistory:[...e.editHistory, { userId:currentUser.id, name:currentUser.name, action, at:now() }]}));
    };

    const updateCue = (cid,k,v) => {
      updateEpisode(proj.id, ep.id, e => ({...e, status:e.status==="pending"||e.status==="rejected"?"in_progress":e.status, cues:e.cues.map(c=>c.id===cid?{...c,[k]:v}:c)}));
    };
    const updateContrib = (cid,coid,k,v) => {
      updateEpisode(proj.id, ep.id, e => ({...e, status:e.status==="pending"||e.status==="rejected"?"in_progress":e.status, cues:e.cues.map(c=>c.id===cid?{...c,contributors:c.contributors.map(co=>co.id===coid?{...co,[k]:v}:co)}:c)}));
    };
    const addContrib = (cid) => {
      updateEpisode(proj.id, ep.id, e => ({...e, cues:e.cues.map(c=>c.id===cid?{...c,contributors:[...c.contributors,{id:uid(),name:"",role:"Composer",society:"",share:0,ipi:""}]}:c)}));
    };
    const removeContrib = (cid,coid) => {
      updateEpisode(proj.id, ep.id, e => ({...e, cues:e.cues.map(c=>c.id===cid?{...c,contributors:c.contributors.filter(co=>co.id!==coid)}:c)}));
    };
    const removeSong = (cid) => {
      updateEpisode(proj.id, ep.id, e => ({...e, cues:e.cues.filter(c=>c.id!==cid)}));
      addEditEntry("Removed a song");
    };

    const handleSubmit = () => {
      updateEpisode(proj.id, ep.id, e => ({...e, status:"submitted"}));
      addEditEntry("Submitted for approval");
    };
    const handleApprove = () => {
      updateEpisode(proj.id, ep.id, e => ({...e, status:"approved", rejectionNote:""}));
      addEditEntry("Approved");
      setNotifications(prev => [...prev, { id:uid(), type:"approval", serial:proj.title, epNum:ep.number, message:`Episode ${ep.number} has been approved. Cue sheets are ready for export.`, from:currentUser.name, at:now(), read:false }]);
    };
    const handleReject = () => {
      if (!adminReviewNote.trim()) return;
      updateEpisode(proj.id, ep.id, e => ({...e, status:"rejected", rejectionNote:adminReviewNote}));
      addEditEntry(`Rejected — ${adminReviewNote}`);
      setNotifications(prev => [...prev, { id:uid(), type:"rejection", serial:proj.title, epNum:ep.number, message:adminReviewNote, from:currentUser.name, at:now(), read:false }]);
      setAdminReviewNote("");
    };

    return (
      <div className="min-h-screen" style={{ background:C.light, fontFamily:"'DM Sans', sans-serif", color:C.dark }}>
        <Header />
        <main className="max-w-7xl mx-auto px-6 py-10">
          <div className="flex items-start justify-between mb-6">
            <div>
              <div className="text-xs uppercase tracking-widest mb-2" style={{ color:C.sub }}>{proj.title} · Episode {String(ep.number).padStart(2,"0")}</div>
              <h2 className="text-4xl mb-2" style={{ fontFamily:"'DM Serif Display', serif" }}>Episode {ep.number}</h2>
              {ep.airDate && <div className="text-sm" style={{ color:C.sub }}>Air date: {ep.airDate}</div>}
            </div>
            <StatusBadge status={ep.status} />
          </div>

          {ep.status === "rejected" && ep.rejectionNote && (
            <div className="rounded-2xl border px-5 py-4 mb-6 flex items-start gap-3" style={{ background:"#FFEBEE", borderColor:"#EF9A9A" }}>
              <XCircle className="w-5 h-5 shrink-0 mt-0.5" style={{ color:C.danger }} />
              <div>
                <div className="font-semibold text-sm mb-1" style={{ color:C.danger }}>Rejected — changes required</div>
                <p className="text-sm leading-relaxed" style={{ color:"#B71C1C" }}>{ep.rejectionNote}</p>
              </div>
            </div>
          )}

          {/* activity log */}
          <div className="rounded-2xl border mb-6 overflow-hidden" style={{ background:C.white, borderColor:C.mint1+"44" }}>
            <div className="px-5 py-3 border-b flex items-center gap-2" style={{ borderColor:C.mint4, background:C.mint4+"66" }}>
              <History className="w-4 h-4" style={{ color:C.sub }} />
              <span className="text-sm font-semibold" style={{ fontFamily:"'DM Serif Display', serif" }}>Activity Log</span>
              {uploader && <span className="ml-auto text-xs" style={{ color:C.sub }}>Uploaded by <strong>{uploader.name}</strong> on {ep.uploadedAt}</span>}
            </div>
            <div className="divide-y" style={{ borderColor:C.mint4+"88" }}>
              {[...(ep.editHistory||[])].reverse().map((h,i) => (
                <div key={i} className="px-5 py-2.5 flex items-center gap-3 text-xs" style={{ background:i===0?C.mint4+"44":"" }}>
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center text-[8px] font-bold shrink-0" style={{ background:h.userId===currentUser?.id?C.dark:C.mint1, color:h.userId===currentUser?.id?C.mint1:C.dark }}>
                    {USERS_DB.find(u=>u.id===h.userId)?.avatar||"??"}
                  </div>
                  <span className="font-medium" style={{ color:C.dark }}>{h.name}</span>
                  <span style={{ color:C.sub }}>{h.action}</span>
                  <span className="ml-auto" style={{ color:C.muted, fontFamily:"'DM Mono', monospace", fontSize:10 }}>{h.at}</span>
                  {i===0 && <span className="text-[9px] px-1.5 py-0.5 rounded font-medium" style={{ background:C.mint1, color:C.dark }}>LATEST</span>}
                </div>
              ))}
            </div>
          </div>

          {/* cue details */}
          <SectionTitle title="Cue Details" />
          <div className="rounded-2xl border p-6 mb-6" style={{ background:C.white, borderColor:C.mint1+"44" }}>
            <div className="grid grid-cols-4 gap-4">
              <Fld label="Serial Title" tag="once"><Inp value={proj.title} readOnly={isAdmin} /></Fld>
              <Fld label="Channel" tag="once"><Inp value={proj.channel} readOnly={isAdmin} /></Fld>
              <Fld label="Serial Type" tag="once"><Inp value={proj.serialType} readOnly={isAdmin} /></Fld>
              <Fld label="Language" tag="auto"><Inp value={proj.language} readOnly={isAdmin} /></Fld>
              <Fld label="Director" tag="auto"><Inp value={proj.director} readOnly={isAdmin} /></Fld>
              <Fld label="Genre" tag="auto"><Inp value={proj.genre} readOnly={isAdmin} /></Fld>
              <Fld label="Production Company" tag="auto"><Inp value={proj.productionCompany} readOnly={isAdmin} /></Fld>
              <Fld label="Country" tag="once"><Inp value={proj.countryOfOrigin} readOnly={isAdmin} /></Fld>
              <Fld label="Principal Actors" tag="auto" span={2}><Inp value={proj.actors} readOnly={isAdmin} /></Fld>
              <Fld label="Producer" tag="auto"><Inp value={proj.producer} readOnly={isAdmin} /></Fld>
              <Fld label="Production Year" tag="once"><Inp value={proj.year} readOnly={isAdmin} /></Fld>
            </div>
          </div>

          <SectionTitle title="Episode Details" />
          <div className="rounded-2xl border p-6 mb-6" style={{ background:C.white, borderColor:C.mint1+"44" }}>
            <div className="grid grid-cols-4 gap-4">
              <Fld label="Episode #" tag="auto"><Inp value={ep.number} readOnly /></Fld>
              <Fld label="Air Date" tag="auto"><Inp value={ep.airDate} readOnly={isAdmin} /></Fld>
              <Fld label="Total Duration" tag="auto"><Inp value={ep.totalDuration} readOnly={isAdmin} mono /></Fld>
              <Fld label="Musical Duration" tag="auto"><Inp value={ep.musicalDuration} readOnly={isAdmin} mono /></Fld>
            </div>
          </div>

          {/* song details */}
          <SectionTitle title={`Song Details (${ep.cues.length})`} />
          <div className="space-y-6 mb-8">
            {ep.cues.map((cue,idx) => {
              const v = shareCheck(cue);
              return (
                <div key={cue.id} className="rounded-2xl border overflow-hidden" style={{ background:C.white, borderColor:C.mint1+"44" }}>
                  <div className="flex items-center justify-between px-5 py-3" style={{ background:C.mint4+"88" }}>
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="font-mono text-xs px-2.5 py-1 rounded-lg font-medium" style={{ background:C.dark, color:C.mint1 }}>SONG {String(idx+1).padStart(2,"0")}</span>
                      <span className="text-sm font-medium truncate max-w-xs" style={{ fontFamily:"'DM Serif Display', serif" }}>{cue.songTitle||"Untitled"}</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px]" style={{ background:C.mint3, fontFamily:"'DM Mono', monospace" }}>IPRS:{iprsCode(cue.usageType)} · PRS:{prsCode(cue.usageType)} · ASCAP:{ascapCode(cue.usageType)}</span>
                      {v.ok ? <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-lg" style={{ color:C.ok, background:"#D8F3DC" }}><CheckCircle2 className="w-3 h-3"/>100%</span>
                             : <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-lg" style={{ color:C.danger, background:"#FFDDD2" }}><AlertCircle className="w-3 h-3"/>{v.sum}%</span>}
                    </div>
                    {!isAdmin && <button onClick={()=>{if(confirm(`Remove Song ${idx+1}?`)) removeSong(cue.id);}} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg opacity-50 hover:opacity-100" style={{ color:C.danger, background:"#FFDDD2" }}><Trash2 className="w-3.5 h-3.5"/>Remove</button>}
                  </div>
                  <div className="px-5 py-5">
                    <div className="grid grid-cols-6 gap-3 mb-5">
                      <Fld label="Song Title" tag="hybrid" span={3}><Inp value={cue.songTitle} onChange={v=>updateCue(cue.id,"songTitle",v)} readOnly={isAdmin} /></Fld>
                      <Fld label="Usage Type" tag="auto"><Inp value={cue.usageType} onChange={v=>updateCue(cue.id,"usageType",v)} readOnly={isAdmin} /></Fld>
                      <Fld label="Duration" tag="auto"><Inp value={cue.duration} onChange={v=>updateCue(cue.id,"duration",v)} readOnly={isAdmin} mono /></Fld>
                      <Fld label="Usages" tag="auto"><Inp value={cue.usages} onChange={v=>updateCue(cue.id,"usages",parseInt(v)||1)} readOnly={isAdmin} mono /></Fld>
                      <Fld label="Song Code" tag="manual"><Inp value={cue.songCode} onChange={v=>updateCue(cue.id,"songCode",v)} readOnly={isAdmin} mono /></Fld>
                      <Fld label="ISRC" tag="manual"><Inp value={cue.isrc||""} onChange={v=>updateCue(cue.id,"isrc",v)} readOnly={isAdmin} mono /></Fld>
                      <Fld label="Singer" tag="hybrid"><Inp value={cue.singer} onChange={v=>updateCue(cue.id,"singer",v)} readOnly={isAdmin} /></Fld>
                      <Fld label="PRS Work No." tag="manual"><Inp value={cue.workNumber||""} onChange={v=>updateCue(cue.id,"workNumber",v)} readOnly={isAdmin} mono /></Fld>
                      <Fld label="ASCAP Work ID" tag="manual"><Inp value={cue.ascapWorkId||""} onChange={v=>updateCue(cue.id,"ascapWorkId",v)} readOnly={isAdmin} mono /></Fld>
                      <Fld label="Validation Link" tag="manual" span={3}><Inp value={cue.validationLink||""} onChange={v=>updateCue(cue.id,"validationLink",v)} readOnly={isAdmin} /></Fld>
                    </div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs uppercase tracking-widest font-semibold" style={{ color:C.sub }}>Contributors</h4>
                      <div className="flex items-center gap-3">
                        <span className="text-xs px-2 py-1 rounded-lg" style={{ color:v.ok?C.ok:C.danger, background:v.ok?"#D8F3DC":"#FFDDD2" }}>Total: {v.sum}% {v.ok?"✓":"(need 100%)"}</span>
                        {!isAdmin && <button onClick={()=>addContrib(cue.id)} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg font-medium hover:opacity-90" style={{ background:C.dark, color:C.mint4 }}><Plus className="w-3 h-3"/>Add Row</button>}
                      </div>
                    </div>
                    <div className="rounded-xl border overflow-hidden" style={{ borderColor:C.mint1+"44" }}>
                      <table className="w-full text-sm"><thead><tr className="text-[10px] uppercase tracking-wider" style={{ background:C.mint4+"55", color:C.sub }}>
                        <th className="text-left px-3 py-2">Name</th><th className="text-left px-3 py-2 w-28">Role</th><th className="text-left px-3 py-2 w-24">Society</th><th className="text-left px-3 py-2 w-32">IPI / CAE</th><th className="text-left px-3 py-2 w-20">Share%</th>{!isAdmin && <th className="w-8"></th>}
                      </tr></thead>
                      <tbody>{cue.contributors.map(co => (
                        <tr key={co.id} className="border-t" style={{ borderColor:C.mint4+"88" }}>
                          <td className="p-1.5"><InpSm value={co.name} onChange={v=>updateContrib(cue.id,co.id,"name",v)} readOnly={isAdmin} placeholder="Name" /></td>
                          <td className="p-1.5"><InpSm value={co.role} onChange={v=>updateContrib(cue.id,co.id,"role",v)} readOnly={isAdmin} placeholder="C/A/E" /></td>
                          <td className="p-1.5"><InpSm value={co.society} onChange={v=>updateContrib(cue.id,co.id,"society",v)} readOnly={isAdmin} mono placeholder="IPRS" /></td>
                          <td className="p-1.5"><InpSm value={co.ipi} onChange={v=>updateContrib(cue.id,co.id,"ipi",v)} readOnly={isAdmin} mono placeholder="IPI" /></td>
                          <td className="p-1.5"><InpSm value={co.share} onChange={v=>updateContrib(cue.id,co.id,"share",parseFloat(v)||0)} readOnly={isAdmin} mono placeholder="%" /></td>
                          {!isAdmin && <td className="p-1.5"><button onClick={()=>removeContrib(cue.id,co.id)} className="opacity-30 hover:opacity-100" style={{ color:C.danger }} tabIndex={-1}><X className="w-3.5 h-3.5"/></button></td>}
                        </tr>
                      ))}</tbody></table>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* USER: Submit */}
          {!isAdmin && (ep.status==="in_progress"||ep.status==="pending"||ep.status==="rejected"||ep.status==="edited") && (
            <div className="rounded-2xl border p-6 mb-6 flex items-center justify-between" style={{ background:C.white, borderColor:C.mint1+"44" }}>
              <div>
                <div className="font-semibold text-lg" style={{ fontFamily:"'DM Serif Display', serif" }}>Ready to submit?</div>
                <div className="text-xs mt-1" style={{ color:C.sub }}>Once submitted, the admin will review and approve or request changes.</div>
              </div>
              <button onClick={handleSubmit} disabled={!allValid||ep.cues.length===0}
                className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-medium disabled:opacity-40 hover:opacity-90 transition"
                style={{ background:C.dark, color:C.mint4 }}>
                <Send className="w-4 h-4"/>Submit for Approval
              </button>
            </div>
          )}
          {ep.status==="submitted" && !isAdmin && (
            <div className="rounded-2xl border p-6 mb-6 text-center" style={{ background:"#F3E5F5", borderColor:"#CE93D8" }}>
              <Send className="w-6 h-6 mx-auto mb-2" style={{ color:"#7B1FA2" }} />
              <div className="font-semibold" style={{ color:"#7B1FA2" }}>Submitted — awaiting admin review</div>
              <div className="text-xs mt-1" style={{ color:"#9C27B0" }}>You'll be notified once the admin approves or requests changes.</div>
            </div>
          )}
          {ep.status==="approved" && !isAdmin && (
            <div className="rounded-2xl border p-6 mb-6 text-center" style={{ background:"#E8F5E9", borderColor:"#A5D6A7" }}>
              <CheckCircle2 className="w-6 h-6 mx-auto mb-2" style={{ color:C.ok }} />
              <div className="font-semibold" style={{ color:C.ok }}>Approved by admin</div>
              <div className="text-xs mt-1" style={{ color:C.mid }}>Cue sheets are ready for export (admin-only).</div>
            </div>
          )}

          {/* ADMIN: Approve / Reject */}
          {isAdmin && (ep.status==="submitted") && (
            <div className="rounded-2xl overflow-hidden mb-6" style={{ background:C.dark }}>
              <div className="px-6 py-5 border-b" style={{ borderColor:C.mid }}>
                <div className="font-semibold text-xl" style={{ fontFamily:"'DM Serif Display', serif", color:C.mint4 }}>Admin Review</div>
                <div className="text-xs mt-1" style={{ color:C.mint1+"88" }}>Review the data above. Approve to enable export, or reject with a note.</div>
              </div>
              <div className="p-6">
                <div className="mb-4">
                  <label className="text-xs uppercase tracking-widest block mb-2" style={{ color:C.mint1+"88" }}>Rejection note (required to reject)</label>
                  <textarea value={adminReviewNote} onChange={e=>setAdminReviewNote(e.target.value)} rows={3} placeholder="e.g. Song Code missing for 'Montu Da Theme'. Please verify singer name."
                    className="w-full border rounded-xl px-4 py-3 text-sm focus:outline-none" style={{ borderColor:C.mid, background:"rgba(255,255,255,0.05)", color:C.mint4 }} />
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={handleApprove} className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-medium hover:opacity-90 transition" style={{ background:C.ok, color:C.white }}>
                    <Check className="w-4 h-4"/>Approve
                  </button>
                  <button onClick={handleReject} disabled={!adminReviewNote.trim()} className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-medium disabled:opacity-40 hover:opacity-90 transition" style={{ background:C.danger, color:C.white }}>
                    <XCircle className="w-4 h-4"/>Reject
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ADMIN: Export (approved only) */}
          {isAdmin && ep.status === "approved" && (
            <div className="rounded-2xl overflow-hidden mb-6" style={{ background:C.dark }}>
              <div className="px-6 py-5 flex items-center justify-between border-b" style={{ borderColor:C.mid }}>
                <div className="flex items-center gap-3">
                  <Package className="w-5 h-5" style={{ color:C.mint1 }} />
                  <div>
                    <div className="font-semibold text-xl" style={{ fontFamily:"'DM Serif Display', serif", color:C.mint4 }}>Export Cue Sheets</div>
                    <div className="text-xs mt-0.5" style={{ color:C.mint1+"88" }}>Approved — download in society template format</div>
                  </div>
                </div>
                <span className="text-xs px-3 py-1.5 rounded-lg" style={{ background:"#27AE6033", border:"1px solid #27AE60", color:"#7DCEA0" }}>Ready to export</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 divide-x" style={{ borderColor:C.mid }}>
                <ExpBtn label="IPRS" sub="India" icon="🇮🇳" onClick={()=>dlExport(buildIPRS,"IPRS",proj,ep)} />
                <ExpBtn label="PRS" sub="UK" icon="🇬🇧" onClick={()=>dlExport(buildPRS,"PRS",proj,ep)} />
                <ExpBtn label="ASCAP" sub="USA" icon="🇺🇸" onClick={()=>dlExport(buildASCAP,"ASCAP",proj,ep)} />
              </div>
            </div>
          )}
        </main>
      </div>
    );
  }
  return null;
}

// ========== PRIMITIVES ==========
function MetaCard({ label, value, mono }) {
  return (<div className="rounded-xl border px-4 py-3" style={{ background:C.white, borderColor:C.mint1+"44" }}>
    <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color:C.sub }}>{label}</div>
    <div className="text-sm font-medium" style={mono?{fontFamily:"'DM Mono', monospace"}:{fontFamily:"'DM Serif Display', serif",fontSize:16}}>{value||"—"}</div>
  </div>);
}
function SectionTitle({ title }) {
  return <h3 className="text-2xl mb-4" style={{ fontFamily:"'DM Serif Display', serif" }}>{title}</h3>;
}
function Fld({ label, children, span, tag }) {
  const spanCls = {2:"col-span-2",3:"col-span-3",4:"col-span-4"}; const cls=spanCls[span]||"";
  const tMap = {auto:{c:"#27AE60",l:"A"},once:{c:"#1D4E89",l:"S"},hybrid:{c:"#C0392B",l:"H"},manual:{c:"#B08900",l:"M"}}; const t=tMap[tag];
  return (<div className={cls}><label className="text-[10px] uppercase tracking-widest block mb-1.5 flex items-center gap-1.5" style={{ color:C.sub }}>
    {t&&<span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-[7px] font-bold text-white" style={{background:t.c}}>{t.l}</span>}{label}
  </label>{children}</div>);
}
function Inp({ value, onChange, placeholder, mono, readOnly }) {
  return <input value={value??""}  onChange={e=>onChange?.(e.target.value)} placeholder={placeholder} readOnly={readOnly}
    className={`w-full border rounded-xl px-3 py-2 text-sm focus:outline-none transition-colors ${readOnly?"bg-gray-50 cursor-default":""}`}
    style={{ borderColor:C.mint1+"66", fontFamily:mono?"'DM Mono', monospace":undefined, fontSize:mono?13:undefined, background:readOnly?"#f5f5f5":C.white }}
    onFocus={e=>{if(!readOnly) e.target.style.borderColor=C.mint1}} onBlur={e=>e.target.style.borderColor=C.mint1+"66"} />;
}
function InpSm({ value, onChange, mono, placeholder, readOnly }) {
  return <input value={value??""} onChange={e=>onChange?.(e.target.value)} placeholder={placeholder} readOnly={readOnly}
    className={`w-full border rounded-lg px-2 py-1.5 text-sm focus:outline-none ${readOnly?"bg-gray-50 cursor-default":""}`}
    style={{ borderColor:C.mint1+"44", fontFamily:mono?"'DM Mono', monospace":undefined, fontSize:mono?12:undefined }}
    onFocus={e=>{if(!readOnly) e.target.style.borderColor=C.mint1}} onBlur={e=>e.target.style.borderColor=C.mint1+"44"} />;
}
function ExpBtn({ label, sub, icon, onClick }) {
  return (<button onClick={onClick} className="px-6 py-5 text-left transition-colors group" style={{ borderColor:C.mid }}
    onMouseEnter={e=>e.currentTarget.style.background=C.mid} onMouseLeave={e=>e.currentTarget.style.background=""}>
    <div className="flex items-center justify-between mb-2"><span className="text-lg">{icon}</span><Download className="w-4 h-4 opacity-40 group-hover:opacity-100" style={{color:C.mint1}}/></div>
    <div className="font-semibold text-lg" style={{fontFamily:"'DM Serif Display', serif",color:C.mint4}}>{label}</div>
    <div className="text-xs mt-1" style={{color:C.mint1+"88"}}>{sub}</div>
  </button>);
}
