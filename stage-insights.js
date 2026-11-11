'use strict';
window.initStageInsights=function(api){
  const {state,months,cities,get,setMonth,choose,stop,render,fmt,finite,notice}=api;
  const $=s=>document.querySelector(s),p=new URLSearchParams(location.search),dialog=$('#insights-dialog');
  const modes=['momentum','sustain','converge','reversal'];
  const config={mode:modes.includes(p.get('analysis'))?p.get('analysis'):'momentum',kind:p.get('kind')==='new'?'new':'resale',window:p.get('window')==='6'?6:3,flat:p.get('flat')==='1',from:months.includes(p.get('from'))?p.get('from'):months.find(m=>m===state.month.slice(0,4)+'-01')||months[0],path:['all','both','meet','weaker','flat'].includes(p.get('path'))?p.get('path'):'all'};
  let lastKey='',candidateRows=[],showAll=false;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const t=()=>config.kind==='new'?'新房':'二手房';
  const rate=(city,month,kind,metric)=>get(city,month,kind,metric);
  const tenth=v=>finite(v)?Math.round(v*10):null;
  const value=(city,month,kind,metric)=>tenth(rate(city,month,kind,metric));
  const label=v=>finite(v)?fmt(v/10):'—';
  const safe=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fromSelect=d3.select('#insight-from');fromSelect.selectAll('option').data(months).join('option').attr('value',d=>d).text(d=>d);
  const visual=d3.select('#insight-visual').append('svg').attr('viewBox','0 0 650 245').attr('role','img');
  visual.append('g').attr('class','insight-bars');visual.append('g').attr('class','insight-bar-labels');visual.append('g').attr('class','insight-counts');
  const showMore=document.createElement('button');showMore.className='insight-more';showMore.textContent='展开其余城市 ↓';$('#insight-cities').after(showMore);showMore.onclick=()=>{showAll=!showAll;renderRows();showMore.textContent=showAll?'收起名单 ↑':'展开其余城市 ↓';};
  const summary=document.createElement('div');summary.className='insight-editorial';const reading=document.createElement('div');reading.className='insight-reading';$('#insight-summary').before(reading);summary.append($('#insight-summary'));reading.append(summary,$('#insight-visual'));

  function compute(){
    const i=months.indexOf(state.month),kind=config.kind;
    if(config.mode==='momentum'){
      const previous=months[i-1],valid=[],up=[],flat=[],down=[];
      if(previous)for(const city of cities){
        const a=value(city,previous,kind,'yoy'),b=value(city,state.month,kind,'yoy'),m=value(city,state.month,kind,'mom');
        if([a,b,m].some(v=>v===null)||b<=a)continue;
        const row={city,month:state.month,metric:'mom',reason:`同比 ${label(a)}% → ${label(b)}%；当月环比 ${label(m)}%`,score:-m};valid.push(row);(m<0?down:m>0?up:flat).push(row);
      }
      return {number:down.length,total:valid.length,title:`${t()}同比改善，价格就止跌了吗？`,lead:valid.length?`${Math.round(down.length/valid.length*100)}% 的改善城市，当月仍在下跌。`:'先有上个月，才能比较同比是否改善。',explain:previous?`${previous} → ${state.month} · 只看同比表现提高的城市`:'起始月份没有前月记录',method:'“同比改善”是本月同比数值高于上月；并不要求同比为正。横条把这组城市拆为当月环比下跌、持平和上涨。点击条形或城市名单，可在主图查看。',rows:down.sort((a,b)=>b.score-a.score),list:'同比改善、但当月仍下跌的城市',bars:[{id:'fall',label:'当月仍下跌',n:down.length,color:'#bf4b30',rows:down},{id:'flat',label:'当月持平',n:flat.length,color:'#a7ac9d',rows:flat},{id:'up',label:'当月上涨',n:up.length,color:'#3c668a',rows:up}]};
    }
    if(config.mode==='sustain'){
      const positive=config.flat?v=>v>=0:v=>v>0;
      const groups=[1,3,6].map(n=>{
        const ms=months.slice(Math.max(0,i-n+1),i+1),rows=[];
        if(ms.length===n)for(const city of cities){const vs=ms.map(m=>value(city,m,kind,'mom'));if(vs.every(v=>v!==null&&positive(v)))rows.push({city,month:state.month,metric:'mom',reason:`${ms[0]} 至 ${state.month}，${n} 个月${config.flat?'均未环比下跌':'均环比上涨'}`,score:vs.reduce((a,b)=>Math.min(a,b),Infinity)});}
        return {id:String(n),label:n===1?(config.flat?'当月未下跌':'当月上涨'):`连续 ${n} 个月`,n:rows.length,rows,color:n===config.window?'#bf4b30':'#3c668a',incomplete:ms.length<n};
      });
      const selected=groups.find(g=>g.id===String(config.window));
      return {number:selected.n,total:cities.length,title:'上涨是一瞬间，还是延续了一段时间？',lead:selected.incomplete?'当前月份之前的数据不足，不能判断。':`连续 ${config.window} 个月${config.flat?'未下跌':'上涨'}，只剩 ${selected.n} 城。`,explain:`截至 ${state.month} · ${t()}环比 · ${config.flat?'上涨或持平':'严格大于零'}`,method:'每个月分别判断，不把月度涨跌幅相加。“持平也算未下跌”提供较宽的条件。100.0 按官方发布精度视为持平，不推测舍入前的小幅变化。点击条形可查看对应的连续月份组。',rows:selected.rows,list:`连续 ${config.window} 个月${config.flat?'未下跌':'上涨'}的城市`,bars:groups};
    }
    if(config.mode==='converge'){
      const paths={both:[],meet:[],weaker:[],flat:[]};let complete=0,wider=0,equal=0;
      if(config.from<state.month)for(const city of cities){
        const a=value(city,config.from,'new','yoy'),b=value(city,config.from,'resale','yoy'),c=value(city,state.month,'new','yoy'),d=value(city,state.month,'resale','yoy');
        if([a,b,c,d].some(v=>v===null))continue;complete++;
        const change=Math.abs(c-d)-Math.abs(a-b);if(change>=0){change===0?equal++:wider++;continue;}
        const dn=c-a,dr=d-b,path=dn>0&&dr>0?'both':dn<0&&dr>0?'meet':dn<0&&dr<0?'weaker':'flat';
        paths[path].push({city,month:state.month,metric:'yoy',reason:`新房同比 ${label(a)}% → ${label(c)}%；二手房 ${label(b)}% → ${label(d)}%`,score:-change});
      }
      const all=Object.values(paths).flat(),rows=config.path==='all'?all:paths[config.path];
      return {number:all.length,total:complete,title:'差距缩小，也可能发生在一起走弱时。',lead:config.from<state.month?`${all.length} 城差距缩小，只有 ${paths.both.length} 城两类同比均改善。`:'请选择早于观察月份的起始月份。',explain:`${config.from} → ${state.month} · 同比绝对差值 · ${wider} 城扩大，${equal} 城不变`,method:'先对每城计算“新房同比 − 二手房同比”的绝对值，再比较起止月份；不能用有符号差值下降替代距离缩小。条形按两类同比各自的改善或走弱拆分。这是变化分解，不是原因分解。',rows:rows.sort((a,b)=>b.score-a.score),list:'差距缩小的城市 · 可按路径筛选',bars:[{id:'both',label:'两类同比均改善',n:paths.both.length,color:'#3c668a',rows:paths.both},{id:'meet',label:'新房走弱，二手房改善',n:paths.meet.length,color:'#bf4b30',rows:paths.meet},{id:'weaker',label:'两类同比均走弱',n:paths.weaker.length,color:'#7c8775',rows:paths.weaker},{id:'flat',label:'一类同比不变',n:paths.flat.length,color:'#afb4a5',rows:paths.flat}]};
    }
    const events=[];
    // Full follow-up is required; the final two sample months are right-censored.
    for(let j=1;j<months.length-2;j++)for(const city of cities){
      const vs=[-1,0,1,2].map(offset=>value(city,months[j+offset],kind,'mom'));
      if(vs.some(v=>v===null)||!(vs[0]<0&&vs[1]>0))continue;
      const failed=vs[2]<0||vs[3]<0;
      events.push({city,month:months[j],metric:'mom',failed,strict:vs.slice(1).every(v=>v>0),reason:`${months[j]} 环比转正为 ${label(vs[1])}%；后两月为 ${label(vs[2])}%、${label(vs[3])}%`,score:j});
    }
    const failed=events.filter(e=>e.failed),held=events.filter(e=>!e.failed);
    return {number:failed.length,total:events.length,title:'单月转正后，改善延续了吗？',lead:events.length?`${Math.round(failed.length/events.length*100)}% 的事件，在后两个月至少再跌一次。`:'没有可完整观察后续两个月的转正事件。',explain:`${months[1]} — ${months.at(-3)} · ${t()} · 全样本历史事件`,method:'事件定义为同城环比从负转正，并完整观察后两个月。末两个月的新事件不判成功或失败。同一城可能多次出现，事件并不独立；这里的比例不是未来下跌概率。点击名单可定位事件发生月。',rows:failed.sort((a,b)=>b.score-a.score),list:'再次下跌的历史事件 · 同一城市可出现多次',bars:[{id:'failed',label:'后两月至少再跌一次',n:failed.length,color:'#bf4b30',rows:failed},{id:'held',label:'后两月均未再跌',n:held.length,color:'#3c668a',rows:held}]};
  }
  let result;
  function drawBars(bars){
    const narrow=innerWidth<600,width=narrow?430:650,h=245,left=narrow?168:190,right=45,top=20,step=Math.min(64,200/bars.length),max=Math.max(1,...bars.map(d=>d.n)),x=d3.scaleLinear().domain([0,max]).range([0,width-left-right]),duration=reduced?0:650;
    visual.attr('viewBox',`0 0 ${width} ${h}`).attr('aria-label',bars.map(b=>`${b.label} ${b.n}`).join('；'));
    const rects=visual.select('.insight-bars').selectAll('rect').data(bars,d=>d.id).join(enter=>enter.append('rect').attr('x',left).attr('width',0).attr('height',22).attr('y',(_,i)=>top+i*step),update=>update,exit=>exit.interrupt().remove());
    rects.attr('fill',d=>d.color).attr('role','button').attr('tabindex',0).attr('aria-label',d=>`查看${d.label}：${d.n}${config.mode==='reversal'?'次事件':'城'}`).on('click',(_,d)=>barSelect(d)).on('keydown',(e,d)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();barSelect(d);}}).interrupt().transition().duration(duration).ease(d3.easeCubicInOut).attr('y',(_,i)=>top+i*step).attr('width',d=>x(d.n));
    visual.select('.insight-bar-labels').selectAll('text').data(bars,d=>d.id).join('text').attr('x',left-18).attr('text-anchor','end').attr('class','story-axis-label').text(d=>d.label).interrupt().transition().duration(duration).attr('y',(_,i)=>top+i*step+15);
    visual.select('.insight-counts').selectAll('text').data(bars,d=>d.id).join('text').attr('class','story-count').text(d=>d.n).interrupt().transition().duration(duration).attr('x',d=>left+x(d.n)+12).attr('y',(_,i)=>top+i*step+16);
  }
  function barSelect(d){candidateRows=d.rows;showAll=false;$('#insight-list-heading').textContent=d.label+' · 点击城市追踪';renderRows();}
  function renderRows(){
    const shown=showAll?candidateRows:candidateRows.slice(0,12);
    d3.select('#insight-cities').selectAll('button').data(shown,d=>d.city+'|'+d.month).join(enter=>{
      const b=enter.append('button').attr('class','story-city');b.append('strong');b.append('span').attr('class','story-city-date');b.append('small');b.append('i').text('↗');return b;
    }).each(function(d,i){const b=d3.select(this);b.attr('aria-label',`在主图追踪${d.city} ${d.month}`).style('--order',i%12);b.select('strong').text(d.city);b.select('span').text(d.month);b.select('small').text(d.reason);}).on('click',(_,d)=>applyGroup(d));
    $('#insight-empty').hidden=candidateRows.length>0;showMore.hidden=candidateRows.length<=12;$('#insight-highlight').disabled=!candidateRows.length;
  }
  function applyGroup(row){
    const names=config.mode==='reversal'?[row.city]:[...new Set(candidateRows.map(d=>d.city))];
    dialog.close();state.spotlight=names;state.focus=true;state.metric=row.metric;state.city=row.city;setMonth(row.month);choose(row.city);
    notice(`${names.length} 城已聚焦 · 当前为${state.metric==='mom'?'环比（比上个月）':'同比（比去年同月）'}。再次点击“聚焦”返回全体。`);
  }
  function refresh(){
    if(!dialog.open)return;
    const key=JSON.stringify([state.month,config,innerWidth<600]);if(key===lastKey)return;lastKey=key;showAll=false;
    result=compute();candidateRows=result.rows;
    const short=['sustain'].includes(config.mode),converge=config.mode==='converge';
    $('#insight-kind-label').hidden=converge;$('#insight-window-label').hidden=!short;$('#insight-flat-label').hidden=!short;$('#insight-from-label').hidden=!converge;$('#insight-path-label').hidden=!converge;
    $('#insight-kind').value=config.kind;$('#insight-window').value=String(config.window);$('#insight-flat').checked=config.flat;$('#insight-from').value=config.from;$('#insight-path').value=config.path;
    document.querySelectorAll('[data-insight]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.insight===config.mode)));
    $('#insights-title').textContent=result.title;$('#insight-period').textContent=config.mode==='reversal'?'历史窗口':state.month;
    $('#insight-summary').innerHTML=`<span class="story-number">${result.number}<small>/ ${result.total}${config.mode==='reversal'?' 次':' 城'}</small></span><strong>${safe(result.lead)}</strong><span>${safe(result.explain)}</span>`;
    $('#insight-method').textContent=result.method;$('#insight-list-heading').textContent=result.list;
    $('#insight-highlight').textContent=config.mode==='reversal'?'追踪首个历史事件 ↗':'在主图聚焦这组城市 ↗';
    drawBars(result.bars);renderRows();
  }
  function open(){stop();lastKey='';dialog.showModal();refresh();render(0);}
  $('#insights-open').onclick=open;
  document.querySelectorAll('[data-insight]').forEach(b=>b.onclick=()=>{config.mode=b.dataset.insight;lastKey='';refresh();render(0);});
  for(const [id,key,cast]of[['insight-kind','kind',v=>v],['insight-window','window',Number],['insight-from','from',v=>v],['insight-path','path',v=>v]])$('#'+id).onchange=e=>{config[key]=cast(e.target.value);lastKey='';refresh();render(0);};
  $('#insight-flat').onchange=e=>{config.flat=e.target.checked;lastKey='';refresh();render(0);};
  $('#insight-highlight').onclick=()=>{if(candidateRows.length)applyGroup(candidateRows[0]);};
  dialog.addEventListener('close',()=>{lastKey='';render(0);});
  $('#share-stage').onclick=async()=>{try{await navigator.clipboard.writeText(location.href);notice('当前视图链接已复制。');}catch{notice('可直接复制地址栏中的当前视图链接。');}};
  $('#reset-stage').onclick=()=>{stop();Object.assign(state,{month:months.at(-1),metric:'yoy',city:'杭州',view:'split',historyZoom:true,focus:false,spotlight:[]});document.querySelectorAll('dialog[open]').forEach(d=>d.close());render(650,true);};
  const controller={refresh,compute,open,config,writeURL(url){if(dialog.open){url.set('analysis',config.mode);url.set('kind',config.kind);url.set('window',String(config.window));if(config.flat)url.set('flat','1');url.set('from',config.from);url.set('path',config.path);}}};
  window.housingStage.insights=controller;
  if(modes.includes(p.get('analysis')))queueMicrotask(open);
  return controller;
};
