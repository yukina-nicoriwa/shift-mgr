import{useState,useRef,useEffect}from"react";

// Supabase設定（Vercel環境変数から取得）
const _env=(k)=>{try{return import.meta.env[k]||"";}catch(e){return "";}};
const SB_URL=_env("VITE_SUPABASE_URL");
const SB_KEY=_env("VITE_SUPABASE_ANON_KEY");
const SB_ON=!!(SB_URL&&SB_KEY);

// クリップボードコピー（どの環境でも動く）
const copyText=(text)=>{
  if(navigator.clipboard&&window.isSecureContext){
    navigator.clipboard.writeText(text).catch(()=>_fallbackCopy(text));
  }else{_fallbackCopy(text);}
};
const _fallbackCopy=(text)=>{
  const el=document.createElement("textarea");
  el.value=text;
  el.style.cssText="position:fixed;left:-9999px;top:-9999px";
  document.body.appendChild(el);
  el.focus();el.select();
  try{document.execCommand("copy");}catch(e){}
  document.body.removeChild(el);
};

// Supabase REST API
const _sbFetch=async(path,method,body)=>{
  if(!SB_ON)return null;
  const opts={method:method||"GET",headers:{"apikey":SB_KEY,"Authorization":"Bearer "+SB_KEY,"Content-Type":"application/json","Prefer":"resolution=merge-duplicates,return=minimal"}};
  if(body)opts.body=JSON.stringify(body);
  const r=await fetch(SB_URL+"/rest/v1/"+path,opts);
  if(!r.ok){console.error("Supabase error:",r.status,await r.text());return null;}
  const t=await r.text();return t?JSON.parse(t):null;
};
const sbSelect=async(table)=>_sbFetch(table+"?select=*","GET");
const sbUpsert=async(table,rows)=>{if(!rows||!rows.length)return;return _sbFetch(table,"POST",rows);};
const sbDelete=async(table,filter)=>_sbFetch(table+"?"+filter,"DELETE");


// ══ 重要仕様（削除・変更禁止） ══════════════════════
// ① 確定シフト：未公開月でも確定データがあれば一般ユーザーに表示
// ② シフトチェンジ取り消し：名前選択モーダルで本人確認（投稿者以外エラー）
// ③ シフトチェンジ応募者名：管理者のみ表示。一般には「N名応募中」のみ
// ④ 不足通知・月間通知：管理者のシフト調整画面のみ
// ⑤ 各画面は独立した月stateを持つ（互いに干渉しない）
// ⑥ P（パートタイム）は不足人数カウントに含めない
// ⑦ 確定チップクリック→点線（希望）に戻す（shiftsから削除、reqsは残る）
// ⑧ シフト調整のメモ欄はインライン入力
// ⑨ 時間入力はTimeSelectコンポーネント（10分刻み）
// ⑩ PWは1111
// ⑪ チェンジ応募時のSlackプレビューは閉じるのみ（送信ボタンなし）
// ════════════════════════════════════════════════
const PW="1111";
const MB=[
  {id:"2000003",name:"形山 葉汰",tier:1},{id:"2000007",name:"今村 圭吾",tier:1},
  {id:"2000009",name:"堤 菜々美",tier:2},{id:"2000019",name:"安達 福",tier:2},
  {id:"2000021",name:"川勝 涼華",tier:2},{id:"2000025",name:"足立 郁香",tier:2},
  {id:"2000028",name:"下田 由奈",tier:3},{id:"2000029",name:"荒井 茉有",tier:3},
  {id:"2000031",name:"川原 宏貴",tier:3},{id:"2000032",name:"山本 温",tier:1},
  {id:"2000033",name:"野崎 杏菜",tier:2},{id:"2000034",name:"髙原 早稀",tier:2},
  {id:"2000036",name:"杉本 颯大",tier:3},{id:"2000037",name:"田鶴 耀",tier:3},
  {id:"2000039",name:"片山 陽葵",tier:2},{id:"2000040",name:"鈴木 海鯉",tier:2},
  {id:"2000042",name:"久保 亜葵",tier:4},{id:"2000043",name:"坂本 裕介",tier:4},
  {id:"2000044",name:"馬渕 琳平",tier:3},{id:"2000045",name:"井上 裕大",tier:2},
  {id:"2000046",name:"亀原 颯一郎",tier:1},{id:"2000047",name:"植村 彩礼",tier:3},
  {id:"2000048",name:"岩本 龍次郎",tier:2},{id:"2000050",name:"山村 唯",tier:3},
  {id:"2000051",name:"三野 玄太",tier:4},{id:"2000052",name:"千葉 由結",tier:2},
  {id:"2000053",name:"太田 莉子",tier:3},{id:"2000054",name:"古川 智子",tier:2},
  {id:"2000055",name:"渡邉 心羽",tier:3},{id:"2000056",name:"白井 宏季",tier:4},
];
// 勤務パターン初期値（設定画面で編集・追加・削除可能）
const DEFAULT_PT=[
  {key:"A",d:"通常",      s:"10:30",e:"19:30",b:60,q:3, bg:"#fffbeb",bd:"#fcd34d",ic:"#d97706",cb:"#fef3c7",ct:"#92400e"},
  {key:"E",d:"ホーム前日",s:"09:00",e:"20:00",b:60,q:7, bg:"#f0fdf4",bd:"#86efac",ic:"#16a34a",cb:"#dcfce7",ct:"#15803d"},
  {key:"G",d:"ホーム戦",  s:"08:00",e:"19:00",b:60,q:12,bg:"#f0f9ff",bd:"#7dd3fc",ic:"#0284c7",cb:"#e0f2fe",ct:"#0369a1"},
  {key:"H",d:"ナイター",  s:"10:30",e:"22:00",b:60,q:12,bg:"#faf5ff",bd:"#c4b5fd",ic:"#7c3aed",cb:"#ede9fe",ct:"#6d28d9"},
  {key:"P",d:"パートタイム",s:"10:30",e:"15:00",b:60,q:1,bg:"#fff1f2",bd:"#fda4af",ic:"#e11d48",cb:"#ffe4e6",ct:"#9f1239"},
];
// 色プリセット
const COLOR_PRESETS=[
  {bg:"#fffbeb",bd:"#fcd34d",ic:"#d97706",cb:"#fef3c7",ct:"#92400e",label:"黄"},
  {bg:"#f0fdf4",bd:"#86efac",ic:"#16a34a",cb:"#dcfce7",ct:"#15803d",label:"緑"},
  {bg:"#f0f9ff",bd:"#7dd3fc",ic:"#0284c7",cb:"#e0f2fe",ct:"#0369a1",label:"青"},
  {bg:"#faf5ff",bd:"#c4b5fd",ic:"#7c3aed",cb:"#ede9fe",ct:"#6d28d9",label:"紫"},
  {bg:"#fff1f2",bd:"#fda4af",ic:"#e11d48",cb:"#ffe4e6",ct:"#9f1239",label:"赤"},
  {bg:"#f0fdf4",bd:"#6ee7b7",ic:"#059669",cb:"#d1fae5",ct:"#065f46",label:"エメラルド"},
  {bg:"#fff7ed",bd:"#fdba74",ic:"#ea580c",cb:"#ffedd5",ct:"#9a3412",label:"オレンジ"},
  {bg:"#f8fafc",bd:"#94a3b8",ic:"#475569",cb:"#f1f5f9",ct:"#1e293b",label:"グレー"},
];
const SHORT={B:{s:"10:30",e:"15:00"},C:{s:"10:30",e:"16:30"},D:{s:"14:30",e:"17:30"}};
const JD=["日","月","火","水","木","金","土"];
const dim=(y,m)=>new Date(y,m,0).getDate();
const fdt=(y,m,d)=>`${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
const toYM=(y,m)=>`${y}-${String(m).padStart(2,"0")}`;
const ini=n=>n.replace(/\s/g,"").slice(0,2);
const avc=id=>["#f59e0b","#3b82f6","#10b981","#ec4899","#8b5cf6","#06b6d4","#84cc16","#f97316"][parseInt(id)%8];
const todayStr=()=>{const t=new Date();return fdt(t.getFullYear(),t.getMonth()+1,t.getDate());};
const getDP=(date,dp,pats)=>{const s=dp[date];if(s==="")return null;if(s)return s;return new Date(date+"T00:00:00").getDay()===3?null:"A";};
const navM=(dir,month,year,setMonth,setYear)=>{
  if(dir<0){if(month===1){setYear(y=>y-1);setMonth(12);}else setMonth(m=>m-1);}
  else{if(month===12){setYear(y=>y+1);setMonth(1);}else setMonth(m=>m+1);}
};
const TIME_OPTS=[];
for(let h=6;h<24;h++)for(let m=0;m<60;m+=10)TIME_OPTS.push(`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`);
const BREAK_OPTS=["00:00","00:30","01:00","01:30","02:00"];
function TimeSelect({value,onChange,style}){
  return(<select value={value||""} onChange={e=>onChange(e.target.value)}
    style={Object.assign({border:"1px solid #e2e8f0",borderRadius:6,padding:"3px 4px",fontSize:12,fontFamily:"inherit",outline:"none",background:"#fff"},style)}>
    <option value="">--:--</option>
    {TIME_OPTS.map(t=><option key={t} value={t}>{t}</option>)}
  </select>);
}
const ST={};
const ld=(k,fb)=>{if(ST[k]!==undefined)return ST[k];ST[k]=JSON.parse(JSON.stringify(fb));return ST[k];};
const sv=(k,v)=>{ST[k]=v;};
const callAI=async(prompt,max)=>{
  const r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:max||400,messages:[{role:"user",content:prompt}]})});
  const d=await r.json();
  const blk=d.content&&d.content.find(b=>b.type==="text");
  return blk?blk.text:"";
};
// Slackプレビューコンポーネント
// showSend=true の画面のみ「送信」ボタンを表示
function SlkPreview({msg,setMsg,dest,loading,onClose,showSend}){
  if(!loading&&!msg)return null;
  const copy=()=>{copyText(msg||"")};
  return(<div className="card" style={{marginBottom:10,borderColor:"#bfdbfe"}}>
    <div style={{fontSize:11,color:"#64748b",marginBottom:4}}>💬 {dest}</div>
    {loading
      ?<div style={{color:"#94a3b8",fontSize:11,display:"flex",gap:5,alignItems:"center"}}><span className="spin"/>生成中…</div>
      :<><div className="slk">
          <textarea value={msg||""} onChange={e=>setMsg(e.target.value)}
            style={{width:"100%",minHeight:80,background:"transparent",border:"none",outline:"none",color:"#d1d2d3",fontSize:11,fontFamily:"inherit",lineHeight:1.7,resize:"vertical"}}/>
        </div>
        <div style={{display:"flex",justifyContent:"flex-end",gap:6,marginTop:8}}>
          {onClose&&<button className="btn bg sm" onClick={onClose}>閉じる</button>}
          {showSend&&<button className="btn bp sm" onClick={copy}>送信</button>}
        </div></>}
  </div>);
}
// デモデータ生成
const DEMO=(()=>{
  const now=new Date(),DY=now.getFullYear(),DM=now.getMonth()+1;
  const nextM=DM===12?1:DM+1,nextY=DM===12?DY+1:DY;
  const pad=n=>String(n).padStart(2,"0");
  const PI={A:{s:"10:30",e:"19:30"},E:{s:"09:00",e:"20:00"},G:{s:"08:00",e:"19:00"},H:{s:"10:30",e:"22:00"}};
  const dp={},dm={},sh={},rqs=[];let rid=1000;
  const days=new Date(DY,DM,0).getDate();
  for(let d=1;d<=days;d++){
    const date=`${DY}-${pad(DM)}-${pad(d)}`,wd=new Date(date+"T00:00:00").getDay();
    if(wd===3){dp[date]="";continue;}
    const pat=wd===6?"G":wd===5?"E":wd===0?"H":"A";
    dp[date]=pat;
    if(pat==="G")dm[date]="HOMEゲーム 19:00KO";
    if(pat==="H")dm[date]="HOMEゲーム ナイター";
    if(pat==="E")dm[date]="HOMEゲーム前日";
    const need=pat==="G"||pat==="H"?12:pat==="E"?7:4;
    MB.map((mb,i)=>({mb,sort:(i*13+d*7)%30})).sort((a,b)=>a.sort-b.sort).map(x=>x.mb).slice(0,need).forEach(mb=>{
      sh[`${mb.id}_${date}`]={pattern:pat,st:PI[pat].s,en:PI[pat].e,b:60};
      rqs.push({id:rid++,mbId:mb.id,mbName:mb.name,date,pat,st:PI[pat].s,en:PI[pat].e,note:"",at:now.toISOString()});
    });
    ["2000009","2000025"].forEach(mbId=>{
      const mbName=(MB.find(mb=>mb.id===mbId)||{name:""}).name;
      sh[`${mbId}_${date}`]={pattern:"P",st:"10:30",en:"15:00",b:60};
      rqs.push({id:rid++,mbId,mbName,date,pat:"P",st:"10:30",en:"15:00",note:"",at:now.toISOString()});
    });
  }
  const nd=new Date(nextY,nextM,0).getDate();
  for(let d=1;d<=nd;d++){
    const date=`${nextY}-${pad(nextM)}-${pad(d)}`,wd=new Date(date+"T00:00:00").getDay();
    if(wd===3){dp[date]="";continue;}
    const pat=wd===6?"G":wd===5?"E":wd===0?"H":"A";
    dp[date]=pat;if(pat==="G")dm[date]="HOMEゲーム";
  }
  [{d:2,mbId:"2000003",mbName:"形山 葉汰"},{d:2,mbId:"2000007",mbName:"今村 圭吾"},
   {d:3,mbId:"2000032",mbName:"山本 温"},{d:5,mbId:"2000019",mbName:"安達 福"},
   {d:5,mbId:"2000021",mbName:"川勝 涼華"},{d:7,mbId:"2000045",mbName:"井上 裕大"},
   {d:8,mbId:"2000009",mbName:"堤 菜々美",isPat:"P"},
   {d:9,mbId:"2000028",mbName:"下田 由奈"},
   {d:3,mbId:"2000003",mbName:"形山 葉汰",isShort:true,st:"13:00",en:"18:00"},
  ].forEach(({d,mbId,mbName,isPat,isShort,st,en})=>{
    const date=`${nextY}-${pad(nextM)}-${pad(d)}`;
    if(new Date(date+"T00:00:00").getDay()===3)return;
    const pat=dp[date];if(!pat)return;
    const up=isPat||pat,p=PI[up]||{s:"10:30",e:"15:00"};
    rqs.push({id:rid++,mbId,mbName,date,pat:isShort?"CUSTOM":up,st:isShort?st:p.s,en:isShort?en:p.e,note:"",at:now.toISOString()});
  });
  const ch=[
    {id:9001,postId:"2000028",postName:"下田 由奈",date:`${DY}-${pad(DM)}-${pad(8)}`,shift:"A（10:30〜19:30）",reason:"急用ができてしまいました",urg:false,status:"open",applicants:[],at:now.toISOString()},
    {id:9002,postId:"2000036",postName:"杉本 颯大",date:`${DY}-${pad(DM)}-${pad(12)}`,shift:"G（08:00〜19:00）",reason:"",urg:true,status:"open",applicants:[{id:"2000032",name:"山本 温"}],at:now.toISOString()},
  ];
  return{dp,dm,sh,rqs,ch,pub:[toYM(DY,DM)]};
})();
// デフォルト通知リスト（通知設定で追加・削除・並び替え可能）
const DEFAULT_NOTIFS=[
  {id:1,title:"📢 月間シフト募集",day:15,auto:false,tmpl:`お疲れ様です！\n毎月{{notifDay}}日ごろに{{nextMonth}}月のシフトを募集させていただきます。\n{{nextMonth}}月分のシフト希望を{{deadline}}までにアプリから入力していただけますと幸いです。\nよろしくお願いいたします！`},
  {id:2,title:"🔄 シフト更新通知",day:0,auto:false,tmpl:`お疲れ様です。\nシフトを更新しました。ご確認ください🙏`},
];
const CSS=`@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700;900&family=IBM+Plex+Mono:wght@700&display=swap');
*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Noto Sans JP',sans-serif;background:#f8fafc;color:#1e293b;min-height:100vh}
.app{display:flex;flex-direction:column;min-height:100vh}
.hdr{background:#0f172a;padding:0 14px;display:flex;align-items:center;gap:8px;height:50px;position:sticky;top:0;z-index:200}
.logo{font-size:13px;font-weight:900;letter-spacing:.1em;color:#60a5fa;flex-shrink:0}.logo em{color:#334155;font-style:normal}
.nav{display:flex;gap:1px;flex:1}
.nb{padding:5px 12px;border-radius:5px;border:none;background:transparent;color:#64748b;cursor:pointer;font-size:12px;font-family:inherit;font-weight:500;white-space:nowrap}
.nb:hover{background:#1e293b;color:#e2e8f0}.nb.on{background:#3b82f6;color:#fff}
.pg{flex:1;padding:14px;max-width:1440px;margin:0 auto;width:100%}
.card{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:14px;box-shadow:0 1px 4px rgba(0,0,0,.06)}
.btn{padding:6px 12px;border-radius:7px;border:none;cursor:pointer;font-size:11px;font-family:inherit;font-weight:600;display:inline-flex;align-items:center;gap:4px;line-height:1;white-space:nowrap}
.bp{background:#3b82f6;color:#fff}.bg{background:#fff;color:#475569;border:1px solid #e2e8f0}.by{background:#f59e0b;color:#fff}.bgs{background:#22c55e;color:#fff}.brd{background:#ef4444;color:#fff}
.sm{padding:4px 9px;font-size:11px}.xs{padding:2px 6px;font-size:10px}.btn:disabled{opacity:.35;cursor:not-allowed}
.inp{background:#fff;border:1px solid #e2e8f0;border-radius:6px;padding:7px 10px;color:#1e293b;font-size:12px;font-family:inherit;width:100%;outline:none}.inp:focus{border-color:#3b82f6}
.lb{font-size:10px;color:#64748b;margin-bottom:4px;display:block;font-weight:700;text-transform:uppercase}.fld{margin-bottom:11px}
.bdg{padding:2px 7px;border-radius:20px;font-size:10px;font-weight:700;display:inline-block}
.ov{position:fixed;inset:0;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;z-index:1000;backdrop-filter:blur(5px);padding:10px}
.modal{background:#fff;border-radius:14px;padding:20px;width:100%;max-width:480px;max-height:92vh;overflow-y:auto;box-shadow:0 24px 64px rgba(0,0,0,.18)}
.mt{font-size:14px;font-weight:800;margin-bottom:14px}
.mf{display:flex;gap:7px;justify-content:flex-end;margin-top:14px;padding-top:12px;border-top:1px solid #f1f5f9}
.slk{background:#1a1d21;border-radius:8px;padding:12px;margin-top:8px}
.toast{position:fixed;bottom:14px;right:14px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:9px 13px;font-size:12px;box-shadow:0 4px 18px rgba(0,0,0,.1);z-index:9999;animation:sup .18s ease}
@keyframes sup{from{transform:translateY(10px);opacity:0}to{transform:translateY(0);opacity:1}}
.toast.ok{border-left:3px solid #22c55e}.toast.er{border-left:3px solid #ef4444}.toast.in{border-left:3px solid #3b82f6}
.av{display:inline-flex;align-items:center;justify-content:center;border-radius:50%;font-weight:700;flex-shrink:0;color:#fff}
.spin{display:inline-block;width:11px;height:11px;border:2px solid #3b82f6;border-top-color:transparent;border-radius:50%;animation:rot .7s linear infinite}@keyframes rot{to{transform:rotate(360deg)}}
.cal-hrow{display:grid;grid-template-columns:repeat(7,1fr);background:#f8fafc;border-bottom:1px solid #f1f5f9}
.cal-hd{text-align:center;padding:6px 2px;font-size:10px;font-weight:700;color:#94a3b8}.cal-hd.sun{color:#f87171}.cal-hd.sat{color:#60a5fa}
.cal-body{display:grid;grid-template-columns:repeat(7,1fr)}
.ccell{border-right:1px solid #f1f5f9;border-bottom:1px solid #f1f5f9;min-height:88px;padding:4px;display:flex;flex-direction:column;align-items:center;cursor:pointer}
.ccell:nth-child(7n){border-right:none}.ccell:hover{filter:brightness(.97)}.ccell.past{opacity:.4;pointer-events:none}.ccell.tod{box-shadow:inset 0 0 0 2px #3b82f6}
.cdn{font-size:11px;font-weight:700;width:22px;height:22px;display:flex;align-items:center;justify-content:center;border-radius:50%;margin-bottom:3px}
.cdn.tod{background:#3b82f6;color:#fff}.cdn.sun{color:#f87171}.cdn.sat{color:#60a5fa}
.tw{overflow:auto;border-radius:12px;border:1px solid #e2e8f0;box-shadow:0 1px 4px rgba(0,0,0,.06);max-height:calc(100vh - 220px)}
.st{width:100%;border-collapse:collapse;font-size:11px}
.st th{background:#f8fafc;text-align:center;font-weight:700;border:1px solid #e2e8f0;white-space:nowrap;position:sticky;top:0;z-index:10;padding:3px 1px}
.st td{border:1px solid #f1f5f9;padding:1px;text-align:center;vertical-align:middle;height:34px}
.mc{text-align:left !important;padding:4px 8px !important;white-space:nowrap;min-width:108px;position:sticky;left:0;background:#fff !important;z-index:5;border-right:2px solid #e2e8f0 !important}
.st tr:hover .mc{background:#f8fafc !important}
.chip{display:inline-flex;align-items:center;justify-content:center;border-radius:5px;font-size:12px;font-weight:900;font-family:'IBM Plex Mono',monospace;min-width:28px;height:24px;padding:0 3px;border:none}
.chip.conf{box-shadow:0 1px 3px rgba(0,0,0,.15)}.chip.pend{opacity:.6;border-width:1.5px;border-style:dashed;background:transparent !important}.chip.csm{font-size:9px}
.th-wrap{display:flex;flex-direction:column;align-items:center;gap:1px}
.pg2{display:grid;grid-template-columns:1fr 1fr;gap:1px;width:100%}
.pb{border:none;cursor:pointer;font-size:8px;font-weight:900;padding:2px 1px;border-radius:2px;font-family:'IBM Plex Mono',monospace;line-height:1;opacity:.45;text-align:center}
.pb:hover{opacity:1}.pb.on{opacity:1;box-shadow:inset 0 0 0 1.5px rgba(0,0,0,.25)}
.sbadge{display:inline-block;background:#fee2e2;color:#ef4444;border-radius:3px;padding:1px 3px;font-size:7px;font-weight:800;margin-top:1px}
.okbadge{display:inline-block;background:#dcfce7;color:#15803d;border-radius:3px;padding:1px 3px;font-size:7px;font-weight:800;margin-top:1px}
.memo-inp{font-size:7px;width:100%;border:none;border-bottom:1px dashed #e2e8f0;background:transparent;outline:none;color:#64748b;font-family:inherit;text-align:center;padding:1px 0;margin-top:2px}
.cc{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:11px;margin-bottom:8px}.cc.urg{border-left:3px solid #ef4444}
.sub-nav{display:flex;gap:0;border-bottom:1px solid #e2e8f0;margin-bottom:16px}
.snb{padding:9px 16px;border:none;border-bottom:2px solid transparent;background:transparent;color:#64748b;cursor:pointer;font-family:inherit;font-size:12px;font-weight:500;margin-bottom:-1px}
.snb:hover{color:#1e293b}.snb.on{border-bottom-color:#3b82f6;color:#3b82f6;font-weight:700}
::-webkit-scrollbar{width:4px;height:4px}::-webkit-scrollbar-track{background:#f8fafc}::-webkit-scrollbar-thumb{background:#e2e8f0;border-radius:2px}
@media(max-width:700px){.pg{padding:8px}}`;
export default function App(){
  const today=new Date();
  const [tab,setTab]=useState("recruit");
  const [isAdmin,setAdmin]=useState(false);
  const [pwModal,setPwM]=useState(false);
  const [pwIn,setPwIn]=useState("");
  const [pwErr,setPwErr]=useState(false);
  const [toast,setToast]=useState(null);
  const [members,setMR]=useState(()=>ld("v13_mb",MB));
  const [shifts,setSR]=useState(()=>ld("v13_sh",DEMO.sh));
  const [reqs,setRR]=useState(()=>ld("v13_rq",DEMO.rqs));
  const [changes,setCR]=useState(()=>ld("v13_ch",DEMO.ch));
  const [dayPat,setDP]=useState(()=>ld("v13_dp",DEMO.dp));
  const [dayMemo,setDM]=useState(()=>ld("v13_dm",DEMO.dm));
  const [pub,setPR]=useState(()=>ld("v13_pb",DEMO.pub||[]));
  const [pats,setPatsR]=useState(()=>ld("v13_pt",DEFAULT_PT));
  const [notifs,setNotifsR]=useState(()=>ld("v13_nf",DEFAULT_NOTIFS));
  // データ変更時にSupabaseに保存
  const mk=(k,raw)=>v=>{
    if(typeof v==="function"){raw(prev=>{const n=v(prev);sv(k,n);if(SB_ON)_saveToDb(k,n);return n;});}
    else{sv(k,v);raw(v);if(SB_ON)_saveToDb(k,v);}
  };
  const _saveToDb=async(key,data)=>{
    try{
      if(key==="v13_mb"){
        await sbDelete("members","id=neq.XXXX");
        await sbUpsert("members",data.map((m,i)=>({id:m.id,name:m.name,tier:m.tier,sort_order:i})));
      }else if(key==="v13_sh"){
        await sbDelete("shifts","id=neq.XXXX");
        const rows=Object.entries(data).map(([k,v])=>{
          const idx=k.indexOf("_");
          return{id:k,mb_id:k.slice(0,idx),date:k.slice(idx+1),pattern:v.pattern||null,st:v.st||null,en:v.en||null,b:v.b||null};
        });
        await sbUpsert("shifts",rows);
      }else if(key==="v13_rq"){
        await sbDelete("reqs","id=gte.0");
        await sbUpsert("reqs",data);
      }else if(key==="v13_ch"){
        await sbDelete("changes","id=gte.0");
        await sbUpsert("changes",data.map(c=>({id:c.id,data:c})));
      }else if(key==="v13_dp"){
        await sbDelete("day_pat","date=neq.XXXX");
        await sbUpsert("day_pat",Object.entries(data).map(([date,pat])=>({date,pat:pat||""})));
      }else if(key==="v13_dm"){
        await sbDelete("day_memo","date=neq.XXXX");
        await sbUpsert("day_memo",Object.entries(data).map(([date,memo])=>({date,memo})));
      }else if(key==="v13_pb"){
        await sbDelete("pub_months","ym=neq.XXXX");
        await sbUpsert("pub_months",data.map(ym=>({ym})));
      }
    }catch(e){console.error("DB保存エラー:",key,e);}
  };
  };  const setMembers=mk("v13_mb",setMR),setShifts=mk("v13_sh",setSR),setReqs=mk("v13_rq",setRR);
  const setChanges=mk("v13_ch",setCR),setDayPat=mk("v13_dp",setDP),setDayMemo=mk("v13_dm",setDM);
  const setPub=mk("v13_pb",setPR),setPats=mk("v13_pt",setPatsR),setNotifs=mk("v13_nf",setNotifsR);
  const toast_=(msg,type)=>{setToast({msg,type:type||"ok"});setTimeout(()=>setToast(null),3200);};

  // Supabaseからデータ読み込み
  useEffect(()=>{
    const load=async()=>{
      try{
        const [mbs,shs,rqs,chs,dps,dms,pbs]=await Promise.all([
          dbAll("members"),dbAll("shifts"),dbAll("reqs"),dbAll("changes"),
          dbAll("day_pat"),dbAll("day_memo"),dbAll("pub_months")
        ]);
        if(mbs&&mbs.length)setMR(mbs.map(m=>({id:m.id,name:m.name,tier:m.tier})).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0)));
        if(shs&&shs.length){const o={};shs.forEach(s=>{o[`${s.mb_id}_${s.date}`]={pattern:s.pattern,st:s.st,en:s.en,b:s.b};});setSR(o);}
        if(rqs&&rqs.length)setRR(rqs);
        if(chs&&chs.length)setCR(chs.map(c=>c.data));
        if(dps&&dps.length){const o={};dps.forEach(d=>{o[d.date]=d.pat;});setDP(o);}
        if(dms&&dms.length){const o={};dms.forEach(d=>{o[d.date]=d.memo;});setDM(o);}
        if(pbs&&pbs.length)setPR(pbs.map(p=>p.ym));
      }catch(e){console.log("DB読み込みエラー（デモモードで動作）",e);}
    };
    if(SUPABASE_URL&&SUPABASE_KEY)load();
  },[]);

  const unlock=()=>{if(pwIn===PW){setAdmin(true);setTab("admin");setPwM(false);setPwIn("");setPwErr(false);toast_("ログインしました");}else setPwErr(true);};
  const DY=today.getFullYear(),DM=today.getMonth()+1;
  const NM=DM===12?1:DM+1,NY=DM===12?DY+1:DY;
  const sh={members,setMembers,shifts,setShifts,reqs,setReqs,changes,setChanges,dayPat,setDayPat,dayMemo,setDayMemo,pub,setPub,pats,setPats,notifs,setNotifs,isAdmin,toast_,today};
  return(<>
    <style>{CSS}</style>
    <div className="app">
      <header className="hdr">
        <div className="logo">SHIFT<em>/</em>MGR</div>
        <nav className="nav">
          {[["recruit","📋 シフト募集"],["confirmed","✅ 確定シフト"],["change","🔄 チェンジ"],["admin","🔒 管理"]].map(([id,lb])=>(
            <button key={id} className={"nb"+(tab===id?" on":"")} onClick={()=>{if(id==="admin"&&!isAdmin){setPwM(true);}else setTab(id);}}>{lb}</button>
          ))}
        </nav>
      </header>
      <main className="pg">
        {tab==="recruit"&&<RecruitPage {...sh} iY={NY} iM={NM}/>}
        {tab==="confirmed"&&<ConfirmedPage {...sh} iY={DY} iM={DM}/>}
        {tab==="change"&&<ChangePage {...sh}/>}
        {tab==="admin"&&<AdminPage {...sh} setAdmin={setAdmin} iY={NY} iM={NM}/>}
      </main>
    </div>
    {pwModal&&(<div className="ov" onClick={()=>{setPwM(false);setPwIn("");setPwErr(false);}}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:320}}>
        <div className="mt">🔑 管理者ログイン</div>
        <div className="fld"><label className="lb">パスワード</label>
          <input type="password" className="inp" value={pwIn} autoFocus placeholder="パスワードを入力"
            onChange={e=>{setPwIn(e.target.value);setPwErr(false);}} onKeyDown={e=>{if(e.key==="Enter")unlock();}}/>
          {pwErr&&<p style={{color:"#ef4444",fontSize:11,marginTop:4}}>❌ パスワードが違います</p>}
        </div>
        <div className="mf">
          <button className="btn bg" onClick={()=>{setPwM(false);setPwIn("");setPwErr(false);}}>キャンセル</button>
          <button className="btn bp" onClick={unlock}>ログイン</button>
        </div>
      </div>
    </div>)}
    {toast&&(<div className={"toast "+toast.type}>{toast.type==="ok"?"✅ ":toast.type==="er"?"⚠️ ":"ℹ️ "}{toast.msg}</div>)}
  </>);
}
function AdminPage({members,setMembers,shifts,setShifts,reqs,setReqs,dayPat,setDayPat,dayMemo,setDayMemo,pub,setPub,pats,setPats,notifs,setNotifs,isAdmin,setAdmin,toast_,today,iY,iM,changes,setChanges}){
  const [sub,setSub]=useState("adjust");
  if(!isAdmin)return(<div style={{textAlign:"center",padding:80,color:"#94a3b8"}}>🔒 管理者ログインが必要です</div>);
  const p={members,setMembers,shifts,setShifts,reqs,setReqs,dayPat,setDayPat,dayMemo,setDayMemo,pub,setPub,pats,setPats,notifs,setNotifs,isAdmin,toast_,today,iY,iM};
  return(<div>
    <div className="sub-nav">
      {[["adjust","⚙️ シフト調整"],["csv","⬇ CSV"],["members","👥 メンバー"],["settings","🔧 設定"]].map(([id,lb])=>(
        <button key={id} className={"snb"+(sub===id?" on":"")} onClick={()=>setSub(id)}>{lb}</button>
      ))}
      <div style={{flex:1}}/>
      <button className="snb" onClick={()=>{setAdmin(false);toast_("ログアウト");}}>ログアウト</button>
    </div>
    {sub==="adjust"&&<AdjustPage {...p}/>}
    {sub==="csv"&&<CsvPage shifts={shifts} members={members} pats={pats} toast_={toast_} iY={iY} iM={iM}/>}
    {sub==="members"&&<MembersPage members={members} setMembers={setMembers} toast_={toast_}/>}
    {sub==="settings"&&<SettingsPage pats={pats} setPats={setPats} notifs={notifs} setNotifs={setNotifs} toast_={toast_}/>}
  </div>);
}
function RecruitPage({members,reqs,setReqs,dayPat,pats,toast_,today,iY,iM}){
  const [year,setYear]=useState(iY||today.getFullYear());
  const [month,setMonth]=useState(iM||today.getMonth()+1);
  const [view,setView]=useState("input");
  const [myId,setMyId]=useState("");
  const [draft,setDraft]=useState({});
  const [slkM,setSlkM]=useState(null);
  const [slkL,setSlkL]=useState(false);
  const ym=toYM(year,month),days=dim(year,month),tDate=todayStr();
  const mReqs=reqs.filter(r=>r.date.startsWith(ym));
  const ptMap={};pats.forEach(p=>{ptMap[p.key]=p;});
  const fdow=new Date(year,month-1,1).getDay();
  const cells=[];
  for(let i=0;i<fdow;i++)cells.push(0);
  for(let d=1;d<=days;d++)cells.push(d);
  while(cells.length%7)cells.push(0);
  const selMember=id=>{
    setMyId(id);
    const init={};
    reqs.filter(r=>r.mbId===id&&r.date.startsWith(ym)).forEach(r=>{init[r.date]={pat:r.pat,isC:r.pat==="CUSTOM",st:r.st||"",en:r.en||"",note:r.note||""};});
    setDraft(init);
  };
  const togPat=(date,pat)=>{
    setDraft(prev=>{
      const next=Object.assign({},prev),cur=next[date];
      if(cur&&!cur.isC&&cur.pat===pat){delete next[date];}
      else{const p=ptMap[pat]||{s:"10:30",e:"19:30"};next[date]={pat,isC:false,st:p.s,en:p.e,note:cur?cur.note:""};}
      return next;
    });
  };
  const togCustom=date=>{
    setDraft(prev=>{
      const next=Object.assign({},prev),cur=next[date];
      if(cur&&cur.isC){delete next[date];}else next[date]={pat:"CUSTOM",isC:true,st:cur?cur.st:"",en:cur?cur.en:"",note:cur?cur.note:""};
      return next;
    });
  };
  const setDF=(date,f,v)=>{setDraft(prev=>{const next=Object.assign({},prev);next[date]=Object.assign({},next[date]||{pat:"A",isC:false,st:"",en:"",note:""},{[f]:v});return next;});};
  const submit=async()=>{
    const mem=members.find(m=>m.id===myId);if(!mem)return;
    const dates=Object.keys(draft);if(!dates.length){toast_("入力がありません","er");return;}
    const now=Date.now();
    const nr=dates.map((date,i)=>{const f=draft[date];const p=ptMap[f.pat];return({id:now+i,mbId:myId,mbName:mem.name,date,pat:f.isC?"CUSTOM":f.pat,st:f.isC?f.st:(p?p.s:""),en:f.isC?f.en:(p?p.e:""),note:f.note||"",at:new Date().toISOString()});});
    setReqs(prev=>prev.filter(r=>!(r.mbId===myId&&r.date.startsWith(ym))).concat(nr));
    toast_(`${mem.name}さんの${month}月分（${nr.length}日）を提出しました！`);
    setSlkL(true);
    const sum=nr.map(r=>r.date.slice(5)+": "+(r.pat==="CUSTOM"?r.st+"〜"+r.en:r.pat)).join("\n");
    try{setSlkM(await callAI(`以下のシフト希望を管理者へのDM通知文に変換。送信テキストのみ出力。前置き不要。\n名前:${mem.name}\n内容:\n${sum}`,250));}
    catch(_){setSlkM(`${mem.name}より${month}月分（${nr.length}日）が提出されました。\n\n${sum}`);}
    setSlkL(false);
  };
  const mem=members.find(m=>m.id===myId),inputDays=Object.keys(draft).length;
  return(<div>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12,gap:8,flexWrap:"wrap"}}>
      <div><h2 style={{fontSize:15,fontWeight:800}}>📋 シフト募集</h2><p style={{color:"#94a3b8",fontSize:11,marginTop:2}}>名前を選んで希望日を入力し、まとめて提出してください</p></div>
      <div style={{display:"flex",background:"#f1f5f9",borderRadius:8,padding:2}}>
        {[["input","✏️ 個人入力"],["cal","📅 募集状況"]].map(([v,l])=>(
          <button key={v} onClick={e=>{e.stopPropagation();setView(v);}}
            style={{padding:"4px 10px",borderRadius:6,border:"none",cursor:"pointer",fontSize:11,fontWeight:600,fontFamily:"inherit",background:view===v?"#fff":"transparent",color:view===v?"#1e293b":"#94a3b8",boxShadow:view===v?"0 1px 3px rgba(0,0,0,.1)":"none"}}>{l}</button>
        ))}
      </div>
    </div>
    <SlkPreview msg={slkM} setMsg={setSlkM} dest="管理者へのDM" loading={slkL} onClose={()=>setSlkM(null)} showSend={true}/>
    <div style={{display:"flex",gap:5,marginBottom:12,flexWrap:"wrap"}}>
      {pats.map(p=>(
        <div key={p.key} style={{display:"flex",alignItems:"center",gap:4,background:p.bg,border:`1px solid ${p.bd}`,borderRadius:7,padding:"3px 8px"}}>
          <span style={{fontSize:12,fontWeight:900,color:p.ic,fontFamily:"IBM Plex Mono,monospace"}}>{p.key}</span>
          <span style={{fontSize:9,color:p.ic,opacity:.9}}>{p.d} {p.s}〜{p.e}</span>
        </div>
      ))}
    </div>
    {view==="input"&&(<div>
      <div className="card" style={{marginBottom:12}}>
        <div style={{fontSize:12,fontWeight:700,marginBottom:10}}>👤 名前を選んでください</div>
        <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
          {members.map(m=>{
            const mc=mReqs.filter(r=>r.mbId===m.id).length,isMe=myId===m.id;
            return(<button key={m.id} onClick={()=>selMember(m.id)}
              style={{padding:"5px 11px",borderRadius:8,border:`2px solid ${isMe?avc(m.id):"#e2e8f0"}`,background:isMe?avc(m.id)+"18":"#fff",color:isMe?avc(m.id):"#475569",cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:isMe?700:500,display:"flex",alignItems:"center",gap:5}}>
              <span className="av" style={{background:avc(m.id),width:18,height:18,fontSize:8}}>{ini(m.name)}</span>
              {m.name}
              {mc>0&&<span style={{fontSize:9,background:"#dcfce7",color:"#15803d",borderRadius:10,padding:"1px 5px"}}>{mc}日</span>}
            </button>);
          })}
        </div>
      </div>
      {myId&&(<div>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10,gap:8,flexWrap:"wrap"}}>
          <div style={{display:"flex",gap:5,alignItems:"center"}}>
            <button className="btn bg sm" onClick={()=>navM(-1,month,year,setMonth,setYear)}>‹ 前月</button>
            <span style={{fontSize:13,fontWeight:700,fontFamily:"IBM Plex Mono"}}>{year}/{String(month).padStart(2,"0")}</span>
            <button className="btn bg sm" onClick={()=>navM(1,month,year,setMonth,setYear)}>次月 ›</button>
          </div>
          <button className="btn bgs" disabled={inputDays===0} onClick={submit}>✅ {inputDays}日分をまとめて提出</button>
        </div>
        <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:12,overflow:"hidden"}}>
          {Array.from({length:days},(_,i)=>i+1).map(d=>{
            const date=fdt(year,month,d),wd=new Date(year,month-1,d).getDay();
            const isPast=date<tDate,dpat=getDP(date,dayPat,pats),p=dpat?ptMap[dpat]:null;
            const inp=draft[date],has=!!inp;
            return(<div key={d} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"9px 14px",borderBottom:"1px solid #f1f5f9",background:isPast?"#fafafa":has?(inp.isC?"rgba(236,72,153,.04)":(ptMap[inp.pat]?ptMap[inp.pat].bg:"transparent")):"transparent",opacity:isPast?0.5:1}}>
              <div style={{minWidth:52,flexShrink:0,paddingTop:2}}>
                <div style={{fontSize:13,fontWeight:700,color:wd===0?"#f87171":wd===6?"#60a5fa":"#1e293b"}}>{d}日</div>
                <div style={{fontSize:10,color:wd===0?"#f87171":wd===6?"#60a5fa":"#94a3b8"}}>{JD[wd]}</div>
                <div style={{fontSize:9,color:dpat?(p?p.ic:"#94a3b8"):"#94a3b8",opacity:.7}}>募集:{dpat||"ブランク"}</div>
              </div>
              {isPast?<div style={{fontSize:11,color:"#d1d5db",paddingTop:6}}>過去日</div>
              :<div style={{flex:1}}>
                <div style={{display:"flex",gap:4,flexWrap:"wrap",alignItems:"center"}}>
                  {pats.map(pv=>{
                    const sel=has&&!inp.isC&&inp.pat===pv.key;
                    return(<button key={pv.key} onClick={()=>togPat(date,pv.key)}
                      style={{padding:"4px 9px",borderRadius:7,border:`2px solid ${sel?pv.bd:"#e2e8f0"}`,background:sel?pv.bg:"#fff",color:sel?pv.ic:"#94a3b8",cursor:"pointer",fontFamily:"IBM Plex Mono,monospace",fontSize:13,fontWeight:900}}>{pv.key}</button>);
                  })}
                  <button onClick={()=>togCustom(date)}
                    style={{padding:"4px 9px",borderRadius:7,border:`2px solid ${has&&inp.isC?"#ec4899":"#e2e8f0"}`,background:has&&inp.isC?"rgba(236,72,153,.08)":"#fff",color:has&&inp.isC?"#ec4899":"#94a3b8",cursor:"pointer",fontFamily:"inherit",fontSize:11,fontWeight:600}}>時間入力</button>
                  {has&&(<button onClick={()=>setDraft(prev=>{const n=Object.assign({},prev);delete n[date];return n;})}
                    style={{padding:"4px 8px",borderRadius:7,border:"1px dashed #e2e8f0",background:"#fff",color:"#94a3b8",cursor:"pointer",fontSize:10}}>✕</button>)}
                </div>
                {has&&!inp.isC&&ptMap[inp.pat]&&<div style={{fontSize:10,color:ptMap[inp.pat].ic,marginTop:4,opacity:.8}}>🕐 {ptMap[inp.pat].s}〜{ptMap[inp.pat].e}</div>}
                {has&&inp.isC&&(<div style={{display:"flex",gap:6,marginTop:5,alignItems:"center"}}>
                  <TimeSelect value={inp.st} onChange={v=>setDF(date,"st",v)}/>
                  <span style={{color:"#94a3b8",fontSize:11}}>〜</span>
                  <TimeSelect value={inp.en} onChange={v=>setDF(date,"en",v)}/>
                </div>)}
                {has&&(<input type="text" placeholder="メモ（任意）" value={inp.note||""} onChange={e=>setDF(date,"note",e.target.value)}
                  style={{marginTop:5,border:"1px solid #e2e8f0",borderRadius:6,padding:"3px 9px",fontSize:11,fontFamily:"inherit",width:"100%",maxWidth:280,outline:"none"}}/>)}
              </div>}
            </div>);
          })}
        </div>
        {inputDays>0&&(<div style={{marginTop:12,textAlign:"center"}}>
          <button className="btn bgs" style={{padding:"10px 28px",fontSize:13}} onClick={submit}>✅ {mem&&mem.name}さんの {inputDays}日分をまとめて提出する</button>
        </div>)}
      </div>)}
    </div>)}
    {view==="cal"&&(<div>
      <div style={{display:"flex",gap:6,marginBottom:10,alignItems:"center"}}>
        <button className="btn bg sm" onClick={()=>navM(-1,month,year,setMonth,setYear)}>‹ 前月</button>
        <span style={{fontSize:13,fontWeight:700}}>{year}年 {month}月</span>
        <button className="btn bg sm" onClick={()=>navM(1,month,year,setMonth,setYear)}>次月 ›</button>
      </div>
      <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:12,overflow:"hidden"}}>
        <div className="cal-hrow">{JD.map((d,i)=><div key={d} className={"cal-hd"+(i===0?" sun":i===6?" sat":"")}>{d}</div>)}</div>
        <div className="cal-body">
          {cells.map((d,ci)=>{
            if(!d)return(<div key={"b"+ci} style={{background:"#fafafa",opacity:.3,borderRight:"1px solid #f1f5f9",borderBottom:"1px solid #f1f5f9",minHeight:88}}/>);
            const date=fdt(year,month,d),wd=new Date(year,month-1,d).getDay();
            const isPast=date<tDate,isToday=date===tDate;
            const pat=getDP(date,dayPat,pats),p=pat?ptMap[pat]:null;
            const c=mReqs.filter(r=>r.date===date&&r.pat===pat).length,q=p?p.q:0,s=Math.max(0,q-c);
            return(<div key={d} className={"ccell"+(isPast?" past":"")+(isToday?" tod":"")} style={{background:p?p.bg:"#f8fafc"}} onClick={e=>{e.stopPropagation();if(!isPast)setView("input");}}>
              <div className={"cdn"+(isToday?" tod":wd===0?" sun":wd===6?" sat":"")}>{d}</div>
              <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",width:"100%",position:"relative"}}>
                {p&&c>0&&<div style={{position:"absolute",top:0,left:1,fontSize:8,fontWeight:800,color:p.ic,background:p.ic+"20",borderRadius:8,padding:"0 3px"}}>{c}</div>}
                {p&&s>0&&<div style={{position:"absolute",top:0,right:1,fontSize:8,fontWeight:800,color:"#ef4444"}}>-{s}</div>}
                {pat?<span style={{fontSize:36,fontWeight:900,lineHeight:1,fontFamily:"IBM Plex Mono,monospace",opacity:.2,color:p.ic}}>{pat}</span>:<span style={{fontSize:11,color:"#e2e8f0"}}>—</span>}
                {p&&<span style={{fontSize:8,opacity:.45,color:p.ic}}>{c}/{q}</span>}
              </div>
            </div>);
          })}
        </div>
      </div>
    </div>)}
  </div>);
}
function ConfirmedPage({members,shifts,dayPat,dayMemo,pub,pats,isAdmin,iY,iM}){
  const today=new Date();
  const [year,setYear]=useState(iY||today.getFullYear());
  const [month,setMonth]=useState(iM||today.getMonth()+1);
  const isPub=pub.includes(toYM(year,month));
  const ptMap={};pats.forEach(p=>{ptMap[p.key]=p;});
  const days=dim(year,month),da=Array.from({length:days},(_,i)=>i+1);
  const hasData=Object.keys(shifts).some(k=>{const parts=k.split("_");return parts.length>=2&&parts[1]&&parts[1].startsWith(toYM(year,month));});
  const navBar=(<div style={{display:"flex",gap:4}}>
    <button className="btn bg sm" onClick={()=>navM(-1,month,year,setMonth,setYear)}>‹</button>
    <span style={{fontSize:11,fontWeight:700,fontFamily:"IBM Plex Mono",alignSelf:"center",minWidth:55,textAlign:"center"}}>{year}/{String(month).padStart(2,"0")}</span>
    <button className="btn bg sm" onClick={()=>navM(1,month,year,setMonth,setYear)}>›</button>
  </div>);
  if(!isPub&&!isAdmin&&!hasData)return(<div>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}><h2 style={{fontSize:15,fontWeight:800}}>✅ 確定シフト</h2>{navBar}</div>
    <div style={{textAlign:"center",padding:"60px 20px"}}><div style={{fontSize:48,marginBottom:16}}>📋</div><h2 style={{fontSize:18,fontWeight:800,marginBottom:8}}>シフトはまだ公開されていません</h2><p style={{color:"#94a3b8"}}>管理者が確定・公開するとここで確認できます</p></div>
  </div>);
  return(<div>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10,gap:8,flexWrap:"wrap"}}>
      <div><h2 style={{fontSize:15,fontWeight:800}}>✅ 確定シフト</h2>
        <span className="bdg" style={{background:isPub?"#dcfce7":"#f1f5f9",color:isPub?"#15803d":"#64748b",marginTop:3,display:"inline-block"}}>{isPub?"📢 全体公開中":"🔒 管理者のみ"}</span>
      </div>
      {navBar}
    </div>
    <div className="tw">
      <table className="st"><thead><tr>
        <th className="mc">メンバー</th>
        {da.map(d=>{
          const date=fdt(year,month,d),wd=new Date(year,month-1,d).getDay();
          const pat=getDP(date,dayPat,pats),p=pat?ptMap[pat]:null,memo=dayMemo[date]||"";
          const cA=Object.keys(shifts).filter(k=>k.endsWith("_"+date)&&shifts[k]).length;
          const cP=Object.keys(shifts).filter(k=>k.endsWith("_"+date)&&(shifts[k]&&shifts[k].pattern==="P")).length;
          const sh=p?Math.max(0,p.q-(cA-cP)):0;
          return(<th key={d} style={{color:wd===0?"#f87171":wd===6?"#60a5fa":"",minWidth:44,background:p?p.bg:"#f8fafc"}}>
            <div className="th-wrap">
              <div style={{fontSize:10,fontWeight:700,color:pat?(ptMap[pat]?ptMap[pat].ic:"#94a3b8"):"#94a3b8"}}>{d}</div>
              <div style={{fontSize:8,color:wd===0?"#f87171":wd===6?"#60a5fa":"#94a3b8"}}>{JD[wd]}</div>
              {p&&(sh>0?<span className="sbadge">あと{sh}人</span>:<span className="okbadge">OK</span>)}
              {memo&&<div style={{fontSize:7,color:"#64748b",maxWidth:42,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{memo}</div>}
            </div>
          </th>);
        })}
      </tr></thead>
      <tbody>{members.map(m=>(
        <tr key={m.id}>
          <td className="mc"><div style={{display:"flex",alignItems:"center",gap:5,padding:"3px 8px"}}>
            <span className="av" style={{background:avc(m.id),width:19,height:19,fontSize:8}}>{ini(m.name)}</span>
            <span style={{fontSize:10}}>{m.name}</span>
          </div></td>
          {da.map(d=>{
            const date=fdt(year,month,d),s=shifts[`${m.id}_${date}`];
            const pat=s&&s.pattern,isS=s&&!pat&&(s.st||s.en);
            const dp=getDP(date,dayPat,pats),dpv=dp?ptMap[dp]:null;
            return(<td key={d} style={{background:dpv?dpv.bg:"#f8fafc"}}>
              {pat&&ptMap[pat]?<div className="chip conf" style={{background:ptMap[pat].cb,color:ptMap[pat].ct}}>{pat}</div>
              :isS?<div className="chip conf csm" style={{background:"rgba(236,72,153,.15)",color:"#ec4899",border:"1px solid #ec4899"}}>{s.st.slice(0,5)}</div>
              :null}
            </td>);
          })}
        </tr>
      ))}</tbody>
      </table>
    </div>
  </div>);
}
function AdjustPage({members,setMembers,shifts,setShifts,reqs,dayPat,setDayPat,dayMemo,setDayMemo,pub,setPub,pats,notifs,toast_,today,iY,iM}){
  const [year,setYear]=useState(iY||(today?today.getFullYear():new Date().getFullYear()));
  const [month,setMonth]=useState(iM||(today?today.getMonth()+1:new Date().getMonth()+1));
  const [aiLoad,setAiLoad]=useState(false);
  const [aiResult,setAiResult]=useState(null);
  const [editModal,setEditModal]=useState(null);
  const [editPat,setEditPat]=useState("");
  const [editTime,setEditTime]=useState({st:"",en:"",b:"01:00"});
  const [slkM,setSlkM]=useState(null);
  const [slkL,setSlkL]=useState(false);
  const [shModal,setShModal]=useState(false);
  const [shDates,setShDates]=useState([]);
  const [shMsg,setShMsg]=useState("");
  const [shMsgL,setShMsgL]=useState(false);
  const [notifModal,setNotifModal]=useState(false);
  const [selNotif,setSelNotif]=useState(null);
  const [notifMsg,setNotifMsg]=useState("");
  const dragIdx=useRef(null);
  const ptMap={};pats.forEach(p=>{ptMap[p.key]=p;});
  const ym=toYM(year,month),days=dim(year,month),da=Array.from({length:days},(_,i)=>i+1);
  const tDate=todayStr(),isPub=pub.includes(ym);
  const cntMain=date=>{
    const cA=Object.keys(shifts).filter(k=>k.endsWith("_"+date)&&shifts[k]).length;
    const cP=Object.keys(shifts).filter(k=>k.endsWith("_"+date)&&(shifts[k]&&shifts[k].pattern==="P")).length;
    return cA-cP;
  };
  const openSh=()=>{
    const s=[];
    for(let d=1;d<=days;d++){
      const date=fdt(year,month,d);if(date<tDate)continue;
      const pat=getDP(date,dayPat,pats);if(!pat)continue;
      const p=ptMap[pat];if(!p)continue;
      const c=cntMain(date);
      if(p.q>c)s.push({date,d,wd:JD[new Date(date+"T00:00:00").getDay()],pat,c,q:p.q,sel:true});
    }
    if(!s.length){toast_("現時点で人数不足の日はありません");return;}
    setShDates(s);setShMsg("");setShModal(true);
  };
  const genShMsg=async()=>{
    const sel=shDates.filter(s=>s.sel);if(!sel.length){toast_("日付を選択してください","er");return;}
    setShMsgL(true);
    const lines=sel.map(s=>`${month}/${s.d}(${s.wd}) ${s.pat}パターン ${s.c}/${s.q}名`).join("\n");
    try{setShMsg(await callAI(`以下のシフト不足情報をSlack募集アナウンスに変換。スタッフ向けのフレンドリーな文体。送信テキストのみ出力。前置き不要。\n不足日:\n${lines}`,600));}
    catch(_){setShMsg(`以下の日程でまだ募集しています！\n\n${lines}\n\n入れる方がいればご連絡ください🙏`);}
    setShMsgL(false);
  };
  const openNotifPick=()=>{setSelNotif(null);setNotifMsg("");setNotifModal(true);};
  const pickNotif=async(n)=>{
    setSelNotif(n);
    const nm=month===12?1:month+1,deadline=`${year}年${month}月${n.day||17}日`;
    const expanded=n.tmpl.replace(/\{\{nextMonth\}\}/g,String(nm)).replace(/\{\{notifDay\}\}/g,String(n.day||15)).replace(/\{\{deadline\}\}/g,deadline);
    setNotifMsg(expanded);
  };
  const handleCell=(mbId,date)=>{
    const key=`${mbId}_${date}`,s=shifts[key],req=reqs.find(r=>r.mbId===mbId&&r.date===date);
    if(s){setShifts(prev=>{const n=Object.assign({},prev);delete n[key];return n;});toast_("未確定に戻しました");}
    else if(req){
      const p=ptMap[req.pat];
      if(req.pat==="CUSTOM")setShifts(prev=>Object.assign({},prev,{[key]:{pattern:null,st:req.st,en:req.en,b:"01:00"}}));
      else if(p)setShifts(prev=>Object.assign({},prev,{[key]:{pattern:req.pat,st:p.s,en:p.e,b:req.b||"01:00"}}));
      toast_("確定しました");
    }else{
      const cur=shifts[key];setEditPat(cur&&cur.pattern||"");setEditTime({st:cur&&cur.st||"",en:cur&&cur.en||"",b:cur&&cur.b||"01:00"});setEditModal({mbId,date,key});
    }
  };
  const saveEdit=()=>{
    if(!editModal)return;const{key}=editModal;
    const p=ptMap[editPat];const ps=SHORT[editPat];
    if(editPat&&p)setShifts(prev=>Object.assign({},prev,{[key]:{pattern:editPat,st:p.s,en:p.e,b:editTime.b||"01:00"}}));
    else if(editPat&&ps)setShifts(prev=>Object.assign({},prev,{[key]:{pattern:null,st:ps.s,en:ps.e,b:editTime.b||"01:00"}}));
    else if(editTime.st)setShifts(prev=>Object.assign({},prev,{[key]:{pattern:null,st:editTime.st,en:editTime.en,b:editTime.b||"01:00"}}));
    setEditModal(null);toast_("シフトを設定しました");
  };
  const aiAuto=async()=>{
    setAiLoad(true);setAiResult(null);toast_("AI調整中…","in");
    try{
      const ml=members.map(m=>`${m.id}:${m.name}(T${m.tier})`).join(",");
      const rl=reqs.filter(r=>r.date.startsWith(ym)).slice(0,50).map(r=>`${r.mbId}:${r.date}:${r.pat}`).join(",");
      const prompt=`シフト調整。以下の形式のJSONのみ返す。他の文字は一切含めないこと。\n形式: [{"mbId":"2000003","date":"${ym}-01","pat":"A"}]\nメンバー: ${ml}\nT1優先。希望: ${rl||"なし"}`;
      const raw=await callAI(prompt,800);
      const clean=raw.replace(/```json/g,"").replace(/```/g,"").trim();
      const arr=JSON.parse(clean);
      if(!Array.isArray(arr))throw new Error("配列でない");
      let added=0,changed=0;const valid=[];
      arr.forEach(item=>{
        const p=ptMap[item.pat];if(!p||!item.mbId||!item.date)return;
        const k=`${item.mbId}_${item.date}`;
        if(!shifts[k])added++;else if(shifts[k].pattern!==item.pat)changed++;
        valid.push({k,pattern:item.pat,st:p.s,en:p.e,b:"01:00"});
      });
      setShifts(prev=>{const next=Object.assign({},prev);valid.forEach(v=>next[v.k]={pattern:v.pattern,st:v.st,en:v.en,b:v.b});return next;});
      setAiResult({total:valid.length,added,changed});toast_(`AI調整完了 ${valid.length}件`);
    }catch(err){toast_(`AI調整に失敗（${err.message}）`,"er");}
    setAiLoad(false);
  };
  const publish=async()=>{
    if(!isPub){setPub(prev=>prev.concat([ym]));toast_("公開しました！");}
    else{
      setSlkL(true);
      try{setSlkM(await callAI(`${year}年${month}月のシフトを更新した旨をSlack通知。送信テキストのみ出力。前置き不要。`,150));}
      catch(_){setSlkM(`${year}年${month}月のシフトを更新しました。ご確認ください🙏`);}
      setSlkL(false);
    }
  };
  const pending=reqs.filter(r=>r.date.startsWith(ym)&&!shifts[`${r.mbId}_${r.date}`]).length;
  return(<div>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10,gap:8,flexWrap:"wrap"}}>
      <div><h2 style={{fontSize:15,fontWeight:800}}>⚙️ シフト調整</h2>
        <p style={{color:"#94a3b8",fontSize:11,marginTop:2}}>点線=希望→クリックで確定　塗りつぶし→クリックで取り消し　ダブルクリック=時間変更　複数人は1人ずつクリック</p>
      </div>
      <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
        <button className="btn bg sm" onClick={()=>navM(-1,month,year,setMonth,setYear)}>‹</button>
        <span style={{fontSize:11,fontWeight:700,fontFamily:"IBM Plex Mono",alignSelf:"center",minWidth:55,textAlign:"center"}}>{year}/{String(month).padStart(2,"0")}</span>
        <button className="btn bg sm" onClick={()=>navM(1,month,year,setMonth,setYear)}>›</button>
        <button className="btn bg sm" disabled={aiLoad} onClick={aiAuto}>{aiLoad?<><span className="spin"/>AI…</>:"🤖 AI調整"}</button>
        <button className="btn bg sm" onClick={openSh}>🚨 不足通知</button>
        <button className="btn by sm" onClick={openNotifPick}>📢 月間通知</button>
        <button className="btn bp sm" onClick={publish}>{isPub?"📢 更新通知":"🔄 公開する"}</button>
      </div>
    </div>
    <SlkPreview msg={slkM} setMsg={setSlkM} dest="#シフト連絡（全体）" loading={slkL} onClose={()=>setSlkM(null)} showSend={true}/>
    {aiResult&&(<div style={{background:"#f0fdf4",border:"1px solid #86efac",borderRadius:8,padding:"8px 14px",marginBottom:10,display:"flex",gap:16,alignItems:"center",fontSize:11}}>
      <span style={{fontWeight:700,color:"#15803d"}}>🤖 AI調整完了</span>
      <span style={{color:"#15803d"}}>新規: <b>{aiResult.added}件</b></span>
      <span style={{color:"#0284c7"}}>変更: <b>{aiResult.changed}件</b></span>
      <button className="btn bg sm" style={{marginLeft:"auto"}} onClick={()=>setAiResult(null)}>閉じる</button>
    </div>)}
    {pending>0&&(<div style={{background:"#fef9c3",border:"1px solid #fcd34d",borderRadius:8,padding:"6px 12px",marginBottom:10,fontSize:11,color:"#92400e"}}>📋 未確定の希望が{pending}件あります</div>)}
    <div className="tw">
      <table className="st"><thead><tr>
        <th className="mc" style={{minWidth:112}}>
          <div style={{padding:"4px 8px"}}><div style={{fontSize:10,fontWeight:700}}>メンバー</div><div style={{fontSize:8,color:"#94a3b8"}}>⠿ ドラッグで並び替え</div></div>
        </th>
        {da.map(d=>{
          const date=fdt(year,month,d),wd=new Date(year,month-1,d).getDay(),isT=date===tDate;
          const st=dayPat[date],curDp=st===""?null:(st||(wd===3?null:"A"));
          const pv=curDp?ptMap[curDp]:null,memo=dayMemo[date]||"";
          const sh=pv?Math.max(0,pv.q-cntMain(date)):0;
          return(<th key={d} style={{color:wd===0?"#f87171":wd===6?"#60a5fa":"",minWidth:50,background:isT?"#eff6ff":pv?pv.bg:"#f8fafc",padding:"2px 1px"}}>
            <div className="th-wrap">
              <div style={{fontSize:6,color:"#94a3b8",marginBottom:1}}>募集</div>
              <div className="pg2">
                {pats.filter(pk=>pk.key!=="P").slice(0,4).map(pk=>{const isOn=curDp===pk.key;return(
                  <button key={pk.key} className={"pb"+(isOn?" on":"")} style={{background:isOn?pk.cb:"#f1f5f9",color:isOn?pk.ct:"#94a3b8"}}
                    title={`${pk.key}: ${pk.d}（${pk.s}〜${pk.e}）必要${pk.q}人`}
                    onClick={()=>setDayPat(prev=>{const n=Object.assign({},prev);if(isOn){n[date]="";}else{n[date]=pk.key;}return n;})}>{pk.key}</button>);
                })}
              </div>
              {pats.filter(pk=>pk.key==="P").map(pk=>{const isOn=curDp===pk.key;return(
                <button key={pk.key} className={"pb"+(isOn?" on":"")} style={{background:isOn?pk.cb:"#f1f5f9",color:isOn?pk.ct:"#94a3b8",width:"100%",marginTop:1}}
                  onClick={()=>setDayPat(prev=>{const n=Object.assign({},prev);if(isOn){n[date]="";}else{n[date]=pk.key;}return n;})}>{pk.key}</button>);})}
              <div style={{fontSize:10,fontWeight:700,color:curDp?((ptMap[curDp]&&ptMap[curDp].ic)||"#94a3b8"):"#94a3b8"}}>{d}</div>
              <div style={{fontSize:8,color:wd===0?"#f87171":wd===6?"#60a5fa":"#94a3b8"}}>{JD[wd]}</div>
              {pv&&(sh>0?<span className="sbadge">あと{sh}人</span>:<span className="okbadge">OK</span>)}
              <input className="memo-inp" placeholder="📝メモ" value={memo} onChange={e=>setDayMemo(prev=>Object.assign({},prev,{[date]:e.target.value}))}/>
            </div>
          </th>);
        })}
      </tr></thead>
      <tbody>{members.map((m,mi)=>(
        <tr key={m.id} onDragOver={e=>e.preventDefault()} onDrop={()=>{
          if(dragIdx.current===null||dragIdx.current===mi)return;
          const arr=members.slice();const[mv]=arr.splice(dragIdx.current,1);arr.splice(mi,0,mv);
          setMembers(arr);dragIdx.current=null;
        }}>
          <td className="mc">
            <div draggable onDragStart={()=>{dragIdx.current=mi;}} style={{display:"flex",alignItems:"center",gap:4,padding:"4px 8px",cursor:"grab"}}>
              <span style={{color:"#cbd5e1",fontSize:12,flexShrink:0}}>⠿</span>
              <span className="av" style={{background:avc(m.id),width:19,height:19,fontSize:8,flexShrink:0}}>{ini(m.name)}</span>
              <span style={{fontSize:10}}>{m.name}</span>
              <span style={{fontSize:8,color:"#94a3b8",flexShrink:0}}>T{m.tier}</span>
            </div>
          </td>
          {da.map(d=>{
            const date=fdt(year,month,d),key=`${m.id}_${date}`;
            const s=shifts[key],req=reqs.find(r=>r.mbId===m.id&&r.date===date);
            const st=dayPat[date],dpat=st===""?null:(st||(new Date(year,month-1,d).getDay()===3?null:"A"));
            const dpv=dpat?ptMap[dpat]:null,pat=s&&s.pattern,isS=s&&!pat&&(s.st||s.en);
            return(<td key={d} style={{background:dpv?dpv.bg:"#f8fafc",cursor:"pointer"}}
              onClick={()=>handleCell(m.id,date)}
              onDoubleClick={()=>{const cur=shifts[key];setEditPat(cur&&cur.pattern||"");setEditTime({st:cur&&cur.st||req&&req.st||"",en:cur&&cur.en||req&&req.en||"",b:cur&&cur.b||"01:00"});setEditModal({mbId:m.id,date,key});}}>
              {pat&&ptMap[pat]?<div className="chip conf" style={{background:ptMap[pat].cb,color:ptMap[pat].ct}}>{pat}</div>
              :isS?<div className="chip conf csm" style={{background:"rgba(236,72,153,.15)",color:"#ec4899",border:"1px solid #ec4899"}}>{s.st.slice(0,5)}</div>
              :req&&ptMap[req.pat]?<div className="chip pend" style={{color:ptMap[req.pat].ic,borderColor:ptMap[req.pat].ic}}>{req.pat}</div>
              :req&&req.pat==="CUSTOM"?<div className="chip pend csm" style={{color:"#ec4899",borderColor:"#ec4899"}}>{req.st.slice(0,5)}</div>
              :<div style={{height:24,display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{fontSize:10,color:"#e2e8f0"}}>＋</span></div>}
            </td>);
          })}
        </tr>
      ))}</tbody>
      </table>
    </div>
    {editModal&&(<div className="ov" onClick={()=>setEditModal(null)}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:380}}>
        <div className="mt">✏️ シフト設定 — {members.find(m=>m.id===editModal.mbId)&&members.find(m=>m.id===editModal.mbId).name} / {editModal.date}</div>
        <div className="fld"><label className="lb">パターン</label>
          <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:8}}>
            {pats.map(p=>(<button key={p.key} onClick={()=>setEditPat(editPat===p.key?"":p.key)}
              style={{padding:"6px 10px",borderRadius:7,border:`2px solid ${editPat===p.key?p.bd:"#e2e8f0"}`,background:editPat===p.key?p.bg:"#fff",color:editPat===p.key?p.ic:"#94a3b8",cursor:"pointer",fontFamily:"IBM Plex Mono,monospace",fontSize:14,fontWeight:900}}>{p.key}</button>))}
            {Object.entries(SHORT).map(([k,p])=>(<button key={k} onClick={()=>setEditPat(editPat===k?"":k)}
              style={{padding:"6px 10px",borderRadius:7,border:`2px solid ${editPat===k?"#ec4899":"#e2e8f0"}`,background:editPat===k?"rgba(236,72,153,.08)":"#fff",color:editPat===k?"#ec4899":"#94a3b8",cursor:"pointer",fontFamily:"IBM Plex Mono,monospace",fontSize:12,fontWeight:900}}>
              {k}<span style={{fontFamily:"inherit",fontSize:9}}> {p.s}〜</span>
            </button>))}
          </div>
          {editPat&&ptMap[editPat]&&<div style={{fontSize:11,color:ptMap[editPat].ic,background:ptMap[editPat].bg,borderRadius:6,padding:"5px 9px"}}>🕐 {ptMap[editPat].s}〜{ptMap[editPat].e}</div>}
        </div>
        {!editPat&&(<div className="fld"><label className="lb">または時間を直接入力</label>
          <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
            <div><label className="lb">出勤</label><TimeSelect value={editTime.st} onChange={v=>setEditTime(t=>Object.assign({},t,{st:v}))}/></div>
            <span style={{alignSelf:"flex-end",marginBottom:4,color:"#94a3b8"}}>〜</span>
            <div><label className="lb">退勤</label><TimeSelect value={editTime.en} onChange={v=>setEditTime(t=>Object.assign({},t,{en:v}))}/></div>
          </div>
        </div>)}
        <div className="fld"><label className="lb">休憩時間</label>
          <select value={editTime.b||"01:00"} onChange={e=>setEditTime(t=>Object.assign({},t,{b:e.target.value}))}
            style={{border:"1px solid #e2e8f0",borderRadius:6,padding:"3px 8px",fontSize:12,fontFamily:"inherit",outline:"none",background:"#fff"}}>
            {BREAK_OPTS.map(o=><option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div className="mf">
          <button className="btn bg" onClick={()=>setEditModal(null)}>キャンセル</button>
          <button className="btn bp" onClick={saveEdit} disabled={!editPat&&!editTime.st}>保存</button>
        </div>
      </div>
    </div>)}
    {shModal&&(<div className="ov" onClick={()=>setShModal(false)}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:520}}>
        <div className="mt">🚨 不足通知</div>
        <div style={{marginBottom:12}}>
          <label className="lb">募集する日付を選択</label>
          <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
            {shDates.map((s,i)=>(<button key={s.date} onClick={()=>setShDates(prev=>prev.map((x,j)=>j===i?Object.assign({},x,{sel:!x.sel}):x))}
              style={{padding:"4px 8px",borderRadius:6,border:`2px solid ${s.sel?((ptMap[s.pat]&&ptMap[s.pat].bd)||"#e2e8f0"):"#e2e8f0"}`,background:s.sel?((ptMap[s.pat]&&ptMap[s.pat].bg)||"#f8fafc"):"#fff",color:s.sel?((ptMap[s.pat]&&ptMap[s.pat].ic)||"#1e293b"):"#94a3b8",cursor:"pointer",fontSize:11,fontFamily:"inherit",fontWeight:s.sel?700:400}}>
              {month}/{s.d}({s.wd}) あと{s.q-s.c}人
            </button>))}
          </div>
        </div>
        <div style={{marginBottom:8}}>
          <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:6}}>
            <label className="lb" style={{marginBottom:0}}>通知文</label>
            <button className="btn bg sm" disabled={shMsgL} onClick={genShMsg}>{shMsgL?<><span className="spin"/>生成中…</>:"✨ AI生成"}</button>
          </div>
          {shMsg&&(<div className="slk"><textarea value={shMsg} onChange={e=>setShMsg(e.target.value)} style={{width:"100%",minHeight:80,background:"transparent",border:"none",outline:"none",color:"#d1d2d3",fontSize:11,fontFamily:"inherit",lineHeight:1.7,resize:"vertical"}}/></div>)}
        </div>
        <div className="mf">
          <button className="btn bg" onClick={()=>setShModal(false)}>キャンセル</button>
          <button className="btn bp" disabled={!shMsg} onClick={()=>{copyText(shMsg);toast_("送信しました");setShModal(false);}}>送信</button>
        </div>
      </div>
    </div>)}
    {notifModal&&(<div className="ov" onClick={()=>setNotifModal(false)}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:480}}>
        {!selNotif?(
          <>
            <div className="mt">📢 どの通知を送りますか？</div>
            <p style={{fontSize:11,color:"#64748b",marginBottom:14}}>送信する通知を選んでください</p>
            {notifs.map(n=>(<button key={n.id} onClick={()=>pickNotif(n)}
              style={{display:"block",width:"100%",textAlign:"left",padding:"12px 14px",borderRadius:8,border:"1px solid #e2e8f0",background:"#f8fafc",cursor:"pointer",marginBottom:8,fontFamily:"inherit"}}>
              <div style={{fontSize:13,fontWeight:700}}>{n.title}</div>
              <div style={{fontSize:10,color:"#94a3b8",marginTop:2}}>{n.day?`毎月${n.day}日ごろ`:"随時送信"}</div>
            </button>))}
            <div className="mf"><button className="btn bg" onClick={()=>setNotifModal(false)}>キャンセル</button></div>
          </>
        ):(
          <>
            <div className="mt">{selNotif.title}</div>
            <div className="slk" style={{marginBottom:12}}>
              <textarea value={notifMsg} onChange={e=>setNotifMsg(e.target.value)} style={{width:"100%",minHeight:120,background:"transparent",border:"none",outline:"none",color:"#d1d2d3",fontSize:11,fontFamily:"inherit",lineHeight:1.7,resize:"vertical"}}/>
            </div>
            <div className="mf">
              <button className="btn bg" onClick={()=>setSelNotif(null)}>← 戻る</button>
              <button className="btn bg" onClick={()=>setNotifModal(false)}>キャンセル</button>
              <button className="btn bp" onClick={()=>{copyText(notifMsg);toast_("送信しました");setNotifModal(false);}}>送信</button>
            </div>
          </>
        )}
      </div>
    </div>)}
  </div>);
}
function ChangePage({changes,setChanges,shifts,members,pats,isAdmin,toast_}){
  const [showP,setShowP]=useState(false);
  const [applyMd,setApplyMd]=useState(null);
  const [cancelMd,setCancelMd]=useState(null);
  const [selId,setSelId]=useState("");
  const [cview,setCview]=useState("board");
  const [slkM,setSlkM]=useState(null);
  const [slkT,setSlkT]=useState("");
  const [showSlk,setShowSlk]=useState(false);
  const td=new Date();
  const [form,setForm]=useState({postId:(members[0]&&members[0].id)||"",date:fdt(td.getFullYear(),td.getMonth()+1,td.getDate()),reason:"",urg:false});
  const ptMap={};pats.forEach(p=>{ptMap[p.key]=p;});
  const post=async()=>{
    const mem=members.find(m=>m.id===form.postId);if(!mem)return;
    const sd=shifts[`${mem.id}_${form.date}`];
    const p=sd&&sd.pattern?ptMap[sd.pattern]:null;
    const sl=sd&&sd.pattern&&p?`パターン${sd.pattern}（${p.s}〜${p.e}）`:sd&&sd.st?`${sd.st}〜${sd.en}`:"未設定";
    setChanges(prev=>prev.concat([{id:Date.now(),postId:form.postId,postName:mem.name,date:form.date,shift:sl,reason:form.reason,urg:form.urg,status:"open",applicants:[],at:new Date().toISOString()}]));
    setShowP(false);toast_("募集を投稿しました");setSlkT("📢 #シフト連絡（全体）");
    try{setSlkM(await callAI(`以下の情報をSlack通知文に変換。フォーマット:「🔄 ○○さんが ○月○日（△△）のシフトに入れる方を探しています。入れそうな方は応募またはSlackへご連絡ください🙏」厳守。送信テキストのみ出力。前置き不要。投稿者:${mem.name}、日付:${form.date}、シフト:${sl}${form.reason?"、理由:"+form.reason:""}${form.urg?"【緊急】":""}。`,150));}
    catch(_){setSlkM(`🔄 ${mem.name}さんが ${form.date}（${sl}）のシフトに入れる方を探しています。入れそうな方は応募またはSlackへご連絡ください🙏${form.urg?" 【緊急】":""}`);}
    setShowSlk(true);
  };
  const doApply=async()=>{
    const c=applyMd,ap=members.find(m=>m.id===selId);if(!ap)return;
    if(c.applicants&&c.applicants.find(a=>a.id===selId)){toast_("すでに応募済みです","er");setApplyMd(null);setSelId("");return;}
    setChanges(prev=>prev.map(x=>x.id===c.id?Object.assign({},x,{applicants:[...(x.applicants||[]),{id:ap.id,name:ap.name}]}):x));
    setApplyMd(null);setSelId("");toast_("応募しました！管理者に通知されます");
  };
  const doCancel=()=>{
    const c=cancelMd;if(!c)return;
    const p=members.find(m=>m.id===selId);if(!p)return;
    if(p.id!==c.postId){toast_("投稿者本人のみ取り消せます","er");setCancelMd(null);setSelId("");return;}
    setChanges(prev=>prev.map(x=>x.id===c.id?Object.assign({},x,{status:"closed"}):x));
    setCancelMd(null);setSelId("");toast_("募集を取り消しました");
  };
  return(<div>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4,gap:8,flexWrap:"wrap"}}>
      <div><h2 style={{fontSize:15,fontWeight:800}}>🔄 シフトチェンジ掲示板</h2>
        <p style={{color:"#94a3b8",fontSize:11,marginTop:2}}>シフトに入れなくなった日を投稿 → 代わりに入れる方が応募 → 管理者が最終調整</p>
      </div>
      <div style={{display:"flex",gap:6,alignItems:"center"}}>
        <div style={{display:"flex",background:"#f1f5f9",borderRadius:8,padding:2}}>
          {[["board","📋 掲示板"],["log","📜 履歴"]].map(([v,l])=>(
            <button key={v} onClick={()=>setCview(v)} style={{padding:"4px 10px",borderRadius:6,border:"none",cursor:"pointer",fontSize:11,fontWeight:600,fontFamily:"inherit",background:cview===v?"#fff":"transparent",color:cview===v?"#1e293b":"#94a3b8",boxShadow:cview===v?"0 1px 3px rgba(0,0,0,.1)":"none"}}>{l}</button>
          ))}
        </div>
        {cview==="board"&&<button className="btn bp sm" onClick={()=>setShowP(true)}>＋ 募集</button>}
      </div>
    </div>
    {showSlk&&(<div className="ov" onClick={()=>{setShowSlk(false);setSlkM(null);}}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:480}}>
        <div className="mt">💬 {slkT}</div>
        <div className="slk" style={{marginBottom:12}}>
          <textarea value={slkM||""} onChange={e=>setSlkM(e.target.value)} style={{width:"100%",minHeight:100,background:"transparent",border:"none",outline:"none",color:"#d1d2d3",fontSize:11,fontFamily:"inherit",lineHeight:1.7,resize:"vertical"}}/>
        </div>
        <div className="mf">
          <button className="btn bg" onClick={()=>{setShowSlk(false);setSlkM(null);}}>閉じる</button>
          <button className="btn bp" onClick={()=>{copyText(slkM||"");toast_("送信しました");setShowSlk(false);setSlkM(null);}}>送信</button>
        </div>
      </div>
    </div>)}
    {cview==="log"&&(<div>
      {changes.length===0?<div style={{textAlign:"center",padding:"40px 0",color:"#94a3b8"}}>履歴なし</div>
      :<div>
        <p style={{fontSize:11,color:"#94a3b8",marginBottom:10}}>全{changes.length}件（新しい順）</p>
        <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:12,overflow:"hidden"}}>
          {changes.slice().reverse().map(c=>{
            const dow=JD[new Date(c.date+"T00:00:00").getDay()];
            const confirmed=c.status==="confirmed"&&c.confirmedName;
            return(<div key={c.id} style={{display:"flex",gap:10,padding:"10px 14px",borderBottom:"1px solid #f1f5f9",alignItems:"flex-start"}}>
              <span className="av" style={{background:avc(c.postId),width:26,height:26,fontSize:9,flexShrink:0}}>{ini(c.postName)}</span>
              <div style={{flex:1}}>
                <div style={{fontSize:12,fontWeight:700,display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                  {c.postName}<span style={{fontSize:10,color:"#94a3b8",fontWeight:400}}>{c.date}（{dow}）{c.shift}</span>
                  {c.urg&&<span className="bdg" style={{background:"#fee2e2",color:"#ef4444",fontSize:9}}>🔥緊急</span>}
                </div>
                {c.reason&&<div style={{fontSize:10,color:"#64748b",marginTop:2}}>理由：{c.reason}</div>}
                <div style={{fontSize:10,marginTop:3}}>
                  {confirmed?<span style={{color:"#15803d",fontWeight:700}}>✅ {c.postName} → {c.confirmedNames?c.confirmedNames.join("・"):c.confirmedName} でシフトチェンジ確定</span>
                  :c.status==="closed"?<span style={{color:"#94a3b8"}}>取り消し済み</span>
                  :(c.applicants&&c.applicants.length>0)?isAdmin?<span style={{color:"#0284c7"}}>応募者：{c.applicants.map(a=>a.name).join("・")}</span>:<span style={{color:"#0284c7"}}>{c.applicants.length}名が応募中</span>
                  :<span style={{color:"#f59e0b"}}>募集中</span>}
                </div>
              </div>
              <span className="bdg" style={{background:c.status==="confirmed"?"#dcfce7":c.status==="closed"?"#f1f5f9":"#fef9c3",color:c.status==="confirmed"?"#15803d":c.status==="closed"?"#94a3b8":"#92400e",flexShrink:0,fontSize:9}}>
                {c.status==="confirmed"?"確定":c.status==="closed"?"締切":"募集中"}
              </span>
            </div>);
          })}
        </div>
      </div>}
    </div>)}
    {cview==="board"&&(<div>
      {changes.length===0?<div style={{textAlign:"center",padding:"40px 0",color:"#94a3b8"}}><div style={{fontSize:32,marginBottom:8}}>🔄</div>募集なし</div>
      :changes.slice().reverse().map(c=>{
        const dow=JD[new Date(c.date+"T00:00:00").getDay()];
        return(<div key={c.id} className={"cc"+(c.urg?" urg":"")}>
          <div style={{display:"flex",justifyContent:"space-between",gap:8}}>
            <div style={{display:"flex",gap:8}}>
              <span className="av" style={{background:avc(c.postId),width:26,height:26,fontSize:9}}>{ini(c.postName)}</span>
              <div>
                <div style={{fontWeight:700,fontSize:12,display:"flex",gap:5,alignItems:"center"}}>{c.postName}{c.urg&&<span className="bdg" style={{background:"#fee2e2",color:"#ef4444"}}>🔥緊急</span>}</div>
                <div style={{color:"#94a3b8",fontSize:10}}>{c.date}（{dow}）{c.shift}</div>
                {c.reason&&<div style={{fontSize:10,marginTop:1}}>💬{c.reason}</div>}
                {(c.applicants&&c.applicants.length>0)&&(<div style={{marginTop:4}}>
                  {isAdmin?(<div><div style={{fontSize:10,color:"#64748b",marginBottom:4}}>応募者：</div>
                    {c.applicants.map(a=>{
                      const isConfirmed=c.confirmedIds?c.confirmedIds.includes(a.id):(c.confirmedId===a.id&&c.status==="confirmed");
                      return(<div key={a.id} style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}>
                        <span className="av" style={{background:avc(a.id),width:16,height:16,fontSize:7}}>{ini(a.name)}</span>
                        <span style={{fontSize:11}}>{a.name}</span>
                        {!isConfirmed?(
                          <button className="btn bgs xs" onClick={()=>setChanges(prev=>prev.map(x=>{
                            if(x.id!==c.id)return x;
                            const ids=[...(x.confirmedIds||[]),a.id];
                            const names=[...(x.confirmedNames||[]),a.name];
                            return Object.assign({},x,{status:"confirmed",confirmedId:a.id,confirmedName:a.name,confirmedIds:ids,confirmedNames:names});
                          }))}>確定</button>
                        ):(
                          <><span style={{fontSize:10,color:"#15803d",fontWeight:700}}>✅ 確定</span>
                          <button className="btn bg xs" style={{color:"#ef4444",borderColor:"#fecaca",fontSize:9}} onClick={()=>setChanges(prev=>prev.map(x=>{
                            if(x.id!==c.id)return x;
                            const ids=(x.confirmedIds||[]).filter(id=>id!==a.id);
                            const names=(x.confirmedNames||[]).filter(n=>n!==a.name);
                            return Object.assign({},x,{confirmedIds:ids,confirmedNames:names,status:ids.length>0?"confirmed":"open",confirmedId:ids[0]||null,confirmedName:names[0]||null});
                          }))}>取消</button></>
                        )}
                      </div>);
                    })}</div>)
                  :<div style={{fontSize:10,color:"#16a34a"}}>{c.status==="confirmed"?`✅ ${c.confirmedNames?c.confirmedNames.length+"名が確定済み":"確定済み"} → 管理者が調整中`:`🙋 ${c.applicants.length}名が応募中 → 管理者が調整中`}</div>}
                </div>)}
              </div>
            </div>
            <span className="bdg" style={{background:c.status==="open"?"#dcfce7":c.status==="confirmed"?"#dbeafe":"#f1f5f9",color:c.status==="open"?"#15803d":c.status==="confirmed"?"#1d4ed8":"#64748b",alignSelf:"flex-start"}}>
              {c.status==="open"?`募集中${(c.applicants&&c.applicants.length>0)?`（${c.applicants.length}名）`:""}`:c.status==="confirmed"?"確定済":"締切"}
            </span>
          </div>
          <div style={{marginTop:8,paddingTop:8,borderTop:"1px solid #f1f5f9",display:"flex",gap:4,flexWrap:"wrap"}}>
            {c.status==="open"&&<button className="btn bp sm" onClick={()=>{setApplyMd(c);setSelId("");}}>🙋 応募する</button>}
            {c.status==="open"&&<button className="btn bg sm" onClick={()=>{setCancelMd(c);setSelId("");}}>取り消す</button>}
            {isAdmin&&<button className="btn bg sm" style={{marginLeft:"auto",color:"#ef4444",borderColor:"#fecaca"}} onClick={()=>{setChanges(prev=>prev.filter(x=>x.id!==c.id));toast_("削除しました");}}>🗑 削除</button>}
          </div>
        </div>);
      })}
    </div>)}
    {applyMd&&(<div className="ov" onClick={()=>setApplyMd(null)}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:340}}>
        <div className="mt">🙋 応募する</div>
        <p style={{fontSize:12,color:"#64748b",marginBottom:12}}>{applyMd.postName}さんの{applyMd.date}（{applyMd.shift}）に応募します。あなたの名前を選んでください。</p>
        <div className="fld"><label className="lb">あなたの名前</label>
          <select className="inp" value={selId} onChange={e=>setSelId(e.target.value)}>
            <option value="">-- 選択 --</option>
            {members.filter(m=>m.id!==applyMd.postId).map(m=>(<option key={m.id} value={m.id}>{m.name}</option>))}
          </select>
        </div>
        <div className="mf"><button className="btn bg" onClick={()=>setApplyMd(null)}>キャンセル</button><button className="btn bp" disabled={!selId} onClick={doApply}>応募する</button></div>
      </div>
    </div>)}
    {cancelMd&&(<div className="ov" onClick={()=>setCancelMd(null)}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:340}}>
        <div className="mt">取り消す</div>
        <p style={{fontSize:12,color:"#64748b",marginBottom:12}}>投稿者本人のみ取り消せます。あなたの名前を選んでください。</p>
        <div className="fld"><label className="lb">あなたの名前</label>
          <select className="inp" value={selId} onChange={e=>setSelId(e.target.value)}>
            <option value="">-- 選択 --</option>
            {members.map(m=>(<option key={m.id} value={m.id}>{m.name}</option>))}
          </select>
        </div>
        <div className="mf"><button className="btn bg" onClick={()=>setCancelMd(null)}>キャンセル</button><button className="btn brd" disabled={!selId} onClick={doCancel}>取り消す</button></div>
      </div>
    </div>)}
    {showP&&(<div className="ov" onClick={()=>setShowP(false)}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="mt">🔄 シフトチェンジ募集</div>
        <div className="fld"><label className="lb">あなたの名前</label>
          <select className="inp" value={form.postId} onChange={e=>setForm(f=>Object.assign({},f,{postId:e.target.value}))}>
            <option value="">-- 選択 --</option>{members.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div className="fld"><label className="lb">対象日</label><input type="date" className="inp" value={form.date} onChange={e=>setForm(f=>Object.assign({},f,{date:e.target.value}))}/></div>
        <div className="fld"><label className="lb">理由（任意）</label><input type="text" className="inp" placeholder="例：急用ができました" value={form.reason} onChange={e=>setForm(f=>Object.assign({},f,{reason:e.target.value}))}/></div>
        <label style={{display:"flex",gap:7,cursor:"pointer",fontSize:11,marginBottom:12}}>
          <input type="checkbox" checked={form.urg} onChange={e=>setForm(f=>Object.assign({},f,{urg:e.target.checked}))}/>
          <span style={{color:form.urg?"#ef4444":"#94a3b8"}}>🔥 緊急</span>
        </label>
        <div className="mf"><button className="btn bg" onClick={()=>setShowP(false)}>キャンセル</button><button className="btn bp" onClick={post}>募集する</button></div>
      </div>
    </div>)}
  </div>);
}
function CsvPage({shifts,members,pats,toast_,iY,iM}){
  const today=new Date();
  const [year,setYear]=useState(iY||today.getFullYear());
  const [month,setMonth]=useState(iM||today.getMonth()+1);
  const [prev,setPrev]=useState(false);
  const days=dim(year,month);
  const buildRows=()=>{const rows=[];members.forEach(m=>{for(let d=1;d<=days;d++){const date=fdt(year,month,d),s=shifts[`${m.id}_${date}`];if(!s||(!s.pattern&&!s.st)){rows.push([m.id,m.name,date,"","","","","","","","","","","",""]);continue;}if(s.pattern){rows.push([m.id,m.name,date,s.pattern,"","","","","","","","","","",""]);continue;}rows.push([m.id,m.name,date,"","所定労働日",s.st||"",s.en||"",s.b||"01:00","","","","","","",""]);}}); return rows;};
  const download=()=>{
    const hdr="従業員番号,freee人事労務での表示名（編集しても反映されません）,日付,勤務パターンコード,勤務日種別,出勤時刻,退勤時刻,休憩時間,休憩開始1,休憩終了1,休憩開始2,休憩終了2,休憩開始3,休憩終了3,夜勤日種別";
    const rows=buildRows(),blob=new Blob(["\uFEFF"+[hdr,...rows.map(r=>r.join(","))].join("\n")],{type:"text/csv;charset=utf-8;"});
    const url=URL.createObjectURL(blob),a=document.createElement("a");
    a.href=url;a.download=`シフト_${year}_${String(month).padStart(2,"0")}.csv`;a.click();URL.revokeObjectURL(url);toast_("CSVをダウンロードしました！");
  };
  const rows=buildRows(),filled=rows.filter(r=>r[3]||r[4]).length;
  return(<div>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10,gap:8,flexWrap:"wrap"}}>
      <h2 style={{fontSize:15,fontWeight:800}}>⬇ freee用CSV出力</h2>
      <div style={{display:"flex",gap:4}}>
        <button className="btn bg sm" onClick={()=>navM(-1,month,year,setMonth,setYear)}>‹</button>
        <span style={{fontSize:11,fontWeight:700,fontFamily:"IBM Plex Mono",alignSelf:"center"}}>{year}/{String(month).padStart(2,"0")}</span>
        <button className="btn bg sm" onClick={()=>navM(1,month,year,setMonth,setYear)}>›</button>
      </div>
    </div>
    <div style={{display:"flex",gap:8,marginBottom:10}}>
      {[["#3b82f6",members.length,"メンバー数"],["#22c55e",filled,"登録済み"],["#f59e0b",rows.length-filled,"未設定"]].map(([c,n,l])=>(
        <div key={l} style={{background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:10,padding:11,textAlign:"center",flex:1}}>
          <div style={{fontSize:22,fontWeight:700,fontFamily:"IBM Plex Mono",color:c}}>{n}</div>
          <div style={{fontSize:10,color:"#64748b",marginTop:2}}>{l}</div>
        </div>
      ))}
    </div>
    <div style={{display:"flex",gap:8,marginBottom:12}}>
      <button className="btn bp" onClick={download}>⬇ CSVダウンロード</button>
      <button className="btn bg" onClick={()=>setPrev(!prev)}>{prev?"非表示":"プレビュー"}</button>
    </div>
    {prev&&(<div style={{overflowX:"auto",background:"#f8fafc",borderRadius:8,padding:8,border:"1px solid #e2e8f0"}}>
      <table style={{fontSize:9,borderCollapse:"collapse",fontFamily:"IBM Plex Mono,monospace",whiteSpace:"nowrap"}}>
        <thead><tr>{["従業員番号","表示名","日付","パターン","勤務日種別","出勤","退勤","休憩"].map(h=>(
          <th key={h} style={{padding:"3px 7px",borderBottom:"1px solid #e2e8f0",color:"#94a3b8",textAlign:"left"}}>{h}</th>
        ))}</tr></thead>
        <tbody>{rows.slice(0,62).map((r,i)=>(
          <tr key={i} style={{background:(r[3]||r[4])?"#eff6ff":""}}>
            {r.slice(0,8).map((c,j)=><td key={j} style={{padding:"2px 7px",color:c?"#1e293b":"#cbd5e1"}}>{c||"—"}</td>)}
          </tr>
        ))}{rows.length>62&&<tr><td colSpan={8} style={{padding:7,color:"#94a3b8"}}>…他{rows.length-62}行</td></tr>}</tbody>
      </table>
    </div>)}
  </div>);
}
function MembersPage({members,setMembers,toast_}){
  const dragIdx=useRef(null);
  const [editId,setEditId]=useState(null);
  const [editForm,setEditForm]=useState({id:"",name:"",tier:2});
  const [showAdd,setShowAdd]=useState(false);
  const [addForm,setAddForm]=useState({id:"",name:"",tier:2});
  const onDrop=i=>{if(dragIdx.current===null||dragIdx.current===i)return;const arr=members.slice();const[mv]=arr.splice(dragIdx.current,1);arr.splice(i,0,mv);setMembers(arr);dragIdx.current=null;};
  return(<div>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4}}>
      <h2 style={{fontSize:15,fontWeight:800}}>👥 メンバー管理</h2>
      <button className="btn bp sm" onClick={()=>setShowAdd(v=>!v)}>＋ メンバー追加</button>
    </div>
    <p style={{fontSize:11,color:"#94a3b8",marginBottom:12}}>⠿ ドラッグで並び替え　名前をクリックで編集</p>
    {showAdd&&(<div className="card" style={{marginBottom:12,borderColor:"#bfdbfe"}}>
      <div style={{fontSize:12,fontWeight:700,marginBottom:10}}>＋ 新規メンバー追加</div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"flex-end"}}>
        <div><label className="lb">社員番号</label><input className="inp" style={{width:120}} placeholder="2000057" value={addForm.id} onChange={e=>setAddForm(f=>Object.assign({},f,{id:e.target.value}))}/></div>
        <div><label className="lb">名前</label><input className="inp" style={{width:140}} placeholder="山田 太郎" value={addForm.name} onChange={e=>setAddForm(f=>Object.assign({},f,{name:e.target.value}))}/></div>
        <div><label className="lb">Tier</label>
          <select className="inp" style={{width:90}} value={addForm.tier} onChange={e=>setAddForm(f=>Object.assign({},f,{tier:Number(e.target.value)}))}>
            {[1,2,3,4].map(x=><option key={x} value={x}>Tier {x}</option>)}
          </select></div>
        <button className="btn bgs" onClick={()=>{if(!addForm.id||!addForm.name){toast_("IDと名前は必須です","er");return;}if(members.find(m=>m.id===addForm.id)){toast_("このIDは既に存在します","er");return;}setMembers(prev=>prev.concat([{id:addForm.id,name:addForm.name,tier:addForm.tier}]));setAddForm({id:"",name:"",tier:2});setShowAdd(false);toast_(`${addForm.name}さんを追加しました`);}}>追加</button>
        <button className="btn bg" onClick={()=>setShowAdd(false)}>キャンセル</button>
      </div>
    </div>)}
    <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:12,overflow:"hidden"}}>
      {members.map((m,i)=>(
        <div key={m.id} onDragOver={e=>e.preventDefault()} onDrop={()=>onDrop(i)} style={{borderBottom:"1px solid #f1f5f9",background:editId===m.id?"#eff6ff":"#fff"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px"}}
            onMouseEnter={e=>{if(editId!==m.id)e.currentTarget.style.background="#f8fafc";}}
            onMouseLeave={e=>{if(editId!==m.id)e.currentTarget.style.background="transparent";}}>
            <span draggable onDragStart={()=>{dragIdx.current=i;}} style={{color:"#cbd5e1",fontSize:14,flexShrink:0,cursor:"grab"}}>⠿</span>
            <span className="av" style={{background:avc(m.id),width:30,height:30,fontSize:11,flexShrink:0}}>{ini(m.name)}</span>
            <div style={{flex:1,cursor:"pointer"}} onClick={()=>{if(editId===m.id){setEditId(null);}else{setEditId(m.id);setEditForm({id:m.id,name:m.name,tier:m.tier});}}}>
              <div style={{fontSize:12,fontWeight:700}}>{editId===m.id?editForm.name||m.name:m.name}</div>
              <div style={{fontSize:10,color:"#94a3b8",fontFamily:"IBM Plex Mono"}}>{editId===m.id?editForm.id||m.id:m.id}</div>
              {editId!==m.id&&<div style={{fontSize:9,color:"#cbd5e1",marginTop:1}}>クリックで編集</div>}
            </div>
            {editId===m.id?(
              <div style={{display:"flex",gap:5}}>
                <button className="btn bgs sm" onClick={()=>{if(!editForm.id||!editForm.name){toast_("IDと名前は必須です","er");return;}setMembers(prev=>prev.map(x=>x.id===editId?{id:editForm.id,name:editForm.name,tier:editForm.tier}:x));setEditId(null);toast_("更新しました");}}>保存</button>
                <button className="btn bg sm" onClick={()=>setEditId(null)}>キャンセル</button>
                <button className="btn brd sm" onClick={()=>{if(!window.confirm("削除しますか？"))return;setMembers(prev=>prev.filter(x=>x.id!==m.id));toast_("削除しました");}}>削除</button>
              </div>
            ):(
              <select value={m.tier} onChange={e=>setMembers(prev=>prev.map(x=>x.id===m.id?Object.assign({},x,{tier:Number(e.target.value)}):x))}
                style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:6,padding:"4px 7px",fontSize:11,color:"#1e293b",cursor:"pointer",outline:"none",fontFamily:"inherit"}}>
                {[1,2,3,4].map(x=><option key={x} value={x}>Tier {x}</option>)}
              </select>
            )}
          </div>
          {editId===m.id&&(<div style={{padding:"0 14px 12px 54px",display:"flex",gap:8,flexWrap:"wrap",alignItems:"flex-end"}}>
            <div><label className="lb">社員番号</label><input className="inp" style={{width:120}} value={editForm.id} onChange={e=>setEditForm(f=>Object.assign({},f,{id:e.target.value}))}/></div>
            <div><label className="lb">名前</label><input className="inp" style={{width:140}} value={editForm.name} onChange={e=>setEditForm(f=>Object.assign({},f,{name:e.target.value}))}/></div>
            <div><label className="lb">Tier</label>
              <select className="inp" style={{width:90}} value={editForm.tier} onChange={e=>setEditForm(f=>Object.assign({},f,{tier:Number(e.target.value)}))}>
                {[1,2,3,4].map(x=><option key={x} value={x}>Tier {x}</option>)}
              </select></div>
          </div>)}
        </div>
      ))}
    </div>
    <p style={{fontSize:10,color:"#94a3b8",marginTop:8}}>合計 {members.length}名</p>
  </div>);
}
function SettingsPage({pats,setPats,notifs,setNotifs,toast_}){
  const [stab,setStab]=useState("pattern");
  const [ntab,setNtab]=useState("regular");
  const [editNotif,setEditNotif]=useState(null);
  const [pwCur,setPwCur]=useState("");
  const [pwNew,setPwNew]=useState("");
  const [pwNew2,setPwNew2]=useState("");
  const [currentPW,setCurrentPW]=useState(()=>ST["v13_pw"]||PW);
  const regularNotifs=notifs.filter(n=>n.day>0);
  const ondemandNotifs=notifs.filter(n=>!n.day||n.day===0);
  const NotifCard=({n,i,allNotifs})=>{
    const isEditing=editNotif===n.id;
    return(<div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:10,marginBottom:8,overflow:"hidden"}}>
      <div style={{display:"flex",gap:8,alignItems:"center",padding:"12px 14px"}}>
        <div style={{display:"flex",flexDirection:"column",gap:2,flexShrink:0}}>
          <button disabled={i===0} onClick={()=>{const gi=notifs.indexOf(allNotifs[i-1]),idx=notifs.indexOf(n);const a=notifs.slice();[a[gi],a[idx]]=[a[idx],a[gi]];setNotifs(a);}}
            style={{border:"1px solid #e2e8f0",borderRadius:4,background:i===0?"#f8fafc":"#fff",cursor:i===0?"not-allowed":"pointer",fontSize:9,color:"#94a3b8",padding:"2px 5px"}}>▲</button>
          <button disabled={i===allNotifs.length-1} onClick={()=>{const gi2=notifs.indexOf(allNotifs[i+1]),idx=notifs.indexOf(n);const a=notifs.slice();[a[gi2],a[idx]]=[a[idx],a[gi2]];setNotifs(a);}}
            style={{border:"1px solid #e2e8f0",borderRadius:4,background:i===allNotifs.length-1?"#f8fafc":"#fff",cursor:i===allNotifs.length-1?"not-allowed":"pointer",fontSize:9,color:"#94a3b8",padding:"2px 5px"}}>▼</button>
        </div>
        <div style={{flex:1,cursor:"pointer"}} onClick={()=>setEditNotif(isEditing?null:n.id)}>
          <div style={{fontSize:13,fontWeight:700}}>{n.title}</div>
          <div style={{fontSize:10,color:"#94a3b8",marginTop:2}}>{n.day?`毎月${n.day}日ごろ`:"随時"}</div>
        </div>
        <button className="btn bg sm" onClick={()=>setEditNotif(isEditing?null:n.id)} style={{color:isEditing?"#3b82f6":"#475569",borderColor:isEditing?"#3b82f6":"#e2e8f0"}}>{isEditing?"▲ 閉じる":"✏️ 編集"}</button>
        <button className="btn brd sm" onClick={()=>{if(!window.confirm(`「${n.title}」を削除しますか？`))return;setNotifs(prev=>prev.filter(x=>x.id!==n.id));}}>削除</button>
      </div>
      {isEditing&&(<div style={{borderTop:"1px solid #f1f5f9",padding:"14px",background:"#fafafa"}}>
        <div className="fld"><label className="lb">タイトル</label>
          <input className="inp" value={n.title} onChange={e=>setNotifs(prev=>prev.map(x=>x.id===n.id?Object.assign({},x,{title:e.target.value}):x))}/></div>
        <div className="fld"><label className="lb">送信日（0=随時）</label>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <input type="number" className="inp" style={{width:70}} min={0} max={28} value={n.day} onChange={e=>setNotifs(prev=>prev.map(x=>x.id===n.id?Object.assign({},x,{day:Number(e.target.value)}):x))}/>
            <span style={{fontSize:11,color:"#64748b"}}>日ごろ（0=随時）</span>
          </div>
        </div>
        <div className="fld">
          <label className="lb">通知文テンプレート</label>
          <div style={{fontSize:9,color:"#94a3b8",marginBottom:4}}>変数：{"{{nextMonth}}"} {"{{notifDay}}"} {"{{deadline}}"}</div>
          <textarea value={n.tmpl} onChange={e=>setNotifs(prev=>prev.map(x=>x.id===n.id?Object.assign({},x,{tmpl:e.target.value}):x))}
            style={{width:"100%",minHeight:100,border:"1px solid #e2e8f0",borderRadius:8,padding:"10px",fontSize:12,fontFamily:"inherit",outline:"none",lineHeight:1.7,resize:"vertical"}}/>
        </div>
        <div style={{display:"flex",justifyContent:"flex-end"}}>
          <button className="btn bp sm" onClick={()=>{toast_("保存しました");setEditNotif(null);}}>保存して閉じる</button>
        </div>
      </div>)}
    </div>);
  };
  return(<div>
    <h2 style={{fontSize:15,fontWeight:800,marginBottom:12}}>🔧 設定</h2>
    <div className="sub-nav" style={{marginBottom:14}}>
      {[["pattern","⚙️ 勤務パターン"],["notif","📢 通知設定"],["pw","🔑 パスワード"]].map(([id,lb])=>(
        <button key={id} className={"snb"+(stab===id?" on":"")} onClick={()=>setStab(id)}>{lb}</button>
      ))}
    </div>
    {stab==="pattern"&&(<div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <p style={{fontSize:11,color:"#94a3b8"}}>勤務パターンの追加・編集・削除・色設定ができます</p>
        <button className="btn bp sm" onClick={()=>{const key=prompt("パターンコード（1〜2文字）");if(!key||pats.find(p=>p.key===key)){toast_("無効またはすでに存在するコードです","er");return;}setPats(prev=>prev.concat([{key,d:"新しいパターン",s:"10:00",e:"19:00",b:60,q:1,...COLOR_PRESETS[0]}]));toast_(`${key}を追加しました`);}}>＋ 追加</button>
      </div>
      <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:12,overflow:"hidden",marginBottom:12}}>
        {pats.map((p,i)=>(
          <div key={p.key} style={{padding:"10px 14px",borderBottom:"1px solid #f1f5f9"}}>
            <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:8}}>
              <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:28,height:28,borderRadius:6,background:p.cb,color:p.ct,fontSize:13,fontWeight:900,fontFamily:"IBM Plex Mono,monospace",flexShrink:0}}>{p.key}</span>
              <input value={p.d} onChange={e=>setPats(prev=>prev.map((x,j)=>j===i?Object.assign({},x,{d:e.target.value}):x))} style={{flex:1,border:"1px solid #e2e8f0",borderRadius:6,padding:"5px 8px",fontSize:12,fontFamily:"inherit",outline:"none"}}/>
              <button className="btn brd sm" onClick={()=>{if(!window.confirm(`${p.key}を削除しますか？`))return;setPats(prev=>prev.filter((_,j)=>j!==i));toast_(`${p.key}を削除しました`);}}>削除</button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"80px 80px 80px 60px",gap:6,alignItems:"center",marginBottom:8}}>
              <div><label className="lb">開始</label><TimeSelect value={p.s} onChange={v=>setPats(prev=>prev.map((x,j)=>j===i?Object.assign({},x,{s:v}):x))}/></div>
              <div><label className="lb">終了</label><TimeSelect value={p.e} onChange={v=>setPats(prev=>prev.map((x,j)=>j===i?Object.assign({},x,{e:v}):x))}/></div>
              <div><label className="lb">休憩</label>
                <select value={p.b||60} onChange={e=>setPats(prev=>prev.map((x,j)=>j===i?Object.assign({},x,{b:Number(e.target.value)}):x))}
                  style={{border:"1px solid #e2e8f0",borderRadius:6,padding:"3px 4px",fontSize:12,fontFamily:"inherit",outline:"none",background:"#fff"}}>
                  {[0,30,45,60,75,90,120].map(m=><option key={m} value={m}>{m}分</option>)}
                </select>
              </div>
              <div><label className="lb">必要人数</label><input type="number" min={1} max={30} value={p.q} onChange={e=>setPats(prev=>prev.map((x,j)=>j===i?Object.assign({},x,{q:Number(e.target.value)}):x))} style={{border:"1px solid #e2e8f0",borderRadius:6,padding:"5px 8px",fontSize:12,fontFamily:"inherit",outline:"none",width:"100%"}}/></div>
            </div>
            <div><label className="lb">色</label>
              <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                {COLOR_PRESETS.map((col,ci)=>(<button key={ci} onClick={()=>setPats(prev=>prev.map((x,j)=>j===i?Object.assign({},x,{bg:col.bg,bd:col.bd,ic:col.ic,cb:col.cb,ct:col.ct}):x))}
                  style={{width:24,height:24,borderRadius:6,background:col.cb,border:`2px solid ${p.cb===col.cb?"#1e293b":col.bd}`,cursor:"pointer"}} title={col.label}/>))}
              </div>
            </div>
          </div>
        ))}
      </div>
      <button className="btn bp" onClick={()=>toast_("勤務パターンを保存しました")}>保存する</button>
    </div>)}
    {stab==="notif"&&(<div>
      <div style={{display:"flex",gap:0,borderBottom:"1px solid #f1f5f9",marginBottom:14}}>
        {[["regular","📅 定期通知"],["ondemand","📋 随時通知"]].map(([id,lb])=>(
          <button key={id} onClick={()=>setNtab(id)}
            style={{padding:"7px 14px",border:"none",borderBottom:`2px solid ${ntab===id?"#3b82f6":"transparent"}`,background:"transparent",color:ntab===id?"#3b82f6":"#64748b",cursor:"pointer",fontFamily:"inherit",fontSize:11,fontWeight:ntab===id?700:500,marginBottom:-1}}>
            {lb}
          </button>
        ))}
      </div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <p style={{fontSize:11,color:"#94a3b8"}}>{ntab==="regular"?"毎月決まった日に送る通知（送信日を1以上に設定）":"随時送る通知（送信日=0）"}</p>
        <button className="btn bp sm" onClick={()=>{const newN={id:Date.now(),title:"新しい通知",day:ntab==="regular"?15:0,auto:false,tmpl:""};setNotifs(prev=>prev.concat([newN]));setEditNotif(newN.id);}}>＋ 追加</button>
      </div>
      {ntab==="regular"&&(regularNotifs.length===0
        ?<p style={{fontSize:11,color:"#94a3b8",textAlign:"center",padding:"20px 0"}}>定期通知はまだありません</p>
        :regularNotifs.map((n,i)=><NotifCard key={n.id} n={n} i={i} allNotifs={regularNotifs}/>))}
      {ntab==="ondemand"&&(ondemandNotifs.length===0
        ?<p style={{fontSize:11,color:"#94a3b8",textAlign:"center",padding:"20px 0"}}>随時通知はまだありません</p>
        :ondemandNotifs.map((n,i)=><NotifCard key={n.id} n={n} i={i} allNotifs={ondemandNotifs}/>))}
    </div>)}
    {stab==="pw"&&(<div>
      <div className="card" style={{maxWidth:360}}>
        <div style={{fontSize:13,fontWeight:700,marginBottom:14}}>🔑 管理者パスワード変更</div>
        <div className="fld"><label className="lb">現在のパスワード</label>
          <input type="password" className="inp" value={pwCur} onChange={e=>setPwCur(e.target.value)} placeholder="現在のパスワード"/></div>
        <div className="fld"><label className="lb">新しいパスワード</label>
          <input type="password" className="inp" value={pwNew} onChange={e=>setPwNew(e.target.value)} placeholder="新しいパスワード（4文字以上）"/></div>
        <div className="fld"><label className="lb">新しいパスワード（確認）</label>
          <input type="password" className="inp" value={pwNew2} onChange={e=>setPwNew2(e.target.value)} placeholder="もう一度入力"/></div>
        <button className="btn bp" onClick={()=>{
          if(pwCur!==currentPW){toast_("現在のパスワードが違います","er");return;}
          if(!pwNew||pwNew.length<4){toast_("4文字以上で設定してください","er");return;}
          if(pwNew!==pwNew2){toast_("新しいパスワードが一致しません","er");return;}
          setCurrentPW(pwNew);sv("v13_pw",pwNew);
          setPwCur("");setPwNew("");setPwNew2("");
          toast_("パスワードを変更しました");
        }}>変更する</button>
      </div>
    </div>)}
  </div>);
}
