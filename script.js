import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app=initializeApp(firebaseConfig),auth=getAuth(app),db=getFirestore(app);
const S={month:new Date(),selected:new Date(),events:{},wishes:[],status:"wish",ready:false,saving:false};
const $=s=>document.querySelector(s),pad=n=>String(n).padStart(2,"0");
const dateKey=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const cloneDate=d=>new Date(d.getFullYear(),d.getMonth(),d.getDate());
const todayKey=()=>dateKey(new Date());

function localBackup(){localStorage.setItem("planner-events",JSON.stringify(S.events));localStorage.setItem("planner-wishes",JSON.stringify(S.wishes))}
function loadLocal(){try{S.events=JSON.parse(localStorage.getItem("planner-events")||"{}")||{};S.wishes=JSON.parse(localStorage.getItem("planner-wishes")||"[]")||[]}catch{S.events={};S.wishes=[]}}
async function cloudSave(){if(!auth.currentUser)return;S.saving=true;updateSync("저장 중");try{await setDoc(doc(db,"users",auth.currentUser.uid),{events:S.events,wishes:S.wishes,updatedAt:Date.now()});localBackup();updateSync("저장됨")}finally{S.saving=false}}
async function cloudLoad(){const snap=await getDoc(doc(db,"users",auth.currentUser.uid));if(snap.exists()){const d=snap.data();S.events=d.events||{};S.wishes=d.wishes||[]}else{loadLocal();await cloudSave();return}const changed=await normalizeStoredWishPrices();localBackup();if(changed)await cloudSave()}
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
function colorForEvent(e){
 const palette=["#d8c2bf","#c9d2c8","#d8ccb9","#cbc7d4","#d7c8bc","#c5d1cf"];
 const id=eventIdentity(e); let n=0; for(let i=0;i<id.length;i++) n=(n+id.charCodeAt(i)*(i+1))%palette.length; return palette[n];
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
 box.innerHTML=es.length?es.map((e,i)=>`<div class="event" data-i="${i}"><strong>${escapeHtml(e.title)}</strong><small>${e.time||"시간 없음"}${e.startDate&&e.endDate&&e.startDate!==e.endDate?` · ${formatShort(e.startDate)}–${formatShort(e.endDate)}`:""}</small></div>`).join(""): '<div class="empty">일정이 없습니다.</div>';
 box.querySelectorAll(".event").forEach(el=>el.onclick=async()=>{if(!confirm("이 일정을 삭제할까요?"))return;const idx=+el.dataset.i,ev=es[idx];if(ev?.seriesId){for(const k of Object.keys(S.events)){S.events[k]=(S.events[k]||[]).filter(x=>x.seriesId!==ev.seriesId);if(!S.events[k].length)delete S.events[k]}}else{es.splice(idx,1);if(!es.length)delete S.events[dateKey(S.selected)]}await cloudSave();renderCal()});
}
$("#prev").onclick=()=>{S.month.setMonth(S.month.getMonth()-1);renderCal()};
$("#next").onclick=()=>{S.month.setMonth(S.month.getMonth()+1);renderCal()};

function openEventDialog(){
 const selected=dateKey(S.selected||new Date());$("#eventDate").value=selected;$("#eventEndDate").value=selected;$("#eventTime").value="";$("#eventTitle").value="";$("#eventDialog").showModal();setTimeout(()=>$("#eventTitle").focus(),60);
}
$("#openEvent").onclick=openEventDialog;$("#openEvent2").onclick=openEventDialog;
$("#eventDate").onchange=()=>{if(!$("#eventEndDate").value||$("#eventEndDate").value===$("#eventDate").value)$("#eventEndDate").value=$("#eventDate").value};
$("#eventForm").onsubmit=async e=>{e.preventDefault();let sd=$("#eventDate").value,ed=$("#eventEndDate").value||sd;if(ed<sd){alert("종료일은 시작일 이후로 선택해 주세요.");return}const p={startDate:sd,endDate:ed,time:$("#eventTime").value||"",title:$("#eventTitle").value.trim(),tag:"개인"},seriesId=Date.now().toString();let cur=new Date(sd+"T00:00:00"),end=new Date(ed+"T00:00:00");while(cur<=end){const k=dateKey(cur);(S.events[k]??=[]).push({...p,seriesId});cur.setDate(cur.getDate()+1)}S.selected=new Date(sd+"T00:00:00");S.month=new Date(sd+"T00:00:00");await cloudSave();$("#eventDialog").close();renderCal()};

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
function extractPriceText(v){
 const raw=getNestedValue(v);
 return String(raw||"").replace(/\s+/g," ").trim();
}
function detectCurrency(text){
 const raw=String(text||"").trim(), upper=raw.toUpperCase();
 const keys=Object.keys(currencyMap).sort((a,b)=>b.length-a.length);
 for(const k of keys){
  if(raw.includes(k)||upper.includes(k.toUpperCase())) return currencyMap[k];
 }
 return null;
}
function extractAmount(text){
 const raw=String(text||"").trim();
 // Accept 30달러, $30, USD 30, 30 USD, 30.50달러, 30,000원 etc.
 const matches=raw.replace(/,/g,"").match(/-?\d+(?:\.\d+)?/g);
 if(!matches?.length)return null;
 // Product metadata can contain unrelated numbers; prefer the number closest to a currency marker.
 const currency=detectCurrency(raw);
 if(currency){
  const markerRegex=/(?:US\$|USD|\$|달러|EUR|€|유로|GBP|£|파운드|JPY|¥|￥|엔|CNY|RMB|AUD|A\$|CAD|C\$|CHF|HKD|HK\$|SGD|S\$|TWD|NT\$|THB|฿|INR|₹|KRW|₩|원)/i;
  const marker=raw.match(markerRegex);
  if(marker){
   const before=raw.slice(0,marker.index||0).match(/-?\d+(?:\.\d+)?/g);
   const after=raw.slice((marker.index||0)+marker[0].length).match(/-?\d+(?:\.\d+)?/g);
   if(after?.length)return Number(after[0]);
   if(before?.length)return Number(before[before.length-1]);
  }
 }
 return Number(matches[matches.length-1]);
}
async function convertToKRW(text){
 const raw=extractPriceText(text);
 if(!raw)return "";
 const currency=detectCurrency(raw);
 if(!currency){
  const amount=extractAmount(raw);
  if(amount!=null && /^[\d\s,.]+(?:원)?$/.test(raw))return `${Math.round(amount).toLocaleString("ko-KR")}원`;
  return raw.length>80?"가격 확인 필요":raw;
 }
 const amount=extractAmount(raw);
 if(amount==null || !Number.isFinite(amount))return "가격 확인 필요";
 if(currency==="KRW")return `${Math.round(amount).toLocaleString("ko-KR")}원`;
 try{
  const r=await fetch(`https://api.frankfurter.app/latest?from=${encodeURIComponent(currency)}&to=KRW`);
  if(!r.ok)throw Error("rate failed");
  const j=await r.json(),rate=Number(j.rates?.KRW);
  if(!Number.isFinite(rate))throw Error("no KRW rate");
  return `${Math.round(amount*rate).toLocaleString("ko-KR")}원`;
 }catch{return "환율 확인 필요"}
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
  const normalized=await convertToKRW(w.price);
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
 const w={id:Date.now(),url,title,image,price,status:$("#wishStatus").value};
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
document.querySelectorAll(".nav").forEach(b=>b.onclick=()=>{document.querySelectorAll(".nav").forEach(x=>x.classList.remove("active"));b.classList.add("active");document.querySelectorAll(".page").forEach(x=>x.classList.remove("active"));$("#"+b.dataset.page).classList.add("active")});
document.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>$("#"+b.dataset.close).close());
$("#loginForm").onsubmit=async e=>{e.preventDefault();try{await signInWithEmailAndPassword(auth,$("#authEmail").value.trim(),$("#authPassword").value);$("#authMessage").textContent=""}catch(err){$("#authMessage").textContent="이메일 또는 비밀번호를 확인해 주세요."}};
$("#signupBtn").onclick=async()=>{try{await createUserWithEmailAndPassword(auth,$("#authEmail").value.trim(),$("#authPassword").value);$("#authMessage").textContent=""}catch(err){$("#authMessage").textContent="회원가입에 실패했어요. 이메일과 비밀번호를 확인해 주세요."}};
$("#logoutBtn").onclick=()=>signOut(auth);
onAuthStateChanged(auth,async user=>{showAuth(user);if(!user){S.ready=false;return}try{await cloudLoad();S.ready=true;renderCal();renderWishes()}catch(e){console.error(e);alert("온라인 저장소에 연결하지 못했어요. Firebase 설정과 Firestore 규칙을 확인해 주세요.")}});
