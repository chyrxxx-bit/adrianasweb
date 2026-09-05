import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app=initializeApp(firebaseConfig), auth=getAuth(app), db=getFirestore(app);
const S={month:new Date(),selected:new Date(),events:{},wishes:[],status:"wish",ready:false,saving:false};
const $=s=>document.querySelector(s), pad=n=>String(n).padStart(2,"0");
const dateKey=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;

function localBackup(){
  localStorage.setItem("mls-events",JSON.stringify(S.events));
  localStorage.setItem("mls-wishes",JSON.stringify(S.wishes));
}
function loadLocal(){
  try{S.events=JSON.parse(localStorage.getItem("mls-events")||"{}")||{};S.wishes=JSON.parse(localStorage.getItem("mls-wishes")||"[]")||[]}
  catch{S.events={};S.wishes=[]}
}
async function cloudSave(){
  if(!auth.currentUser)return;
  S.saving=true; updateSync("저장 중…");
  await setDoc(doc(db,"users",auth.currentUser.uid),{events:S.events,wishes:S.wishes,updatedAt:Date.now()});
  localBackup(); S.saving=false; updateSync("☁︎ 저장됨");
}
async function cloudLoad(){
  const snap=await getDoc(doc(db,"users",auth.currentUser.uid));
  if(snap.exists()){
    const d=snap.data(); S.events=d.events||{}; S.wishes=d.wishes||[];
  }else{
    loadLocal(); await cloudSave(); return;
  }
  localBackup();
}
function updateSync(t){const el=$("#syncStatus");if(el)el.textContent=t}
function showAuth(user){
  $("#authOverlay").classList.toggle("hidden",!!user);
  $("#appShell").classList.toggle("locked",!user);
  if(user){$("#accountEmail").textContent=user.email||"내 계정";updateSync("☁︎ 연결됨")}
}

function renderCal(){
 const d=S.month,y=d.getFullYear(),m=d.getMonth(),first=new Date(y,m,1),start=first.getDay(),last=new Date(y,m+1,0).getDate(),prev=new Date(y,m,0).getDate();
 $("#monthTitle").textContent=`${y}년 ${m+1}월`;let g=$("#grid");g.innerHTML="";
 for(let i=0;i<42;i++){let n=i-start+1,cd=n<1?new Date(y,m-1,prev+n):n>last?new Date(y,m+1,n-last):new Date(y,m,n);
 let x=document.createElement("div");x.className="day"+(cd.getMonth()!=m?" muted ":"")+(dateKey(cd)==dateKey(new Date())?" today":"")+(dateKey(cd)==dateKey(S.selected)?" selected":"");
 x.innerHTML=`<span>${cd.getDate()}</span>`+(S.events[dateKey(cd)]?.length?'<span class="event-dot"></span>':'');x.onclick=()=>{S.selected=new Date(cd);renderCal()};g.appendChild(x)}
 $("#selectedDate").textContent=S.selected.toLocaleDateString("ko-KR",{month:"long",day:"numeric",weekday:"short"});
 let es=S.events[dateKey(S.selected)]||[],box=$("#events");box.className="event-list";
 box.innerHTML=es.length?es.map((e,i)=>`<div class="event" data-i="${i}"><strong>${e.title}</strong><small>${e.time||"시간 없음"} · ${e.tag}</small></div>`).join(""): '<div style="color:#a38f84;font-size:13px;padding:25px 4px">아직 일정이 없어요.<br>작은 계획 하나를 남겨볼까요? ♡</div>';
 box.querySelectorAll(".event").forEach(el=>el.onclick=async()=>{if(confirm("이 일정을 삭제할까요?")){es.splice(+el.dataset.i,1);await cloudSave();renderCal()}});
}
$("#prev").onclick=()=>{S.month.setMonth(S.month.getMonth()-1);renderCal()};$("#next").onclick=()=>{S.month.setMonth(S.month.getMonth()+1);renderCal()};
function parseKorean(text){
 let base=new Date(S.selected),now=new Date();
 if(/오늘/.test(text))base=new Date(now); else if(/내일/.test(text)){base=new Date(now);base.setDate(base.getDate()+1)}
 else {let mm=text.match(/(\d{1,2})월\s*(\d{1,2})일/);if(mm)base=new Date(base.getFullYear(),+mm[1]-1,+mm[2]);let wd={"일":0,"월":1,"화":2,"수":3,"목":4,"금":5,"토":6},wm=text.match(/(일|월|화|수|목|금|토)요일?/);if(wm){let diff=(wd[wm[1]]-base.getDay()+7)%7;if(diff===0)diff=7;base.setDate(base.getDate()+diff)}}
 let tm=text.match(/(오전|오후)?\s*(\d{1,2})(?:[:시](\d{1,2}))?/),hour=tm?+tm[2]:9,min=tm&&tm[3]?+tm[3]:0;if(tm&&tm[1]==="오후"&&hour<12)hour+=12;if(tm&&tm[1]==="오전"&&hour===12)hour=0;
 let cleaned=text.replace(/오늘|내일|\d{1,2}월\s*\d{1,2}일|(?:오전|오후)?\s*\d{1,2}(?::\d{1,2}|시)?|[일월화수목금토]요일?/g,"").trim().replace(/^[,\s]+|[,\s]+$/g,"");return{date:base,time:`${pad(hour)}:${pad(min)}`,title:cleaned||"새 일정",tag:"개인"};
}
$("#openEvent").onclick=$("#openEvent2").onclick=()=>{$("#quickEvent").value="";$("#eventDialog").showModal()};
$("#eventForm").onsubmit=async e=>{e.preventDefault();let p=parseKorean($("#quickEvent").value),k=dateKey(p.date);(S.events[k]??=[]).push(p);S.selected=p.date;S.month=new Date(p.date);await cloudSave();$("#eventDialog").close();renderCal()};

async function fetchMeta(url){
 const endpoint="https://api.microlink.io/?url="+encodeURIComponent(url)+"&data.title.selector=title&data.image.selector=meta[property='og:image']&data.price.selector=[class*='price'],[id*='price'],meta[property='product:price:amount']";
 const r=await fetch(endpoint);if(!r.ok)throw Error("fetch failed");const j=await r.json(),d=j.data||{};let title=d.title?.value||d.title||url,image=d.image?.url||d.image?.value||"",price=d.price?.value||d.price||"";return{title,image,price};
}
$("#openWish").onclick=()=>{$("#wishForm").reset();$("#preview").classList.add("hidden");$("#wishDialog").showModal()};
$("#previewBtn").onclick=async()=>{let url=$("#wishUrl").value.trim();if(!url)return;$("#previewBtn").textContent="불러오는 중…";$("#previewBtn").disabled=true;try{let d=await fetchMeta(url);$("#preview").classList.remove("hidden");$("#previewImg").src=d.image||"assets/flower.jpg";$("#previewTitle").textContent=d.title||"상품명 확인 필요";$("#previewPrice").textContent=d.price||"가격은 자동 인식되지 않았어요";$("#preview").dataset.data=JSON.stringify(d)}catch(e){alert("이 쇼핑몰은 자동 정보 가져오기를 허용하지 않는 것 같아. 링크는 저장할 수 있어!")}finally{$("#previewBtn").textContent="자동으로 정보 가져오기";$("#previewBtn").disabled=false}};
$("#wishForm").onsubmit=async e=>{e.preventDefault();let d={};try{d=JSON.parse($("#preview").dataset.data||"{}")}catch{}let w={id:Date.now(),url:$("#wishUrl").value,title:d.title||"상품",image:d.image||"assets/flower.jpg",price:d.price||"가격 확인 필요",status:$("#wishStatus").value};S.wishes.unshift(w);await cloudSave();$("#wishDialog").close();renderWishes()};
function renderWishes(){let q=$("#search").value.toLowerCase(),arr=S.wishes.filter(w=>w.status===S.status&&w.title.toLowerCase().includes(q));$("#wishGrid").innerHTML=arr.length?arr.map(w=>`<article class="wish"><img class="wish-img" src="${w.image}" onerror="this.src='assets/flower.jpg'"><div class="wish-body"><h3>${w.title}</h3><div class="price">${w.price}</div><div class="wish-meta"><span class="badge">${w.status}</span><button class="buy-btn" data-id="${w.id}">${w.status==="wish"?"bought로 옮기기":"wish로 옮기기"}</button></div></div></article>`).join(""): '<p style="color:#9a887f">아직 아무것도 없어요 ♡</p>';document.querySelectorAll(".buy-btn").forEach(b=>b.onclick=async()=>{let w=S.wishes.find(x=>x.id==b.dataset.id);w.status=w.status==="wish"?"bought":"wish";await cloudSave();renderWishes()})}
document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>{document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));b.classList.add("active");S.status=b.dataset.status;renderWishes()});$("#search").oninput=renderWishes;
document.querySelectorAll(".nav").forEach(b=>b.onclick=()=>{document.querySelectorAll(".nav").forEach(x=>x.classList.remove("active"));b.classList.add("active");document.querySelectorAll(".page").forEach(x=>x.classList.remove("active"));$("#"+b.dataset.page).classList.add("active")});document.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>$("#"+b.dataset.close).close());

$("#loginForm").onsubmit=async e=>{e.preventDefault();try{await signInWithEmailAndPassword(auth,$("#authEmail").value.trim(),$("#authPassword").value);$("#authMessage").textContent=""}catch(err){$("#authMessage").textContent="이메일 또는 비밀번호를 확인해줘."}};
$("#signupBtn").onclick=async()=>{try{await createUserWithEmailAndPassword(auth,$("#authEmail").value.trim(),$("#authPassword").value);$("#authMessage").textContent=""}catch(err){$("#authMessage").textContent="회원가입에 실패했어. 이메일 형식과 비밀번호를 확인해줘."}};
$("#logoutBtn").onclick=()=>signOut(auth);

onAuthStateChanged(auth,async user=>{showAuth(user);if(!user){S.ready=false;return}try{await cloudLoad();S.ready=true;renderCal();renderWishes()}catch(e){console.error(e);alert("온라인 저장소에 연결하지 못했어. Firebase 설정과 Firestore 규칙을 확인해줘.")}});
