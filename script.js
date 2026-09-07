import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app=initializeApp(firebaseConfig),auth=getAuth(app),db=getFirestore(app);
const S={month:new Date(),selected:new Date(),events:{},wishes:[],books:[],movies:[],status:"wish",libraryStatus:{books:"to-read",movies:"to-watch"},ready:false,saving:false};
const $=s=>document.querySelector(s),pad=n=>String(n).padStart(2,"0");
const dateKey=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const cloneDate=d=>new Date(d.getFullYear(),d.getMonth(),d.getDate());
const todayKey=()=>dateKey(new Date());

function localBackup(){localStorage.setItem("planner-events",JSON.stringify(S.events));localStorage.setItem("planner-wishes",JSON.stringify(S.wishes));localStorage.setItem("planner-books",JSON.stringify(S.books));localStorage.setItem("planner-movies",JSON.stringify(S.movies))}
function loadLocal(){try{S.events=JSON.parse(localStorage.getItem("planner-events")||"{}")||{};S.wishes=JSON.parse(localStorage.getItem("planner-wishes")||"[]")||[]}catch{S.events={};S.wishes=[]}}
async function cloudSave(){if(!auth.currentUser)return;S.saving=true;updateSync("저장 중");try{await setDoc(doc(db,"users",auth.currentUser.uid),{events:S.events,wishes:S.wishes,books:S.books,movies:S.movies,updatedAt:Date.now()});localBackup();updateSync("저장됨")}finally{S.saving=false}}
async function cloudLoad(){const snap=await getDoc(doc(db,"users",auth.currentUser.uid));if(snap.exists()){const d=snap.data();S.events=d.events||{};S.wishes=d.wishes||[];S.books=d.books||[];S.movies=d.movies||[]}else{loadLocal();await cloudSave();return}const changed=await normalizeStoredWishPrices();localBackup();if(changed)await cloudSave()}
function updateSync(t){const el=$("#syncStatus");if(el)el.textContent=t}
function showAuth(user){$("#authOverlay").classList.toggle("hidden",!!user);$("#appShell").classList.toggle("locked",!user);if(user){$("#accountEmail").textContent=user.email||"내 계정";updateSync("연결됨")}}
function escapeHtml(s){return String(s??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;","\"":"&quot;"}[c]))}
function escapeAttr(s){return String(s??"").replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}
function formatShort(k){const d=new Date(k+"T00:00:00");return `${d.getMonth()+1}/${d.getDate()}`}
function daysBetween(a,b){return Math.round((new Date(b+"T00:00:00")-new Date(a+"T00:00:00"))/86400000)}

function eventIdentity(e){return e.seriesId ? `series:${e.seriesId}` : `event:${e.id||e.createdAt||e.title}`}
function allCalendarEvents(){
 const map=new Map();
 for(const [key,items] of Object.entries(S.events||{})) for(const e of (items||[])){
  const id=eventIdentity(e); if(!map.has(id)) map.set(id,{...e,id});
 }
 return [...map.values()];
}
function eventStart(e){return e.startDate||e.date}
function eventEnd(e){return e.endDate||e.startDate||e.date}
function getWeekEvents(weekStart){
 const ws=cloneDate(weekStart), we=new Date(ws); we.setDate(we.getDate()+6);
 const wk=[];
 for(const e of allCalendarEvents()){
  const s=new Date(eventStart(e)+"T00:00:00"), en=new Date(eventEnd(e)+"T00:00:00");
  if(s<=we && en>=ws) wk.push(e);
 }
 wk.sort((a,b)=>eventStart(a).localeCompare(eventStart(b)) || eventEnd(a).localeCompare(eventEnd(b)) || String(a.title).localeCompare(String(b.title)));
 const lanes=[];
 for(const e of wk){
  const s=new Date(eventStart(e)+"T00:00:00"), en=new Date(eventEnd(e)+"T00:00:00");
  let lane=0;
  while(lanes[lane] && lanes[lane]>=s) lane++;
  lanes[lane]=new Date(en); e._lane=lane;
 }
 return wk;
}
const EVENT_PALETTE=["#FF3197","#FFAC8F","#FEFDB2","#6CEBEF","#C9A7F5","#BFEF9B","#FFB36B","#A77BE8"];
function eventColorMap(){
 const events=allCalendarEvents();
 const map=new Map();
 const used=new Set();
 let next=0;
 // Assign a color once per distinct schedule and keep it on the stored event data.
 // A multi-day series shares one color on every date; different schedules do not share colors.
 for(const e of events){
  const id=eventIdentity(e);
  if(e.colorIndex==null){
   while(used.has(next) && next<EVENT_PALETTE.length) next++;
   e.colorIndex=next<EVENT_PALETTE.length?next:0;
  }
  used.add(e.colorIndex);
  map.set(id,EVENT_PALETTE[e.colorIndex]||EVENT_PALETTE[0]);
 }
 return map;
}
function colorForEvent(e){
 const map=eventColorMap();
 return map.get(eventIdentity(e)) || EVENT_PALETTE[0];
}
function renderCal(){
 const d=S.month,y=d.getFullYear(),m=d.getMonth(),first=new Date(y,m,1),start=first.getDay(),last=new Date(y,m+1,0).getDate(),prev=new Date(y,m,0).getDate();
 $("#monthTitle").textContent=`${y}년 ${m+1}월`; const g=$("#grid"); g.innerHTML="";
 const cells=[];
 for(let i=0;i<42;i++){
  const n=i-start+1,cd=n<1?new Date(y,m-1,prev+n):n>last?new Date(y,m+1,n-last):new Date(y,m,n);
  cells.push({cd,key:dateKey(cd),x:null});
 }
 for(let week=0;week<6;week++){
  const weekStart=cells[week*7].cd, weekEvents=getWeekEvents(weekStart);
  const laneCount=Math.max(1,...weekEvents.map(e=>e._lane+1));
  for(let j=0;j<7;j++){
   const c=cells[week*7+j],cd=c.cd,key=c.key,items=S.events[key]||[],x=document.createElement("div");
   x.className="day"+(cd.getMonth()!=m?" muted":"")+(key===todayKey()?" today":"")+(key===dateKey(S.selected)?" selected":"");
   x.style.setProperty("--lane-count",laneCount);
   let bars="";
   for(const e of weekEvents){
    // 한 날짜/주에 보이는 막대는 최대 3개까지만 표시
    if((e._lane||0)>=3) continue;
    const es=eventStart(e), ee=eventEnd(e); if(key<es||key>ee) continue;
    const atStart=key===es || j===0, atEnd=key===ee || j===6;
    const cls=(atStart?" bar-start":"")+(atEnd?" bar-end":"");
    const label=atStart?`<span>${escapeHtml(e.title)}</span>`:"";
    bars+=`<div class="event-bar${cls}" style="--lane:${e._lane};--event-color:${colorForEvent(e)}" title="${escapeAttr(e.title)}">${label}</div>`;
   }
   x.innerHTML=`<span class="day-number">${cd.getDate()}</span><div class="bars">${bars}</div>`;
   x.onclick=()=>{S.selected=cloneDate(cd);renderCal()}; g.appendChild(x);
  }
 }
 $("#selectedDate").textContent=S.selected.toLocaleDateString("ko-KR",{year:"numeric",month:"long",day:"numeric",weekday:"short"});
 const es=S.events[dateKey(S.selected)]||[],box=$("#events");
 box.className="event-list";
 box.innerHTML=es.length?es.map((e,i)=>{
   const color=colorForEvent(e);
   return `<div class="event" data-i="${i}" style="--event-color:${color};background:${color};border-left-color:${color}"><strong>${escapeHtml(e.title)}</strong><small>${e.startTime&&e.endTime?`${e.startTime}–${e.endTime}`:(e.startTime||e.endTime||"시간 없음")}${e.startDate&&e.endDate&&e.startDate!==e.endDate?` · ${formatShort(e.startDate)}–${formatShort(e.endDate)}`:""}</small></div>`;
 }).join(""): '<div class="empty">일정이 없습니다.</div>';
 box.querySelectorAll(".event").forEach(el=>el.onclick=async()=>{if(!confirm("이 일정을 삭제할까요?"))return;const idx=+el.dataset.i,ev=es[idx];if(ev?.seriesId){for(const k of Object.keys(S.events)){S.events[k]=(S.events[k]||[]).filter(x=>x.seriesId!==ev.seriesId);if(!S.events[k].length)delete S.events[k]}}else{es.splice(idx,1);if(!es.length)delete S.events[dateKey(S.selected)]}await cloudSave();renderCal()});
}
$("#prev").onclick=()=>{S.month.setMonth(S.month.getMonth()-1);renderCal()};
$("#next").onclick=()=>{S.month.setMonth(S.month.getMonth()+1);renderCal()};

function openEventDialog(){
 const dialog=$("#eventDialog");
 if(!dialog)return;
 const selected=dateKey(S.selected||new Date());
 $("#eventDate").value=selected;
 $("#eventEndDate").value=selected;
 $("#eventStartTime").value="";
 $("#eventEndTime").value="";
 $("#eventTitle").value="";
 try{
  if(typeof dialog.showModal==="function") dialog.showModal();
  else dialog.setAttribute("open","");
 }catch(err){
  dialog.setAttribute("open","");
 }
 setTimeout(()=>$("#eventTitle")?.focus(),60);
}
const openEventButton=$("#openEvent"),openEventButton2=$("#openEvent2");
if(openEventButton)openEventButton.addEventListener("click",e=>{e.preventDefault();openEventDialog()});
if(openEventButton2)openEventButton2.addEventListener("click",e=>{e.preventDefault();openEventDialog()});
$("#eventDate").onchange=()=>{if(!$("#eventEndDate").value||$("#eventEndDate").value===$("#eventDate").value)$("#eventEndDate").value=$("#eventDate").value};
$("#eventForm").onsubmit=async e=>{e.preventDefault();let sd=$("#eventDate").value,ed=$("#eventEndDate").value||sd;if(ed<sd){alert("종료일은 시작일 이후로 선택해 주세요.");return}const st=$("#eventStartTime").value||"",et=$("#eventEndTime").value||"";if((st&&!et)||(!st&&et)){alert("시작 시간과 종료 시간을 모두 선택해 주세요.");return}if(st&&et&&et<st){alert("종료 시간은 시작 시간 이후로 선택해 주세요.");return}const p={startDate:sd,endDate:ed,startTime:$("#eventStartTime").value||"",endTime:$("#eventEndTime").value||"",title:$("#eventTitle").value.trim(),tag:"개인"},seriesId=Date.now().toString();let cur=new Date(sd+"T00:00:00"),end=new Date(ed+"T00:00:00");while(cur<=end){const k=dateKey(cur);(S.events[k]??=[]).push({...p,seriesId});cur.setDate(cur.getDate()+1)}S.selected=new Date(sd+"T00:00:00");S.month=new Date(sd+"T00:00:00");await cloudSave();$("#eventDialog").close();renderCal()};

function getNestedValue(v){
 if(v==null)return "";
 if(typeof v==="string"||typeof v==="number")return String(v);
 if(typeof v==="object"){
  for(const k of ["value","content","text","amount","price","displayValue","formatted","raw"]){if(v[k]!=null){const x=getNestedValue(v[k]);if(x)return x}}
  return "";
 }
 return String(v);
}

const currencyMap={
 "$":"USD","US$":"USD","USD":"USD","US dollars":"USD","dollar":"USD","dollars":"USD","달러":"USD",
 "€":"EUR","EUR":"EUR","euro":"EUR","euros":"EUR","유로":"EUR","£":"GBP","GBP":"GBP","pound":"GBP","pounds":"GBP","파운드":"GBP",
 "¥":"JPY","￥":"JPY","JPY":"JPY","yen":"JPY","엔":"JPY","CNY":"CNY","RMB":"CNY",
 "A$":"AUD","AUD":"AUD","C$":"CAD","CAD":"CAD","CHF":"CHF","HK$":"HKD","HKD":"HKD","SGD":"SGD","S$":"SGD",
 "TWD":"TWD","NT$":"TWD","THB":"THB","฿":"THB","INR":"INR","₹":"INR","KRW":"KRW","₩":"KRW","원":"KRW"
};
function extractPriceText(v){return String(getNestedValue(v)||"").replace(/\s+/g," ").trim()}
function detectCurrency(text){
 const raw=String(text||"").trim();
 if(/(?:₩|KRW|원)\s*[-+]?\d|[-+]?\d[\d,]*(?:\.\d+)?\s*(?:₩|KRW|원)/i.test(raw))return "KRW";
 if(/(?:A\$|AUD|호주\s*달러)/i.test(raw))return "AUD";
 if(/(?:C\$|CAD|캐나다\s*달러)/i.test(raw))return "CAD";
 if(/(?:HK\$|HKD)/i.test(raw))return "HKD";
 if(/(?:S\$|SGD)/i.test(raw))return "SGD";
 if(/(?:NT\$|TWD|대만\s*달러)/i.test(raw))return "TWD";
 if(/(?:US\$|USD|\$|달러|dollars?|미국\s*달러)/i.test(raw))return "USD";
 if(/(?:€|EUR|유로)/i.test(raw))return "EUR";
 if(/(?:£|GBP|파운드)/i.test(raw))return "GBP";
 if(/(?:¥|￥|JPY|엔)/i.test(raw))return "JPY";
 if(/(?:CNY|RMB|위안)/i.test(raw))return "CNY";
 if(/(?:CHF|프랑)/i.test(raw))return "CHF";
 if(/(?:฿|THB|바트)/i.test(raw))return "THB";
 if(/(?:₹|INR|루피)/i.test(raw))return "INR";
 return null;
}
function extractAmount(text){
 const raw=String(text||"").replace(/,/g,"");
 const nums=raw.match(/[-+]?\d+(?:\.\d+)?/g);
 return nums?.length?Number(nums[0]):null;
}
const fallbackKRW={USD:1450,EUR:1690,GBP:1960,JPY:9.6,CNY:200,AUD:960,CAD:1050,CHF:1820,HKD:185,SGD:1130,TWD:45,THB:43,INR:17};
async function getRate(currency){
 const apis=[
  `https://open.er-api.com/v6/latest/${encodeURIComponent(currency)}`,
  `https://api.frankfurter.app/latest?from=${encodeURIComponent(currency)}&to=KRW`
 ];
 for(const api of apis){
  try{const r=await fetch(api,{cache:"no-store"});if(!r.ok)continue;const j=await r.json();const rate=Number(j.rates?.KRW);if(Number.isFinite(rate)&&rate>0)return rate}catch{}
 }
 return fallbackKRW[currency]||null;
}
async function convertToKRW(text){
 const raw=extractPriceText(text);if(!raw)return "";
 const currency=detectCurrency(raw),amount=extractAmount(raw);
 if(amount==null||!Number.isFinite(amount))return "가격 확인 필요";
 if(currency==="KRW"||(!currency&&/^[\d\s,.]+(?:원)?$/.test(raw)))return `${Math.round(amount).toLocaleString("ko-KR")}원`;
 if(!currency)return raw.length>80?"가격 확인 필요":raw;
 const rate=await getRate(currency);if(!rate)return "환율 확인 필요";
 return `${Math.round(amount*rate).toLocaleString("ko-KR")}원`;
}
async function fetchMeta(url){
 const endpoint="https://api.microlink.io/?url="+encodeURIComponent(url)+"&data.title.selector=title&data.image.selector=meta[property='og:image']&data.price.selector=meta[property='product:price:amount'],meta[property='og:price:amount'],[class*='price'],[id*='price']&data.currency.selector=meta[property='product:price:currency'],meta[property='og:price:currency']";
 const r=await fetch(endpoint);if(!r.ok)throw Error("fetch failed");
 const j=await r.json(),d=j.data||{};
 const rawPrice=extractPriceText(d.price);
 const rawCurrency=extractPriceText(d.currency);
 const priceSource=rawPrice && rawCurrency && !detectCurrency(rawPrice)?`${rawPrice} ${rawCurrency}`:rawPrice;
 const title=getNestedValue(d.title).trim();
 const image=getNestedValue(d.image?.url||d.image).trim();
 const price=await convertToKRW(priceSource);
 if(!title && !image && !price)throw Error("no product metadata");
 return{title:title||"",image,price};
}
async function normalizeStoredWishPrices(){
 let changed=false;
 for(const w of S.wishes){
  if(!w.price)continue;
  const normalized=await convertToKRW(w.priceRaw||w.price);
  if(normalized && normalized!==w.price && normalized!=="환율 확인 필요" && normalized!=="가격 확인 필요"){w.price=normalized;changed=true}
 }
 return changed;
}
function resetWishForm(){
 $("#wishForm").reset();
 $("#preview").classList.add("hidden");
 $("#preview").dataset.data="";
 $("#wishFetchMessage").textContent="";
 $("#wishImageFileName").textContent="";
 $("#wishImageFile").dataset.data="";
}
async function resizeImageFile(file){
 if(!file)return "";
 if(!file.type.startsWith("image/"))throw Error("not image");
 const src=URL.createObjectURL(file);
 try{
  const img=new Image();
  await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=src});
  const max=900,scale=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight));
  const canvas=document.createElement("canvas");
  canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));
  canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
  const ctx=canvas.getContext("2d");ctx.drawImage(img,0,0,canvas.width,canvas.height);
  return canvas.toDataURL("image/jpeg",.82);
 }finally{URL.revokeObjectURL(src)}
}
$("#wishImageFile").onchange=async()=>{
 const file=$("#wishImageFile").files?.[0];
 if(!file)return;
 try{
  $("#wishImageFileName").textContent="사진 준비 중…";
  const data=await resizeImageFile(file);
  $("#wishImageFile").dataset.data=data;
  $("#wishImageFileName").textContent=file.name+" · 사진을 저장할 수 있어요.";
  $("#wishImage").value="";
  $("#previewImg").src=data;
  $("#previewTitle").textContent=$("#wishTitle").value.trim()||"직접 선택한 이미지";
  $("#previewPrice").textContent=$("#wishPrice").value.trim()||"";
  $("#preview").classList.remove("hidden");
 }catch{
  $("#wishImageFileName").textContent="이미지를 읽지 못했어요. 다른 사진을 선택해 주세요.";
  $("#wishImageFile").dataset.data="";
 }
};
$("#openWish").onclick=()=>{resetWishForm();$("#wishDialog").showModal();setTimeout(()=>$("#wishUrl").focus(),60)};
$("#previewBtn").onclick=async()=>{
 const url=$("#wishUrl").value.trim();
 if(!url){$("#wishFetchMessage").textContent="링크를 먼저 입력해 주세요.";return}
 $("#previewBtn").textContent="불러오는 중";$("#previewBtn").disabled=true;$("#wishFetchMessage").textContent="";
 try{
  const d=await fetchMeta(url);
  $("#preview").classList.remove("hidden");
  $("#previewImg").src=d.image||"assets/flower.jpg";
  $("#previewTitle").textContent=d.title||"상품명 확인 필요";
  $("#previewPrice").textContent=d.price||"가격 확인 필요";
  $("#preview").dataset.data=JSON.stringify(d);
  if(d.title)$("#wishTitle").value=d.title;
  if(d.price)$("#wishPrice").value=d.price;
  if(d.image)$("#wishImage").value=d.image;
  $("#wishFetchMessage").textContent="상품 정보를 가져왔어요.";
 }catch(e){
  $("#preview").classList.add("hidden");
  $("#preview").dataset.data="";
  $("#wishFetchMessage").textContent="자동 인식 실패 · 아래에 직접 입력해 주세요.";
 }finally{$("#previewBtn").textContent="상품 정보 가져오기";$("#previewBtn").disabled=false}
};
$("#wishForm").onsubmit=async e=>{
 e.preventDefault();
 const url=$("#wishUrl").value.trim();
 let d={};try{d=JSON.parse($("#preview").dataset.data||"{}")}catch{}
 // 저장 버튼만 눌러도 자동으로 상품 정보 가져오기를 한 번 시도합니다.
 if(url && !d.title && !d.image && !d.price){
  $("#wishFetchMessage").textContent="상품 정보 확인 중…";
  try{d=await fetchMeta(url)}catch{}
 }
 let title=$("#wishTitle").value.trim()||d.title||"상품";
 let priceInput=$("#wishPrice").value.trim();
 let price=priceInput||d.price||"가격 확인 필요";
 if(priceInput){const normalized=await convertToKRW(priceInput);if(normalized && normalized!=="환율 확인 필요" && normalized!=="가격 확인 필요")price=normalized}
 const uploadedImage=$("#wishImageFile").dataset.data||"";
 const image=uploadedImage||$("#wishImage").value.trim()||d.image||"assets/flower.jpg";
 const w={id:Date.now(),url,title,image,price,priceRaw:priceInput||d.priceRaw||price,status:$("#wishStatus").value};
 S.wishes.unshift(w);await cloudSave();$("#wishDialog").close();renderWishes();
};
function safeUrl(url){try{const u=new URL(url);return /^https?:$/.test(u.protocol)?u.href:""}catch{return ""}}
function renderWishes(){
 let q=$("#search").value.toLowerCase(),arr=S.wishes.filter(w=>w.status===S.status&&String(w.title||"").toLowerCase().includes(q));
 $("#wishGrid").innerHTML=arr.length?arr.map(w=>{
  const link=safeUrl(w.url); const card=`<article class="wish"><img class="wish-img" src="${escapeAttr(w.image||"assets/flower.jpg")}" onerror="this.src='assets/flower.jpg'"><div class="wish-body"><h3>${escapeHtml(w.title)}</h3><div class="price">${escapeHtml(w.price||"가격 확인 필요")}</div><div class="wish-meta"><span class="badge">${w.status.toUpperCase()}</span><div class="wish-actions"><button class="buy-btn" data-id="${w.id}">${w.status==="wish"?"BOUGHT":"WISH"}</button><button class="delete-btn" data-delete="${w.id}">삭제</button></div></div>${link?`<a class="visit-link" href="${escapeAttr(link)}" target="_blank" rel="noopener noreferrer">상품 보러가기 ↗</a>`:""}</div></article>`;
  return card;
 }).join(""): '<p class="empty">등록된 위시가 없습니다.</p>';
 document.querySelectorAll(".buy-btn").forEach(b=>b.onclick=async()=>{let w=S.wishes.find(x=>x.id==b.dataset.id);if(!w)return;w.status=w.status==="wish"?"bought":"wish";await cloudSave();renderWishes()});
 document.querySelectorAll(".delete-btn").forEach(b=>b.onclick=async()=>{if(!confirm("이 위시를 삭제할까요?"))return;S.wishes=S.wishes.filter(x=>x.id!=b.dataset.delete);await cloudSave();renderWishes()});
}
document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>{document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));b.classList.add("active");S.status=b.dataset.status;renderWishes()});$("#search").oninput=renderWishes;
// ---------- Books / Movies library ----------
// Titles/author-director are manual. Only cover/poster lookup is automatic.
// All external searching is proxied through Netlify to avoid browser CORS failures.
const LIBRARY_ENDPOINT = '/.netlify/functions/library-search';
function libraryTypeFromDialog(){return $("#libraryDialog").dataset.type||"books"}
function resetLibraryForm(type){
 const f=$("#libraryForm");f.reset();$("#libraryDialog").dataset.type=type;
 $("#libraryModalLabel").textContent=type==="books"?"BOOK":"MOVIE / DRAMA";
 $("#libraryModalTitle").textContent=type==="books"?"책 추가":"영화 / 드라마 추가";
 $("#libraryStatus").innerHTML=type==="books"?'<option value="to-read">TO READ</option><option value="read">READ</option>':'<option value="to-watch">TO WATCH</option><option value="watched">WATCHED</option>';
 $("#libraryResults").innerHTML="";$("#libraryResults").classList.remove("has-results");$("#libraryCoverChoices").classList.add("hidden");$("#libraryCoverChoices").innerHTML="";$("#libraryFetchMessage").textContent="";f.dataset.selectedImage="";
 $("#libraryKoreanTitle").required=false;$("#libraryForeignTitle").required=false;
}
function cleanText(v){return String(v||"").replace(/\s+/g," ").trim()}
function normalizeTitle(v){return cleanText(v).toLowerCase().replace(/[“”‘’'"`]/g,"").replace(/[\s\-_:·•.,!?()[\]{}\/\\]+/g,"").replace(/[^0-9a-z\uac00-\ud7a3]/g,"")}
function titleScore(title,q){
 const t=normalizeTitle(title),n=normalizeTitle(q);if(!t||!n)return 0;
 if(t===n)return 1200;if(t.includes(n))return 1000-Math.min(300,Math.max(0,t.length-n.length));if(n.includes(t)&&t.length>=2)return 920-Math.min(250,n.length-t.length);
 const grams=v=>new Set([...v].map((_,i)=>v.slice(i,i+2)).filter(x=>x.length===2));const a=grams(t),b=grams(n);let inter=0;for(const x of a)if(b.has(x))inter++;const u=new Set([...a,...b]).size,j=u?inter/u:0;return j>=.28?500+Math.round(j*200):0;
}
function dedupeCovers(arr){const m=new Map();for(const x of arr){if(!x?.image)continue;const k=x.image.split('?')[0];if(!m.has(k)||m.get(k).score<x.score)m.set(k,x)}return [...m.values()].sort((a,b)=>(b.score||0)-(a.score||0)).slice(0,18)}
function proxiedImage(url){return url?`${LIBRARY_ENDPOINT}?type=image&url=${encodeURIComponent(url)}`:""}
async function fetchJson(url){const r=await fetch(url,{cache:"no-store"});let j=null;try{j=await r.json()}catch{}if(!r.ok)throw Error(j?.error||`HTTP ${r.status}`);return j}
async function searchBookCovers(q){
 const j=await fetchJson(`${LIBRARY_ENDPOINT}?type=books&q=${encodeURIComponent(q)}`);
 return (j.items||[]).map(x=>{const i=x.volumeInfo||{},im=i.imageLinks||{};const raw=im.extraLarge||im.large||im.medium||im.thumbnail||im.smallThumbnail||"";return {title:cleanText(i.title),image:proxiedImage(raw),source:"Google Books",score:titleScore(i.title,q)}}).filter(x=>x.image&&x.title&&x.score>=280);
}
async function searchMovieCovers(q){
 const j=await fetchJson(`${LIBRARY_ENDPOINT}?type=movies&q=${encodeURIComponent(q)}`),out=[];
 for(const x of (j.appleKR||[]).concat(j.appleUS||[])){if(x?.kind!=="feature-movie")continue;const raw=x.artworkUrl100||x.artworkUrl60||"";if(raw)out.push({title:cleanText(x.trackName),image:proxiedImage(raw),source:"Apple",score:titleScore(x.trackName,q)});}
 for(const x of (j.tvmaze||[])){const show=x?.show;if(!show?.name)continue;const raw=show.image?.original||show.image?.medium||"";if(raw)out.push({title:cleanText(show.name),image:proxiedImage(raw),source:"TV",score:titleScore(show.name,q)});}
 return out.filter(x=>x.score>=280);
}
async function findLibraryCovers(type,titles){
 const qs=[...new Set(titles.map(cleanText).filter(Boolean))];let raw=[];
 for(const q of qs){try{raw.push(...(type==="books"?await searchBookCovers(q):await searchMovieCovers(q)))}catch(e){console.warn(e)}}
 return dedupeCovers(raw);
}
function renderLibraryResults(results){
 const box=$("#libraryResults");box.classList.add("has-results");
 box.innerHTML=results.length?results.map((r,i)=>`<button type="button" class="library-result cover-only-result" data-cover-index="${i}"><img src="${escapeAttr(r.image)}" loading="lazy" onerror="this.closest('.library-result').style.display='none'"><span><strong>${escapeHtml(r.title)}</strong><em>${escapeHtml(r.source||"")}</em></span></button>`).join(""):'<div class="empty">맞는 표지나 포스터를 찾지 못했어요.</div>';
 box.querySelectorAll("[data-cover-index]").forEach(b=>b.onclick=()=>selectLibraryCover(results[Number(b.dataset.coverIndex)]));box._results=results;
}
function renderCoverChoices(item){
 const box=$("#libraryCoverChoices"),imgs=[...new Set((item||[]).map(x=>x.image).filter(Boolean))];
 if(!imgs.length){box.classList.add("hidden");box.innerHTML="";return}
 box.classList.remove("hidden");box.innerHTML='<span>선택한 표지 / 포스터</span>'+imgs.map((im,i)=>`<button type="button" class="cover-choice ${i===0?"active":""}" data-image="${escapeAttr(im)}"><img src="${escapeAttr(im)}" loading="lazy"></button>`).join("");
 box.querySelectorAll(".cover-choice").forEach(b=>b.onclick=()=>{box.querySelectorAll(".cover-choice").forEach(x=>x.classList.remove("active"));b.classList.add("active");$("#libraryManualImage").value=b.dataset.image;$("#libraryForm").dataset.selectedImage=b.dataset.image});
 $("#libraryManualImage").value=imgs[0];$("#libraryForm").dataset.selectedImage=imgs[0];
}
function selectLibraryCover(item){$("#libraryForm").dataset.selectedImage=item.image||"";$("#libraryManualImage").value=item.image||"";renderCoverChoices([item]);$("#libraryFetchMessage").textContent="표지 / 포스터를 선택했어요."}
async function runLibrarySearch(){
 const type=libraryTypeFromDialog(),titles=[$("#libraryKoreanTitle").value,$("#libraryForeignTitle").value].map(cleanText).filter(Boolean);
 if(!titles.length){$("#libraryFetchMessage").textContent="한국어 제목 또는 외국어 제목을 하나 이상 입력해 주세요.";return}
 const btn=$("#librarySearchBtn");btn.disabled=true;btn.textContent="찾는 중…";$("#libraryFetchMessage").textContent="";$("#libraryResults").innerHTML="";$("#libraryResults").classList.remove("has-results");
 try{const results=await findLibraryCovers(type,titles);renderLibraryResults(results);$("#libraryFetchMessage").textContent=results.length?`${results.length}개의 표지 / 포스터를 찾았어요.`:"표지 / 포스터를 찾지 못했어요. 이미지 링크를 직접 넣어 주세요."}
 catch(e){console.error(e);$("#libraryFetchMessage").textContent=`자동 검색 오류: ${e.message||"알 수 없는 오류"}`}
 finally{btn.disabled=false;btn.textContent="표지 / 포스터 찾기"}
}
function normalizeSavedImage(url){const u=cleanText(url);if(!u)return "assets/flower.jpg";if(u.startsWith(LIBRARY_ENDPOINT))return u;return proxiedImage(u)}
function saveLibraryRecord(type){
 const ko=cleanText($("#libraryKoreanTitle").value),foreign=cleanText($("#libraryForeignTitle").value),creator=cleanText($("#libraryManualCreator").value),rawImage=cleanText($("#libraryManualImage").value)||$("#libraryForm").dataset.selectedImage;
 if(!ko&&!foreign){alert("한국어 제목 또는 외국어 제목을 하나 이상 입력해 주세요.");return null}
 return {id:Date.now(),title:ko||foreign,altTitle:ko&&foreign?foreign:"",titleKo:ko,titleForeign:foreign,creator,image:normalizeSavedImage(rawImage),status:$("#libraryStatus").value,createdAt:Date.now()};
}
openLibraryDialog=function(type){resetLibraryForm(type);const d=$("#libraryDialog");try{d.showModal()}catch{d.setAttribute("open","")}setTimeout(()=>$("#libraryKoreanTitle")?.focus(),60)};
$("#openBook").onclick=()=>openLibraryDialog("books");$("#openMovie").onclick=()=>openLibraryDialog("movies");$("#librarySearchBtn").onclick=runLibrarySearch;
$("#libraryForm").onsubmit=async e=>{e.preventDefault();const type=libraryTypeFromDialog(),rec=saveLibraryRecord(type);if(!rec)return;S[type].unshift(rec);localBackup();renderLibrary(type);$("#libraryDialog").close();try{await cloudSave()}catch(err){console.error(err);updateSync("기기에 저장됨");alert("인터넷 저장은 실패했지만 이 기기에는 저장했어요. 나중에 다시 동기화할 수 있어요.")}};
function librarySearchMatch(item,q){const z=[item.title,item.titleKo,item.titleForeign,item.altTitle,item.creator].filter(Boolean).join(" ").toLowerCase();return z.includes(q)}
function renderLibrary(type){const status=S.libraryStatus[type],q=$(type==="books"?"#bookSearch":"#movieSearch").value.trim().toLowerCase(),arr=S[type].filter(x=>x.status===status&&(!q||librarySearchMatch(x,q))),grid=$(type==="books"?"#bookGrid":"#movieGrid");grid.innerHTML=arr.length?arr.map(x=>{const main=x.titleKo||x.titleForeign||x.title||"",other=x.titleKo&&x.titleForeign?x.titleForeign:"";return `<article class="wish library-card"><img class="wish-img" src="${escapeAttr(x.image||"assets/flower.jpg")}" loading="lazy" onerror="this.src='assets/flower.jpg'"><div class="wish-body"><h3>${escapeHtml(main)}</h3>${other?`<div class="library-alt-title">${escapeHtml(other)}</div>`:""}<div class="library-creator">${escapeHtml(x.creator||"정보 없음")}</div><div class="wish-meta"><span class="badge">${escapeHtml(status.toUpperCase().replace("-"," "))}</span><button class="delete-btn" data-library-delete="${x.id}" data-library-type="${type}">삭제</button></div></div></article>`}).join(""): '<p class="empty">등록된 작품이 없습니다.</p>';grid.querySelectorAll("[data-library-delete]").forEach(b=>b.onclick=async()=>{if(!confirm("이 작품을 삭제할까요?"))return;S[type]=S[type].filter(x=>x.id!=b.dataset.libraryDelete);localBackup();renderLibrary(type);try{await cloudSave()}catch(err){console.error(err)}})}
document.querySelectorAll("[data-library-status]").forEach(b=>b.onclick=()=>{const type=b.dataset.libraryType;document.querySelectorAll(`[data-library-type="${type}"]`).forEach(x=>x.classList.remove("active"));b.classList.add("active");S.libraryStatus[type]=b.dataset.libraryStatus;renderLibrary(type)});
$("#bookSearch").oninput=()=>renderLibrary("books");$("#movieSearch").oninput=()=>renderLibrary("movies");
document.querySelectorAll(".nav").forEach(b=>b.onclick=()=>{document.querySelectorAll(".nav").forEach(x=>x.classList.remove("active"));b.classList.add("active");document.querySelectorAll(".page").forEach(x=>x.classList.remove("active"));$("#"+b.dataset.page).classList.add("active")});
document.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>$("#"+b.dataset.close).close());
$("#loginForm").onsubmit=async e=>{e.preventDefault();try{await signInWithEmailAndPassword(auth,$("#authEmail").value.trim(),$("#authPassword").value);$("#authMessage").textContent=""}catch(err){$("#authMessage").textContent="이메일 또는 비밀번호를 확인해 주세요."}};
$("#signupBtn").onclick=async()=>{try{await createUserWithEmailAndPassword(auth,$("#authEmail").value.trim(),$("#authPassword").value);$("#authMessage").textContent=""}catch(err){$("#authMessage").textContent="회원가입에 실패했어요. 이메일과 비밀번호를 확인해 주세요."}};
$("#logoutBtn").onclick=()=>signOut(auth);
onAuthStateChanged(auth,async user=>{showAuth(user);if(!user){S.ready=false;return}try{await cloudLoad();S.ready=true;renderCal();renderWishes();renderLibrary("books");renderLibrary("movies")}catch(e){console.error(e);alert("온라인 저장소에 연결하지 못했어요. Firebase 설정과 Firestore 규칙을 확인해 주세요.")}});
