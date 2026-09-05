import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app=initializeApp(firebaseConfig), auth=getAuth(app), db=getFirestore(app);
const S={month:new Date(),selected:new Date(),events:{},wishes:[],status:"wish",ready:false,saving:false};
const $=s=>document.querySelector(s), pad=n=>String(n).padStart(2,"0");
const dateKey=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const cloneDate=d=>new Date(d.getFullYear(),d.getMonth(),d.getDate());

function localBackup(){localStorage.setItem("mls-events",JSON.stringify(S.events));localStorage.setItem("mls-wishes",JSON.stringify(S.wishes))}
function loadLocal(){try{S.events=JSON.parse(localStorage.getItem("mls-events")||"{}")||{};S.wishes=JSON.parse(localStorage.getItem("mls-wishes")||"[]")||[]}catch{S.events={};S.wishes=[]}}
async function cloudSave(){if(!auth.currentUser)return;S.saving=true;updateSync("저장 중");try{await setDoc(doc(db,"users",auth.currentUser.uid),{events:S.events,wishes:S.wishes,updatedAt:Date.now()});localBackup();updateSync("저장됨")}finally{S.saving=false}}
async function cloudLoad(){const snap=await getDoc(doc(db,"users",auth.currentUser.uid));if(snap.exists()){const d=snap.data();S.events=d.events||{};S.wishes=d.wishes||[]}else{loadLocal();await cloudSave();return}localBackup()}
function updateSync(t){const el=$("#syncStatus");if(el)el.textContent=t}
function showAuth(user){$("#authOverlay").classList.toggle("hidden",!!user);$("#appShell").classList.toggle("locked",!user);if(user){$("#accountEmail").textContent=user.email||"내 계정";updateSync("연결됨")}}

function getRangeInfo(eventsForDay){
  if(!eventsForDay?.length)return null;
  const multi=eventsForDay.find(e=>e.seriesId&&e.startDate&&e.endDate);
  return multi||eventsForDay[0];
}
function renderCal(){
 const d=S.month,y=d.getFullYear(),m=d.getMonth(),first=new Date(y,m,1),start=first.getDay(),last=new Date(y,m+1,0).getDate(),prev=new Date(y,m,0).getDate();
 $("#monthTitle").textContent=`${y}년 ${m+1}월`;
 const g=$("#grid");g.innerHTML="";
 for(let i=0;i<42;i++){
   const n=i-start+1,cd=n<1?new Date(y,m-1,prev+n):n>last?new Date(y,m+1,n-last):new Date(y,m,n);
   const key=dateKey(cd),items=S.events[key]||[];
   const x=document.createElement("div");
   x.className="day"+(cd.getMonth()!=m?" muted":"")+(key===dateKey(new Date())?" today":"")+(key===dateKey(S.selected)?" selected":"");
   const range=getRangeInfo(items);
   let strip="";
   if(range&&range.seriesId){
     const sd=new Date(range.startDate+"T00:00:00"),ed=new Date(range.endDate+"T00:00:00");
     const actualStart=key===dateKey(sd),actualEnd=key===dateKey(ed);
     const weekStart=cd.getDay()===0,weekEnd=cd.getDay()===6;
     const startSeg=actualStart||weekStart,endSeg=actualEnd||weekEnd;
     const cls=startSeg&&endSeg?"single":startSeg?"start":endSeg?"end":"middle";
     const label=actualStart?`<span class="strip-title">${escapeHtml(range.title)}</span>`:"";
     strip=`<span class="event-strip ${cls}">${label}</span>`;
   }else if(items.length){
     const e=items[0];
     strip=`<span class="event-strip single"><span class="strip-title">${escapeHtml(e.title)}</span></span>`;
   }
   x.innerHTML=`<span class="day-number">${cd.getDate()}</span>${strip}`;
   x.onclick=()=>{S.selected=cloneDate(cd);renderCal()};g.appendChild(x)
 }
 $("#selectedDate").textContent=S.selected.toLocaleDateString("ko-KR",{month:"long",day:"numeric",weekday:"short"});
 const es=S.events[dateKey(S.selected)]||[],box=$("#events");box.className="event-list";
 box.innerHTML=es.length?es.map((e,i)=>`<div class="event" data-i="${i}"><strong>${escapeHtml(e.title)}</strong><small>${e.time||"시간 없음"}${e.startDate&&e.endDate&&e.startDate!==e.endDate?` · ${formatShort(e.startDate)}–${formatShort(e.endDate)}`:""}</small></div>`).join(""): '<div class="empty">등록된 일정이 없어요.</div>';
 box.querySelectorAll(".event").forEach(el=>el.onclick=async()=>{if(confirm("이 일정을 삭제할까요?")){const idx=+el.dataset.i,ev=es[idx];if(ev?.seriesId){for(const k of Object.keys(S.events)){S.events[k]=(S.events[k]||[]).filter(x=>x.seriesId!==ev.seriesId);if(!S.events[k].length)delete S.events[k]}}else{es.splice(idx,1);if(!es.length)delete S.events[dateKey(S.selected)]}await cloudSave();renderCal()}})
}

function escapeHtml(s){return String(s??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;","\"":"&quot;"}[c]))}
function formatShort(k){const d=new Date(k+"T00:00:00");return `${d.getMonth()+1}/${d.getDate()}`}
$("#prev").onclick=()=>{S.month.setMonth(S.month.getMonth()-1);renderCal()};$("#next").onclick=()=>{S.month.setMonth(S.month.getMonth()+1);renderCal()};

function parseKorean(text){
  const original=String(text||"").trim();
  const now=new Date();
  const today=cloneDate(now);
  let base=cloneDate(S.selected||today), start=null, end=null;

  const wd={"일":0,"월":1,"화":2,"수":3,"목":4,"금":5,"토":6};
  const cleanSpace=t=>t.replace(/\s+/g," ").trim();

  // 날짜 범위: 9월 10일부터 9월 13일까지 / 9월 10일~13일
  const range=original.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일?\s*(?:부터|~|-|–|—)\s*(?:(\d{1,2})\s*월\s*)?(\d{1,2})\s*일?\s*(?:까지)?/);
  const single=original.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/);

  // 상대 날짜는 오늘 기준으로 해석. '다음주 화요일'은 다음 주의 화요일.
  const relWeek=original.match(/(다다음주|다음주|이번주)\s*(일|월|화|수|목|금|토)요일?/);
  const weekdayOnly=original.match(/(?<!다음주\s)(?<!다다음주\s)(?<!이번주\s)(일|월|화|수|목|금|토)요일?/);

  if(range){
    const sm=+range[1], sd=+range[2], em=range[3]?+range[3]:sm, ed=+range[4];
    start=new Date(today.getFullYear(),sm-1,sd);
    end=new Date(today.getFullYear(),em-1,ed);
    if(start<today && start.getFullYear()===today.getFullYear()) start.setFullYear(today.getFullYear()+1), end.setFullYear(today.getFullYear()+1);
    if(end<start) end.setFullYear(start.getFullYear()+1);
    base=cloneDate(start);
  }else if(single){
    base=new Date(today.getFullYear(),+single[1]-1,+single[2]);
    if(base<today) base.setFullYear(base.getFullYear()+1);
  }else if(/오늘/.test(original)){
    base=cloneDate(today);
  }else if(/모레/.test(original)){
    base=cloneDate(today); base.setDate(base.getDate()+2);
  }else if(/내일/.test(original)){
    base=cloneDate(today); base.setDate(base.getDate()+1);
  }else if(relWeek){
    const offset={"이번주":0,"다음주":1,"다다음주":2}[relWeek[1]];
    const target=wd[relWeek[2]];
    // 이번 주의 월요일을 기준으로 주차를 계산
    const monday=cloneDate(today); monday.setDate(monday.getDate()-((monday.getDay()+6)%7));
    base=cloneDate(monday); base.setDate(base.getDate()+offset*7+((target+6)%7));
  }else if(weekdayOnly){
    const target=wd[weekdayOnly[1]];
    let diff=(target-today.getDay()+7)%7;
    if(diff===0) diff=7;
    base=cloneDate(today); base.setDate(base.getDate()+diff);
  }

  // 시간은 날짜 숫자와 분리해서 가장 자연스러운 시간 표현만 인식
  const tm=original.match(/(?:오전|오후|새벽|아침|저녁|밤)\s*\d{1,2}\s*(?:시|:\s*\d{2})(?:\s*\d{1,2}\s*분)?|\b\d{1,2}\s*(?:시|:\s*\d{2})(?:\s*\d{1,2}\s*분)?/);
  let hour=9,min=0;
  if(tm){
    const nums=tm[0].match(/\d{1,2}/g)||[];
    hour=+(nums[0]||9); min=+(nums[1]||0);
    const period=(tm[0].match(/오전|오후|새벽|아침|저녁|밤/)||[])[0];
    if(["오후","저녁","밤"].includes(period) && hour<12) hour+=12;
    if(["오전","새벽","아침"].includes(period) && hour===12) hour=0;
  }

  // 제목에는 날짜/시간 표현을 남기지 않음. '다음주 수행' 같은 잔여 표현도 제거.
  let cleaned=original;
  const removePatterns=[
    /\d{1,2}\s*월\s*\d{1,2}\s*일?\s*(?:부터|~|-|–|—)\s*(?:(?:\d{1,2})\s*월\s*)?\d{1,2}\s*일?\s*(?:까지)?/g,
    /\d{1,2}\s*월\s*\d{1,2}\s*일/g,
    /다다음주|다음주|이번주/g,
    /오늘|모레|내일/g,
    /(?:오전|오후|새벽|아침|저녁|밤)\s*\d{1,2}\s*(?:시|:\s*\d{2})(?:\s*\d{1,2}\s*분)?|\b\d{1,2}\s*(?:시|:\s*\d{2})(?:\s*\d{1,2}\s*분)?/g,
    /(?:일|월|화|수|목|금|토)요일?/g,
    /\s*(?:부터|까지|에|의)\s*/g
  ];
  for(const re of removePatterns) cleaned=cleaned.replace(re," ");
  cleaned=cleanSpace(cleaned).replace(/^[,./·~\-–—]+|[,./·~\-–—]+$/g,"");

  return {
    date:base,
    startDate:start?dateKey(start):dateKey(base),
    endDate:end?dateKey(end):dateKey(base),
    time:`${pad(hour)}:${pad(min)}`,
    title:cleaned||"새 일정",
    tag:"개인"
  };
}

$("#openEvent").onclick=$("#openEvent2").onclick=()=>{$("#quickEvent").value="";$("#eventDialog").showModal()};
$("#eventForm").onsubmit=async e=>{e.preventDefault();const p=parseKorean($("#quickEvent").value),sd=new Date(p.startDate+"T00:00:00"),ed=new Date(p.endDate+"T00:00:00"),seriesId=Date.now().toString();let cur=cloneDate(sd);while(cur<=ed){const k=dateKey(cur);(S.events[k]??=[]).push({...p,seriesId});cur.setDate(cur.getDate()+1)}S.selected=sd;S.month=new Date(sd);await cloudSave();$("#eventDialog").close();renderCal()};

async function fetchMeta(url){const endpoint="https://api.microlink.io/?url="+encodeURIComponent(url)+"&data.title.selector=title&data.image.selector=meta[property='og:image']&data.price.selector=[class*='price'],[id*='price'],meta[property='product:price:amount']";const r=await fetch(endpoint);if(!r.ok)throw Error("fetch failed");const j=await r.json(),d=j.data||{};return{title:d.title?.value||d.title||url,image:d.image?.url||d.image?.value||"",price:d.price?.value||d.price||""}}
$("#openWish").onclick=()=>{$("#wishForm").reset();$("#preview").classList.add("hidden");$("#preview").dataset.data="";$("#wishDialog").showModal()};
$("#previewBtn").onclick=async()=>{let url=$("#wishUrl").value.trim();if(!url)return;$("#previewBtn").textContent="불러오는 중";$("#previewBtn").disabled=true;try{let d=await fetchMeta(url);$("#preview").classList.remove("hidden");$("#previewImg").src=d.image||"assets/flower.jpg";$("#previewTitle").textContent=d.title||"상품명 확인 필요";$("#previewPrice").textContent=d.price||"가격은 자동 인식되지 않았어요";$("#preview").dataset.data=JSON.stringify(d)}catch(e){alert("자동 정보를 가져오지 못했어요. 링크는 저장할 수 있어요.")}finally{$("#previewBtn").textContent="상품 정보 가져오기";$("#previewBtn").disabled=false}};
$("#wishForm").onsubmit=async e=>{e.preventDefault();let d={};try{d=JSON.parse($("#preview").dataset.data||"{}")}catch{}const w={id:Date.now(),url:$("#wishUrl").value,title:d.title||"상품",image:d.image||"assets/flower.jpg",price:d.price||"가격 확인 필요",status:$("#wishStatus").value};S.wishes.unshift(w);await cloudSave();$("#wishDialog").close();renderWishes()};
function renderWishes(){let q=$("#search").value.toLowerCase(),arr=S.wishes.filter(w=>w.status===S.status&&String(w.title||"").toLowerCase().includes(q));$("#wishGrid").innerHTML=arr.length?arr.map(w=>`<article class="wish"><img class="wish-img" src="${escapeAttr(w.image)}" onerror="this.src='assets/flower.jpg'"><div class="wish-body"><h3>${escapeHtml(w.title)}</h3><div class="price">${escapeHtml(w.price)}</div><div class="wish-meta"><span class="badge">${w.status.toUpperCase()}</span><div class="wish-actions"><button class="buy-btn" data-id="${w.id}">${w.status==="wish"?"BOUGHT":"WISH"}</button><button class="delete-btn" data-delete="${w.id}">삭제</button></div></div></div></article>`).join(""): '<p class="empty">등록된 위시가 없어요.</p>';
 document.querySelectorAll(".buy-btn").forEach(b=>b.onclick=async()=>{let w=S.wishes.find(x=>x.id==b.dataset.id);if(!w)return;w.status=w.status==="wish"?"bought":"wish";await cloudSave();renderWishes()});
 document.querySelectorAll(".delete-btn").forEach(b=>b.onclick=async()=>{if(!confirm("이 위시를 삭제할까요?"))return;S.wishes=S.wishes.filter(x=>x.id!=b.dataset.delete);await cloudSave();renderWishes()})}
function escapeAttr(s){return String(s??"").replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}
document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>{document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));b.classList.add("active");S.status=b.dataset.status;renderWishes()});$("#search").oninput=renderWishes;
document.querySelectorAll(".nav").forEach(b=>b.onclick=()=>{document.querySelectorAll(".nav").forEach(x=>x.classList.remove("active"));b.classList.add("active");document.querySelectorAll(".page").forEach(x=>x.classList.remove("active"));$("#"+b.dataset.page).classList.add("active")});document.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>$("#"+b.dataset.close).close());
$("#loginForm").onsubmit=async e=>{e.preventDefault();try{await signInWithEmailAndPassword(auth,$("#authEmail").value.trim(),$("#authPassword").value);$("#authMessage").textContent=""}catch(err){$("#authMessage").textContent="이메일 또는 비밀번호를 확인해 주세요."}};
$("#signupBtn").onclick=async()=>{try{await createUserWithEmailAndPassword(auth,$("#authEmail").value.trim(),$("#authPassword").value);$("#authMessage").textContent=""}catch(err){$("#authMessage").textContent="회원가입에 실패했어요. 이메일과 비밀번호를 확인해 주세요."}};
$("#logoutBtn").onclick=()=>signOut(auth);
onAuthStateChanged(auth,async user=>{showAuth(user);if(!user){S.ready=false;return}try{await cloudLoad();S.ready=true;renderCal();renderWishes()}catch(e){console.error(e);alert("온라인 저장소에 연결하지 못했어요. Firebase 설정과 Firestore 규칙을 확인해 주세요.")}});
