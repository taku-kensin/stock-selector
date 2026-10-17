/* ⑤-A v0.16.2 実働PWA — J-Quantsキーはブラウザに渡さない。正式150社は読取のみ。 */
'use strict';
const MAGIC='JQ5A1', ITER=200000;
const AXES=[['fundamental','ファンダ'],['ir','決算・IR'],['valuation','バリュエーション'],['supply','需給'],['rs','TOPIX相対'],['chart','チャート'],['target','+12%適合']];
const BASE_WEIGHTS={fundamental:20,ir:25,valuation:10,supply:20,rs:15,chart:20,target:0};
const PRESETS={
  '基本設定':BASE_WEIGHTS,
  '成長重視':{fundamental:30,ir:30,valuation:5,supply:10,rs:10,chart:15,target:0},
  '財務重視':{fundamental:40,ir:25,valuation:10,supply:10,rs:5,chart:10,target:0},
  'バリュー重視':{fundamental:15,ir:20,valuation:35,supply:10,rs:10,chart:10,target:0},
  'テクニカル重視':{fundamental:5,ir:10,valuation:5,supply:30,rs:20,chart:30,target:0},
  '+12%探索':{fundamental:10,ir:15,valuation:10,supply:20,rs:15,chart:20,target:20}
};
let DATA=null, computed=[], category='GENERAL', currentPage='home', returnPage='ranking', selectedCode=null;
const $=s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s));
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>v==null||v===''||String(v).trim()===''||!Number.isFinite(Number(v))?null:Number(v);
const nice=v=>num(v)==null?'未取得':num(v).toLocaleString('ja-JP',{maximumFractionDigits:1});
function stars(p){if(p==null)return'未評価';if(p>=90)return'★★★★★';if(p>=70)return'★★★★☆';if(p>=40)return'★★★☆☆';if(p>=15)return'★★☆☆☆';return'★☆☆☆☆'}
function rating(p){if(p==null)return'未評価';if(p>=90)return'優良';if(p>=70)return'良好';if(p>=40)return'中立';if(p>=15)return'注意';return'警戒'}
function cls(r){return({優良:'excellent',良好:'good',中立:'neutral',注意:'caution',警戒:'alert'})[r]||'unknown'}
async function decrypt(password){
 const response=await fetch('data.bin',{cache:'no-store'});if(!response.ok)throw Error('配信データがありません');
 const b=new Uint8Array(await response.arrayBuffer());if(new TextDecoder().decode(b.slice(0,5))!==MAGIC)throw Error('データ形式が異なります');
 const keyBytes=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveKey']);
 const key=await crypto.subtle.deriveKey({name:'PBKDF2',salt:b.slice(5,21),iterations:ITER,hash:'SHA-256'},keyBytes,{name:'AES-GCM',length:256},false,['decrypt']);
 const clear=await crypto.subtle.decrypt({name:'AES-GCM',iv:b.slice(21,33),additionalData:b.slice(0,5)},key,b.slice(33));
 return JSON.parse(new TextDecoder().decode(clear));
}
function navigate(page){
 currentPage=page;
 $$('.pane').forEach(n=>n.classList.add('hidden'));
 const elem=$('#pane-'+page);if(elem)elem.classList.remove('hidden');
 $$('#bottomNav button').forEach(b=>b.classList.toggle('active',b.dataset.goto===page));
 if(page==='ranking')renderRank();if(page==='list')renderList();if(page==='sector')renderSector();
 if(page==='settings')renderSavedProfiles();if(page==='update')renderUpdate();
 if(page==='home')renderHome();
 window.scrollTo({top:0,behavior:'instant'});
}
function weights(){return Object.fromEntries(AXES.map(([k])=>[k,Number($('#w_'+k)?.value??0)]))}
function applyPreset(p){AXES.forEach(([k])=>{let v=Math.max(0,Math.min(100,Number(p[k]??0)));$('#w_'+k).value=v;$('#wv_'+k).textContent=v});updateTotal();recalc()}
function updateTotal(){const n=Object.values(weights()).reduce((a,b)=>a+b,0);$('#weightTotal').textContent=`配点合計：${n} ／ 100以外も既存の計算式で按分`;}
function builtInSettings(){return DATA.settings?.overall_weights||BASE_WEIGHTS}
function percentile(scores,n){const a=scores.filter(Number.isFinite);if(!Number.isFinite(n)||!a.length)return null;let less=0,equal=0;for(const v of a){if(v<n)less++;else if(v===n)equal++}return (less+(equal+1)/2)/a.length*100}
function recalc(){
 if(!DATA)return;
 const w=weights();const wsum=Object.values(w).reduce((sum,v)=>sum+Math.max(0,v),0)||1;
 computed=DATA.rows.map(r=>{
  let totalNumerator=0,weightedAvailable=0,cov=0;const valid=[];
  for(const [k] of AXES){const weight=Math.max(0,w[k]??0);if(weight===0)continue;const a=r.axes?.[k]||{};const score=num(a.score), coverage=num(a.coverage)??0;cov+=coverage*weight;if(score!=null){totalNumerator+=score*weight;weightedAvailable+=weight;valid.push(score)}}
  let total=weightedAvailable?totalNumerator/weightedAvailable:null;
  if(total!=null&&num(DATA.settings?.weak_penalty)>0&&valid.length)total-=Math.max(0,(num(DATA.settings.weak_floor)??20)-Math.min(...valid))*num(DATA.settings.weak_penalty);
  return {...r,total,coverage:cov/wsum};
 });
 const allScores=computed.map(r=>r.total).filter(Number.isFinite);
 for(const r of computed){r.pct=percentile(allScores,r.total);const rankClass=String(r.rankClass||'');const allowed=rankClass==='正式'||(!rankClass&&r.officialRankPC!=null);r.official=allowed&&r.coverage>=(num($('#minCoverage').value)??60);r.rating=r.official?rating(r.pct):'評価不足';r.star=r.official?stars(r.pct):'評価不足'}
 [...computed].filter(r=>r.official&&r.total!=null).sort((a,b)=>b.total-a.total).forEach((r,i)=>r.officialRank=i+1);
 [...computed].filter(r=>r.total!=null).sort((a,b)=>b.total-a.total).forEach((r,i)=>r.rank=i+1);
 renderHome();if(currentPage==='ranking')renderRank();if(currentPage==='list')renderList();if(currentPage==='sector')renderSector();if(currentPage==='detail')renderDetail();
}
function isRealestate(r){return r.universeClass==='REAL_ESTATE'||String(r.industry||'').includes('不動産')}
function rankingRows(){let rows=[...computed];if(category==='REAL_ESTATE')rows=rows.filter(isRealestate);const q=$('#search').value.trim().toLowerCase();if(q)rows=rows.filter(r=>(r.code+' '+r.name).toLowerCase().includes(q));const rt=$('#rating').value,ind=$('#industry').value,th=$('#theme').value;if(rt)rows=rows.filter(r=>r.rating===rt);if(ind)rows=rows.filter(r=>r.industry===ind);if(th)rows=rows.filter(r=>r.theme===th);const min=num($('#minScore').value)??0;rows=rows.filter(r=>r.total!=null&&r.total>=min);if($('#officialOnly').checked)rows=rows.filter(r=>r.official);if($('#hideWarning').checked)rows=rows.filter(r=>!r.warning);
 for(const[k]of AXES){const m=num($('#f_'+k)?.value)??0;if(m>0)rows=rows.filter(r=>(num(r.axes?.[k]?.score)??-1)>=m)}
 rows.sort((a,b)=>(a.official===b.official?0:(a.official?-1:1))||((b.total??-1)-(a.total??-1)));return rows}
function metrics(target,stats){$(target).innerHTML=stats.map(([label,value])=>`<div class="summary-card"><div class="n">${esc(value)}</div><div class="l">${esc(label)}</div></div>`).join('')}
function renderHome(){metrics('#homeSummary',[['選定企業',DATA?.rows?.length??0],['正式評価',computed.filter(r=>r.official).length],['配信基準日',DATA?.asOf||'未取得'],['配信生成日時',String(DATA?.generatedAt||'未取得').replace('T',' ')]]);}
function renderRank(){
 $('#rankingTitle').textContent=category==='REAL_ESTATE'?'不動産（既存150社内）':'一般企業 分析';$('#rankingStatus').textContent=category==='REAL_ESTATE'?'一部対応':'稼働中';$('#rankingStatus').className='status '+(category==='REAL_ESTATE'?'partial':'ok');
 metrics('#rankingSummary',[['対象150社',computed.length],['正式評価',computed.filter(r=>r.official).length],['評価日',DATA.asOf||'-'],['検索対象',rankingRows().length]]);
 const rows=rankingRows(),lim=Number($('#limit').value)||20;$('#resultCount').textContent=`表示 ${rows.length}社 ／ ${Math.min(rows.length,lim)}件`;
 $('#results').innerHTML=rows.slice(0,lim).map(card).join('')||'<div class="panel">条件に当てはまる銘柄がありません。</div>';
 $$('#results [data-detail]').forEach(btn=>btn.onclick=()=>openDetail(btn.dataset.detail,'ranking'));
}
function card(r){const rank=r.official?(r.officialRank+'位'):('参考 '+(r.rank??'-')+'位');const axes=AXES.map(([k,l])=>{const v=num(r.axes?.[k]?.score);return`<div class="axis"><span class="axis-name">${esc(l)}</span><span class="bar"><span style="width:${v==null?0:Math.max(0,Math.min(100,v))}%"></span></span><span class="axis-val">${v==null?'-':v.toFixed(0)}</span></div>`}).join('');return `<article class="stock-card"><div class="card-head"><div><span class="rank">${esc(rank)}</span><span class="code">${esc(r.code)}</span><span class="name">${esc(r.name)}</span></div><span class="badge ${cls(r.rating)}">${esc(r.rating)}</span></div><div class="scoreline"><strong class="total">${r.total==null?'未評価':r.total.toFixed(1)}</strong><span class="stars">${esc(r.star)}</span><span class="coverage">カバー${Math.round(r.coverage)}%</span></div>${axes}<div class="subline"><span>${esc(r.industry||r.theme||'業種未取得')}</span><span class="${r.warning?'warn':''}">${r.warning?'⚠ '+esc(r.warning):'警戒なし'}</span></div><button class="stock-action" data-detail="${esc(r.code)}">実データの詳細を見る ›</button></article>`}
function renderList(){const q=$('#listSearch').value.trim().toLowerCase();const rows=[...computed].sort((a,b)=>(a.officialRankPC??9999)-(b.officialRankPC??9999));$('#listResults').innerHTML=rows.filter(r=>(r.code+' '+r.name).toLowerCase().includes(q)).map(r=>`<button class="list-item" data-detail="${esc(r.code)}"><strong>${esc(r.officialRankPC??r.rankPC??'-')}</strong><span><b>${esc(r.code)}　${esc(r.name)}</b><small>${esc(r.industry||'業種未取得')}</small></span><span class="list-score">${r.total==null?'未評価':r.total.toFixed(1)}</span></button>`).join('')||'<div class="panel">該当する銘柄がありません。</div>';$$('#listResults [data-detail]').forEach(b=>b.onclick=()=>openDetail(b.dataset.detail,'list'))}

/* v0.16.2: 割安度・PERの推移・分布図（PC版と同じ物差し。データはPCで計算済みの実データだけ） */
const VKEY={AdjFwdPER:'控除後予想PER',FwdPER:'予想PER',AdjPER:'控除後実績PER',PER:'実績PER',PBR:'PBR',PSR:'PSR'};
function vfix(v,key){v=num(v);if(v==null)return null;return key==='PSR'&&v<1e-3?v*1e6:v}
function valBlock(r){const v=r.valuation||{};if(!v.metric)return '<div class="notice">割安度は未評価です。</div>';const k=v.key;const cur=vfix(v.current,k),med=vfix(v.median,k);
 const rows=[['使った指標',v.metric],['現在',cur==null?'未取得':cur.toFixed(2)+'倍'],['過去'+(num(v.years)||3)+'年の中央値',med==null?'未取得':med.toFixed(2)+'倍'],['中央値比',num(v.index)==null?'未取得':num(v.index).toFixed(2)],['過去の位置',num(v.percentile)==null?'未取得':num(v.percentile).toFixed(0)+'%（低いほど割安）'],['判定',(v.label||'未評価')+'（中央値比0.70〜1.30を中央値周辺）']];
 return `<div class="detail-grid">${rows.map(([a,b])=>`<div class="detail-box"><div class="k">${esc(a)}</div><div class="v">${esc(b)}</div></div>`).join('')}</div>${v.reason?`<p class="muted">${esc(v.reason)}</p>`:''}<p class="muted">点数は「過去${num(v.years)||3}年の自分の値と比べて低いほど高い」。PERは特別損益を除いた控除後PERを優先し、作れない会社は会社予想のPERで評価します。</p>`}
function perChart(ph,years){const pts=(ph?.points||[]).map(p=>[String(p[0]),vfix(p[1],ph.key)]).filter(p=>p[1]!=null);if(pts.length<2)return '<div class="notice">PERなどの推移は未取得です。</div>';
 const end=new Date(pts[pts.length-1][0]);const from=new Date(end);from.setFullYear(end.getFullYear()-years);const a=pts.filter(p=>new Date(p[0])>=from);if(a.length<2)return '<div class="notice">この期間の推移はありません。</div>';
 const vals=a.map(p=>p[1]).slice().sort((x,y)=>x-y);const med=vals.length%2?vals[(vals.length-1)/2]:(vals[vals.length/2-1]+vals[vals.length/2])/2;
 const mn=Math.min(...vals,med),mx=Math.max(...vals,med),rg=(mx-mn)||1;const Y=v=>(118-96*(v-mn)/rg).toFixed(1);const X=i=>(15+i*330/(a.length-1)).toFixed(1);
 const cur=a[a.length-1][1];return `<div class="chart-wrap"><div class="chart-title">■ ${esc(VKEY[ph.key]||ph.key)}　現在 ${cur.toFixed(2)}倍　過去${years}年の中央値 ${med.toFixed(2)}倍（点線）　${cur<med?'中央値より低い':'中央値より高い'}</div><svg viewBox="0 0 360 132" role="img"><path d="M15 22H345M15 70H345M15 118H345" stroke="#e3ecf5" fill="none"/><line x1="15" x2="345" y1="${Y(med)}" y2="${Y(med)}" stroke="#7a8590" stroke-dasharray="5 4"/><polyline points="${a.map((p,i)=>X(i)+','+Y(p[1])).join(' ')}" fill="none" stroke="#1f4e79" stroke-width="2.2"/></svg><div class="chart-stat"><span>${esc(a[0][0])}</span><span>${esc(a[a.length-1][0])}</span></div></div>`}
function bubbleHtml(group){const rows=computed.filter(r=>num(r.axes?.valuation?.score)!=null&&num(r.growthPct)!=null);if(rows.length<3)return '<div class="notice">分布図に必要な値（成長・割安度）がまだありません。</div>';
 const g=rows.map(r=>num(r.growthPct)).sort((x,y)=>x-y);const rk=v=>{let lo=0;while(lo<g.length&&g[lo]<v)lo++;let hi=lo;while(hi<g.length&&g[hi]===v)hi++;return ((lo+hi+1)/2)/g.length*100};
 const key=r=>(group==='theme'?r.theme:group==='industry'?r.industry:r.subIndustry)||'未分類';const m=new Map();
 for(const r of rows){const k=key(r);if(!m.has(k))m.set(k,[]);m.get(k).push({r,x:num(r.axes.valuation.score),y:rk(num(r.growthPct))})}
 const bs=[...m].map(([k,a])=>({k,n:a.length,x:a.reduce((s,v)=>s+v.x,0)/a.length,y:a.reduce((s,v)=>s+v.y,0)/a.length}));
 const X=v=>(30+v*3.2).toFixed(1),Y=v=>(330-v*3.1).toFixed(1);
 const circ=bs.map(b=>`<g data-grp="${esc(b.k)}"><circle cx="${X(b.x)}" cy="${Y(b.y)}" r="${(3+Math.sqrt(b.n)*4).toFixed(1)}" fill="#1f4e79" fill-opacity=".55" stroke="#fff"/>${(b.n>=3||(b.x>50&&b.y>50))?`<text x="${X(b.x)}" y="${(Y(b.y)-8)}" font-size="9" text-anchor="middle">${esc(b.k.length>12?b.k.slice(0,12)+'…':b.k)} ${b.n>1?b.n+'社':''}</text>`:''}</g>`).join('');
 const hit=rows.filter(r=>num(r.axes.valuation.score)>50&&rk(num(r.growthPct))>50).sort((a,b)=>(b.total??0)-(a.total??0));
 return `<div class="chart-wrap"><svg viewBox="0 0 360 350" role="img"><rect x="${X(50)}" y="${Y(100)}" width="${(50*3.2).toFixed(1)}" height="${(50*3.1).toFixed(1)}" fill="#e3f1e8"/><line x1="${X(50)}" x2="${X(50)}" y1="${Y(0)}" y2="${Y(100)}" stroke="#9aa5b1" stroke-dasharray="4 4"/><line x1="${X(0)}" x2="${X(100)}" y1="${Y(50)}" y2="${Y(50)}" stroke="#9aa5b1" stroke-dasharray="4 4"/><text x="${X(98)}" y="${Y(97)}" font-size="9" text-anchor="end" fill="#2e7d32">狙い目</text><text x="${X(50)}" y="346" font-size="9" text-anchor="middle">割安度（右ほど過去比で割安）</text><text x="8" y="${Y(50)}" font-size="9" transform="rotate(-90 8 ${Y(50)})" text-anchor="middle">成長性（150社内の順位）</text>${circ}</svg></div>
 <p class="muted">丸1つ＝1分類、大きさ＝社数。縦横とも150社の中での順位（真ん中の点線が150社の真ん中）。丸を押すとその分類の銘柄を表示します。</p><div id="grpList"></div>
 <h2>狙い目に入った銘柄 ${hit.length}社</h2><div class="list-results">${hit.slice(0,40).map(r=>`<button class="list-item" data-code="${esc(r.code)}"><b>${esc(r.code)} ${esc(r.name)}</b><span>${esc(key(r))}　総合 ${r.total==null?'—':r.total.toFixed(1)}</span></button>`).join('')||'<div class="panel">該当なし</div>'}</div>`}

function renderSector(){const groups=new Map();for(const r of computed){if(r.total==null)continue;const k=r.industry||'業種未取得';if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r.total)}const rows=[...groups].map(([name,vals])=>({name,avg:vals.reduce((a,b)=>a+b,0)/vals.length,n:vals.length})).sort((a,b)=>b.avg-a.avg);const grp=localStorage.getItem('v162grp')||'sub';$('#sectorResults').innerHTML=`<div class="chart-actions">${[['sub','細かい業種'],['theme','国策テーマ'],['industry','33業種']].map(([k,l])=>`<button data-grp-mode="${k}" ${k===grp?'class="active"':''}>${l}</button>`).join('')}</div>`+bubbleHtml(grp)+'<h2>業種別の平均（総合点）</h2>'+rows.map(r=>`<div class="sector-item"><div class="sector-line"><span>${esc(r.name)}（${r.n}社）</span><b>${r.avg.toFixed(1)}</b></div><div class="bar"><span style="width:${Math.max(0,Math.min(r.avg,100))}%"></span></div></div>`).join('')||'<div class="panel">集計できるスコアがありません。</div>';
 $$('[data-grp-mode]').forEach(b=>b.onclick=()=>{localStorage.setItem('v162grp',b.dataset.grpMode);renderSector()});
 $$('#sectorResults [data-code]').forEach(b=>b.onclick=()=>openDetail(b.dataset.code));
 $$('#sectorResults [data-grp]').forEach(gn=>gn.onclick=()=>{const k=gn.dataset.grp;const key=r=>(grp==='theme'?r.theme:grp==='industry'?r.industry:r.subIndustry)||'未分類';const a=computed.filter(r=>key(r)===k).sort((x,y)=>(y.total??0)-(x.total??0));$('#grpList').innerHTML=`<h2>${esc(k)}（${a.length}社）</h2><div class="list-results">${a.map(r=>`<button class="list-item" data-code="${esc(r.code)}"><b>${esc(r.code)} ${esc(r.name)}</b><span>総合 ${r.total==null?'—':r.total.toFixed(1)}</span></button>`).join('')}</div>`;$$('#grpList [data-code]').forEach(b=>b.onclick=()=>openDetail(b.dataset.code))})}
function openDetail(code,from){selectedCode=code;returnPage=from||'ranking';navigate('detail');renderDetail()}
const IR_LABELS={ReviewStatus:'評価状態',CurrentProfitTrend:'利益傾向',EarningsCauseScore:'増減益理由',DemandOrderScore:'需要・受注',ForecastOutlookScore:'業績見通し',FutureCatalystScore:'将来材料',TimingVisibilityScore:'実現時期',ManagementCredibilityScore:'経営・計画信頼度',ShareholderReturnScore:'株主還元',RiskQualityScore:'リスクの質',ProfitReasonSummary:'増減益理由の根拠',DemandEvidence:'需要・受注の根拠',CatalystSummary:'将来材料の根拠',TimingSummary:'実現時期の根拠',ManagementPlanSummary:'経営・計画の根拠',RiskSummary:'リスクの根拠',ScenarioBreakCondition:'シナリオ崩壊条件',IRNote:'IRメモ',ReviewDate:'評価日'};
function irDetails(detail){const rows=Object.entries(detail||{}).filter(([,v])=>v!=null&&String(v).trim());return rows.map(([key,val])=>`<div class="ir-item"><b>${esc(IR_LABELS[key]||key)}</b><span>${/^https?:\/\//.test(String(val))?`<a href="${esc(val)}" target="_blank" rel="noopener noreferrer">${esc(val)}</a>`:esc(val)}</span></div>`).join('')||'<p class="muted">この銘柄の公式IR評価本文はまだ取得されていません。</p>'}
function priceChart(history,days=365){const raw=(history||[]).map(row=>[String(row[0]),num(row[1])]).filter(x=>x[1]!=null);const a=raw.slice(-Math.max(days,2));if(a.length<2)return '<div class="notice">対象期間の株価履歴は未取得です。架空のチャートは表示しません。</div>';const min=Math.min(...a.map(v=>v[1])),max=Math.max(...a.map(v=>v[1])),range=max-min||1;const points=a.map((v,i)=>`${(15+i*330/(a.length-1)).toFixed(2)},${(115-94*(v[1]-min)/range).toFixed(2)}`).join(' ');return `<div class="chart-wrap"><svg viewBox="0 0 360 138" role="img" aria-label="保存済み終値の推移"><path d="M15 21H345M15 68H345M15 115H345" stroke="#d6e5f9" fill="none"/><polyline points="${points}" fill="none" stroke="#0868f3" stroke-width="2.5" stroke-linejoin="round"/></svg><div class="chart-stat"><span>${esc(a[0][0])}</span><span>安値 ${nice(min)} ／ 高値 ${nice(max)}</span><span>${esc(a[a.length-1][0])}</span></div><p class="muted">保存済み終値の折れ線です。ローソク足・移動平均線ではありません。</p></div>`}
function renderDetail(){const r=computed.find(v=>v.code===selectedCode);if(!r){$('#stockDetail').innerHTML='<div class="panel">銘柄を取得できません。</div>';return}const detailRows=[['基準終値',r.close==null?'未取得':`${nice(r.close)}円`],['目標価格',r.targetPrice==null?'未取得':`${nice(r.targetPrice)}円`],['損切り価格',r.stopPrice==null?'未取得':`${nice(r.stopPrice)}円`],['信用状態',r.creditState||'未取得'],['業種',r.industry||'未取得'],['財務判定',r.financeDecision||'未取得']];$('#stockDetail').innerHTML=`<div class="panel"><div class="header-kicker">${esc(r.code)}</div><h1 class="detail-title">${esc(r.name)}</h1><span class="badge ${cls(r.rating)}">${esc(r.rating)}</span><h2>表示総合点　${r.total==null?'未評価':r.total.toFixed(1)}</h2></div><div class="detail-grid">${detailRows.map(([k,v])=>`<div class="detail-box"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div></div>`).join('')}</div><h2>株価履歴（保存データ）</h2><div class="chart-actions">${[['1M',22],['3M',66],['6M',132],['1Y',260]].map(([lab,n])=>`<button data-chartdays="${n}" ${n===260?'class="active"':''}>${lab}</button>`).join('')}</div><div id="detailChart">${priceChart(r.closeHistory,260)}</div><h2>割安度（点数に使った指標）</h2>${valBlock(r)}<h2>PERなどの推移</h2><div class="chart-actions">${[1,2,3].map(y=>`<button data-peryears="${y}" ${y===3?'class="active"':''}>過去${y}年</button>`).join('')}</div><div id="perChartBox">${perChart(r.perHistory,3)}</div><h2>各軸の評価</h2><div class="panel">${AXES.map(([k,l])=>{const v=num(r.axes?.[k]?.score);return`<div class="axis"><span class="axis-name">${esc(l)}</span><span class="bar"><span style="width:${v==null?0:v}%"></span></span><span class="axis-val">${v==null?'—':v.toFixed(0)}</span></div>`}).join('')}</div><h2>決算・IRの記録</h2><div class="panel">${irDetails(r.irDetail)}</div>`;$$('[data-peryears]').forEach(b=>b.onclick=()=>{$$('[data-peryears]').forEach(x=>x.classList.toggle('active',x===b));$('#perChartBox').innerHTML=perChart(r.perHistory,Number(b.dataset.peryears))});$$('[data-chartdays]').forEach(b=>b.onclick=()=>{$$('[data-chartdays]').forEach(x=>x.classList.toggle('active',x===b));$('#detailChart').innerHTML=priceChart(r.closeHistory,Number(b.dataset.chartdays))})}
function profiles(){try{const a=JSON.parse(localStorage.getItem('jq5a_named_profiles_v102')||'{}');return a&&typeof a==='object'&&!Array.isArray(a)?a:{}}catch{return {}}}
function renderSavedProfiles(){const saved=profiles();$('#savedProfiles').innerHTML=Object.entries(saved).map(([name,values])=>`<div class="saved-profile"><span>★ ${esc(name)}</span><button data-load-name="${esc(name)}">適用</button></div>`).join('')||'<div class="muted">保存済みの設定はありません。</div>';$$('[data-load-name]').forEach(btn=>btn.onclick=()=>{const p=profiles()[btn.dataset.loadName];if(p)applyPreset(p)})}
function saveProfile(){const name=$('#presetName').value.trim(),msg=$('#profileNotice');if(!name||name.length>60){msg.textContent='設定名を入力してください（60文字以内）。';return}const all=profiles();if(name in all||name in PRESETS){msg.textContent='同名の設定が存在します。別名で保存してください。';return}all[name]=weights();try{localStorage.setItem('jq5a_named_profiles_v102',JSON.stringify(all));msg.textContent=`「${name}」をこの携帯に保存しました。`;$('#presetName').value='';renderSavedProfiles()}catch(e){msg.textContent='保存できませんでした。ブラウザの保存設定を確認してください。'}}
function renderUpdate(){const s=DATA||{};const items=[['配信された企業',`${s.rows?.length??0}社`],['分析基準日',s.asOf||'未取得'],['携帯用データ生成日時',String(s.generatedAt||'未取得').replace('T',' ')],['元のファイル','PCの scores_latest.csv'],['配信方式','AES-GCM暗号化'],['更新操作','PC版で実施']];$('#updateMeta').innerHTML=items.map(([k,v])=>`<div class="meta-row"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}
function buildControls(){
 const w=builtInSettings();$('#weights').innerHTML=AXES.map(([k,l])=>`<label class="weight-row"><span>${esc(l)}</span><input id="w_${k}" type="range" min="0" max="100" step="5" value="${Math.max(0,Math.min(100,w[k]??0))}"><span id="wv_${k}" class="weight-value">${w[k]??0}</span></label>`).join('');for(const [k]of AXES){$('#w_'+k).addEventListener('input',e=>{$('#wv_'+k).textContent=e.target.value;updateTotal();recalc()})}
 $('#presetButtons').innerHTML=Object.keys(PRESETS).map((name,i)=>`<button data-built-in="${i}">${esc(name)}</button>`).join('');$$('[data-built-in]').forEach(b=>b.onclick=()=>applyPreset(PRESETS[Object.keys(PRESETS)[Number(b.dataset.builtIn)]]));
 $('#axisFilters').innerHTML=AXES.map(([k,l])=>`<label>${esc(l)}<input id="f_${k}" type="number" min="0" max="100" value="0"></label>`).join('');
 for(const[k]of AXES)$('#f_'+k).addEventListener('input',renderRank);
 const themes=[...new Set(DATA.rows.map(r=>r.theme).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ja'));$('#theme').innerHTML='<option value="">全テーマ</option>'+themes.map(t=>`<option value="${esc(t)}">${esc(t)}</option>`).join('');
 const industries=[...new Set(DATA.rows.map(r=>r.industry).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ja'));$('#industry').innerHTML='<option value="">全業種</option>'+industries.map(t=>`<option value="${esc(t)}">${esc(t)}</option>`).join('');
 $('#minCoverage').value=DATA.settings?.min_coverage_pct??60;
 for(const id of ['search','rating','industry','theme','minScore','officialOnly','hideWarning','limit'])$('#'+id).addEventListener(id==='search'?'input':'change',renderRank);
 $('#minScore').addEventListener('input',renderRank);$('#minCoverage').addEventListener('input',recalc);$('#listSearch').addEventListener('input',renderList);
 $('#resetDefault').onclick=()=>applyPreset(builtInSettings());$('#saveProfile').onclick=saveProfile;
 $('#reloadData').onclick=()=>location.reload();$('#backDetail').onclick=()=>navigate(returnPage);
 $('#goGeneral').onclick=()=>{category='GENERAL';navigate('ranking')};$('#goRealestate').onclick=()=>{category='REAL_ESTATE';navigate('ranking')};$('#goFinance').onclick=()=>navigate('finance');
 $$('[data-goto]').forEach(b=>b.onclick=()=>navigate(b.dataset.goto));
 renderSavedProfiles();updateTotal();
}
async function unlock(){const msg=$('#loginError');msg.textContent='';try{DATA=await decrypt($('#password').value);if(!Array.isArray(DATA.rows))throw Error('データの形式が不正です');$('#password').value='';$('#lock').classList.add('hidden');$('#app').classList.remove('hidden');$('#meta').textContent=`基準日 ${DATA.asOf||'未取得'} ／ 配信 ${String(DATA.generatedAt||'').replace('T',' ')}`;buildControls();recalc();navigate('home')}catch(e){msg.textContent='パスワードが違うか、配信データを開けません。'+(String(e.message).includes('配信データ')?' data.binを確認してください。':'')}}
$('#unlock').onclick=unlock;$('#password').addEventListener('keydown',e=>{if(e.key==='Enter')unlock()});$('#logout').onclick=()=>{DATA=null;computed=[];$('#app').classList.add('hidden');$('#lock').classList.remove('hidden')};
// 旧版のローカルストレージに平文で保存されていた閲覧パスワードは破棄する。
try{localStorage.removeItem('jq5a_pw')}catch{}
if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
