'use strict';
(async function () {
  const $ = s => document.querySelector(s), valid = v => v != null && Number.isFinite(v);
  const fmt = v => valid(v) ? `${v > 0 ? '+' : ''}${v.toFixed(1)}` : '—';
  const escape = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let records, meta;
  try { [records,meta] = await Promise.all(['housing','metadata'].map(async f=>{const r=await fetch(`../data/${f}.json`);if(!r.ok)throw Error(r.status);return r.json();})); }
  catch(e) {$('#status').textContent=`数据未能读取，请通过本地预览链接访问。${e.message}`;return;}
  const {months,cities} = meta, index = new Map(records.map(r=>[`${r.month}|${r.city}|${r.type}`,r]));
  const params = new URLSearchParams(location.search);
  const state = {month:months.includes(params.get('m'))?params.get('m'):months.at(-1),metric:params.get('metric')==='mom'?'mom':'yoy',city:cities.includes(params.get('city'))?params.get('city'):'杭州',compare:['杭州','上海','武汉'],selected:new Set(),explore:null,playing:false};
  const get = (city,month,type,metric=state.metric) => {const v=index.get(`${month}|${city}|${type}`)?.[`${metric}_index`];return valid(v)?Math.round((v-100)*10)/10:null;};
  const pair = (city,month=state.month) => {const n=get(city,month,'new'),r=get(city,month,'resale');return {city,month,n,r,gap:valid(n)&&valid(r)?Math.round((n-r)*10)/10:null};};
  const rows = () => cities.map(c=>pair(c));
  const med = (rs,k) => {const a=rs.map(d=>d[k]).filter(valid);return a.length?d3.median(a):null;};
  const limits={};
  for(const metric of ['yoy','mom']) {
    const values=records.map(r=>r[`${metric}_index`]).filter(valid).map(v=>v-100), [lo,hi]=d3.extent(values);
    const pad=(hi-lo)*.05;
    limits[metric]={domain:d3.scaleLinear().domain([Math.min(0,lo)-pad,Math.max(0,hi)+pad]).nice(10).domain()};
    limits[metric].gap=d3.max(months.flatMap(m=>cities.map(c=>Math.abs(get(c,m,'new',metric)-get(c,m,'resale',metric)))))||1;
  }
  let timer, noticeTimer;
  const metricName=()=>state.metric==='yoy'?'同比':'环比';
  function notice(s){$('#status').textContent=s;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('#status').textContent='',4000);}
  function hideTip(){$('#tooltip').hidden=true;}
  function showTip(e,d){const t=$('#tooltip');t.innerHTML=`<strong>${escape(d.city)}</strong> <span class="muted">${d.month}</span><br>新房 ${fmt(d.n)}%　 二手房 ${fmt(d.r)}%<br><span class="muted">差值 ${fmt(d.gap)} 个百分点</span>`;t.hidden=false;t.style.left=`${Math.max(8,Math.min(e.clientX+14,innerWidth-t.offsetWidth-12))}px`;t.style.top=`${Math.max(8,Math.min(e.clientY+14,innerHeight-t.offsetHeight-12))}px`;}
  function stop(){clearInterval(timer);state.playing=false;$('#play').textContent='▶';$('#play').setAttribute('aria-label','播放月份');}
  function choose(city){state.city=city;state.selected.clear();state.explore=null;hideTip();render();}
  function setMonth(m,manual=true){if(!months.includes(m))return;if(manual)stop();state.month=m;if(state.explore)applyExplore(state.explore);hideTip();render();}
  function applyExplore(mode){const rs=rows().filter(d=>valid(d.n)&&valid(d.r));state.explore=mode;let selected=[];
    if(mode==='opposite')selected=rs.filter(d=>d.n*d.r<0);
    if(mode==='gap')selected=[...rs].sort((a,b)=>Math.abs(b.gap)-Math.abs(a.gap)).slice(0,5);
    if(mode==='turn'){const i=months.indexOf(state.month);if(i>0)selected=rs.filter(d=>{const prev=pair(d.city,months[i-1]);return d.n*prev.n<0||d.r*prev.r<0;});}
    state.selected=new Set(selected.map(d=>d.city));if(!selected.length)notice('这个月没有符合该条件的城市。');
  }
  function pin(city){if(state.compare.includes(city)){notice(`${city}已在下方对比中`);return;}if(state.compare.length>=5){notice('最多对比5座城市，请先移除一座。');return;}state.compare.push(city);render();}
  function renderScatter(){
    const host=$('#scatter'), width=host.clientWidth,height=host.clientHeight;
    const mobile=width<440,m={left:mobile?42:57,right:mobile?21:35,top:27,bottom:47};
    const side=Math.min(width-m.left-m.right,height-m.top-m.bottom),left=m.left+(width-m.left-m.right-side)/2,top=m.top;
    const x=d3.scaleLinear().domain(limits[state.metric].domain).range([left,left+side]),y=d3.scaleLinear().domain(limits[state.metric].domain).range([top+side,top]);
    const svg=d3.select(host).selectAll('svg').data([0]).join('svg').attr('viewBox',`0 0 ${width} ${height}`).attr('role','img').attr('aria-label','70城新房与二手房涨跌幅散点图，点击城市查看走势，拖动框选比较');svg.selectAll('*').remove();
    svg.append('g').attr('class','grid').attr('transform',`translate(0,${top+side})`).call(d3.axisBottom(x).ticks(6).tickSize(-side).tickFormat(''));
    svg.append('g').attr('class','grid').attr('transform',`translate(${left},0)`).call(d3.axisLeft(y).ticks(6).tickSize(-side).tickFormat(''));
    svg.append('line').attr('class','zero-line').attr('x1',x(0)).attr('x2',x(0)).attr('y1',top).attr('y2',top+side);
    svg.append('line').attr('class','zero-line').attr('y1',y(0)).attr('y2',y(0)).attr('x1',left).attr('x2',left+side);
    svg.append('line').attr('class','diagonal').attr('x1',left).attr('y1',top+side).attr('x2',left+side).attr('y2',top);
    svg.append('g').attr('class','axis').attr('transform',`translate(0,${top+side})`).call(d3.axisBottom(x).ticks(6).tickPadding(10).tickFormat(v=>`${v}%`));
    svg.append('g').attr('class','axis').attr('transform',`translate(${left},0)`).call(d3.axisLeft(y).ticks(6).tickPadding(8).tickFormat(v=>`${v}%`));
    svg.append('text').attr('class','axis-label').attr('x',left).attr('y',12).text(`二手房${metricName()} / %`);
    svg.append('text').attr('class','axis-label').attr('x',left+side).attr('y',height-6).attr('text-anchor','end').text(`新房${metricName()} / % →`);
    svg.append('text').attr('class','quadrant').attr('x',left+10).attr('y',top+20).text('二手房表现更强');
    svg.append('text').attr('class','quadrant').attr('x',left+side-10).attr('y',top+side-13).attr('text-anchor','end').text('新房表现更强');
    const brush=d3.brush().extent([[left,top],[left+side,top+side]]).filter(e=>!e.button&&!state.playing).on('end',event=>{if(!event.sourceEvent)return;if(!event.selection)return;const [[x0,y0],[x1,y1]]=event.selection;state.selected=new Set(rows().filter(d=>valid(d.n)&&valid(d.r)&&x(d.n)>=x0&&x(d.n)<=x1&&y(d.r)>=y0&&y(d.r)<=y1).map(d=>d.city));state.explore=null;render();});
    svg.append('g').attr('class','brush').call(brush);
    const data=rows().filter(d=>valid(d.n)&&valid(d.r)).sort((a,b)=>(a.city===state.city)-(b.city===state.city));
    const dots=svg.append('g').selectAll('circle').data(data).join('circle').attr('class',d=>`city-dot${d.city===state.city?' selected':''}${state.selected.size&&!state.selected.has(d.city)?' dim':''}${state.selected.has(d.city)?' brushed':''}`).attr('cx',d=>x(d.n)).attr('cy',d=>y(d.r)).attr('r',d=>d.city===state.city?6:4.3).attr('tabindex',0).attr('role','button').attr('aria-label',d=>`查看${d.city}，新房${fmt(d.n)}%，二手房${fmt(d.r)}%`).on('pointerenter',showTip).on('pointermove',showTip).on('pointerleave',hideTip).on('click',(_,d)=>choose(d.city)).on('keydown',(e,d)=>{if(['Enter',' '].includes(e.key)){e.preventDefault();choose(d.city);}});
    const candidates=[state.city,'上海','北京','深圳','武汉','大理','银川'];
    const labels=data.filter(d=>candidates.includes(d.city)&&(!mobile||[state.city,'上海','北京'].includes(d.city))).sort((a,b)=>y(a.r)-y(b.r));
    const placed=[];
    for(const d of labels){let tx=x(d.n)+10,ty=y(d.r)-9;tx=Math.min(left+side-30,Math.max(left+4,tx));while(placed.some(p=>Math.abs(p.x-tx)<40&&Math.abs(p.y-ty)<16))ty-=17;ty=Math.max(top+12,ty);placed.push({x:tx,y:ty});if(Math.abs(ty-y(d.r))>19)svg.append('path').attr('class','label-leader').attr('d',`M${x(d.n)},${y(d.r)}L${tx-3},${ty-3}`);svg.append('text').attr('class',`city-label${d.city===state.city?' selected':''}`).attr('x',tx).attr('y',ty).text(d.city);}
  }
  function drawTrend(host,data,height=155){
    const w=host.clientWidth,h=height,m={left:31,right:12,top:12,bottom:25};
    const svg=d3.select(host).selectAll('svg').data([0]).join('svg').attr('viewBox',`0 0 ${w} ${h}`).attr('role','img').attr('aria-label',`${state.selected.size?'选中城市中位数':data[0]?.city||''}新房与二手房历史走势`);svg.selectAll('*').remove();
    const x=d3.scalePoint().domain(months).range([m.left,w-m.right]),y=d3.scaleLinear().domain(limits[state.metric].domain).range([h-m.bottom,m.top]);
    svg.append('g').attr('class','grid').attr('transform',`translate(${m.left},0)`).call(d3.axisLeft(y).ticks(3).tickSize(-(w-m.left-m.right)).tickFormat(''));
    svg.append('g').attr('class','axis').attr('transform',`translate(${m.left},0)`).call(d3.axisLeft(y).ticks(3).tickPadding(6).tickFormat(v=>`${v}%`));
    svg.append('g').attr('class','axis').attr('transform',`translate(0,${h-m.bottom})`).call(d3.axisBottom(x).tickValues([months[0],...months.filter(m=>m.endsWith('-01')).slice(1),months.at(-1)]).tickPadding(7).tickFormat(m=>m.replace('-','.')));
    if(months.includes('2026-01'))svg.append('line').attr('class','base-change').attr('x1',x('2026-01')).attr('x2',x('2026-01')).attr('y1',m.top).attr('y2',h-m.bottom);
    svg.append('line').attr('class','trend-selected').attr('x1',x(state.month)).attr('x2',x(state.month)).attr('y1',m.top).attr('y2',h-m.bottom);
    for(const [key,cls,color] of [['n','trend-new','#2863b9'],['r','trend-resale','#d98048']]){const line=d3.line().defined(d=>valid(d[key])).x(d=>x(d.month)).y(d=>y(d[key]));svg.append('path').datum(data).attr('class',cls).attr('d',line);const current=data.find(d=>d.month===state.month);if(current&&valid(current[key]))svg.append('circle').attr('cx',x(state.month)).attr('cy',y(current[key])).attr('r',3.3).attr('fill',color).attr('stroke','#fff').attr('stroke-width',1.3);}
    svg.append('rect').attr('x',m.left).attr('y',m.top).attr('width',w-m.left-m.right).attr('height',h-m.top-m.bottom).attr('fill','transparent').style('cursor','crosshair').on('pointermove',e=>{const [px]=d3.pointer(e);const month=months.reduce((best,m)=>Math.abs(x(m)-px)<Math.abs(x(best)-px)?m:best,months[0]);const d=data.find(d=>d.month===month);if(d)showTip(e,{...d,city:d.city||'选中城市中位数',gap:valid(d.n)&&valid(d.r)?d.n-d.r:null});}).on('pointerleave',hideTip).on('click',e=>{const [px]=d3.pointer(e);setMonth(months.reduce((best,m)=>Math.abs(x(m)-px)<Math.abs(x(best)-px)?m:best,months[0]));});
  }
  function renderDetail(){
    const group=state.selected.size>0,selected=rows().filter(d=>state.selected.has(d.city)),d=group?{n:med(selected,'n'),r:med(selected,'r'),gap:med(selected,'gap')}:pair(state.city);
    $('#detail-kicker').textContent=group?'框选城市 · 等权中位数':'当前城市';$('#city-name').textContent=group?`${selected.length} 座城市`:state.city;$('#detail-period').textContent=state.month.replace('-','.');
    $('#new-value').innerHTML=`${fmt(d.n)}<small>%</small>`;$('#resale-value').innerHTML=`${fmt(d.r)}<small>%</small>`;$('#gap-value').innerHTML=`${fmt(d.gap)}<small>点</small>`;
    $('#pin').hidden=group;$('#pin').textContent=state.compare.includes(state.city)?'✓ 已加入对比':'＋ 加入对比';
    const rest=rows().filter(d=>!state.selected.has(d.city)),restGap=med(rest,'gap');
    $('#city-insight').textContent=group?`所选城市差值中位数为 ${fmt(d.gap)} 个百分点；其余${rest.length}城为 ${fmt(restGap)} 个百分点。`:valid(d.gap)?`本月新房${metricName()}涨跌幅比二手房${d.gap>=0?'高':'低'} ${Math.abs(d.gap).toFixed(1)} 个百分点。`:'该城市本月数据缺失。';
    $('#history-heading').textContent=group?'所选城市的中位数走势':'历史走势';
    const history=group?months.map(month=>{const rs=[...state.selected].map(c=>pair(c,month));return {month,n:med(rs,'n'),r:med(rs,'r')};}):months.map(m=>pair(state.city,m));
    drawTrend($('#city-trend'),history,$('#city-trend').clientHeight);
    $('#rank-heading').textContent=group?'框选城市':'本月新旧房差距';
    const sorted=(group?selected:rows()).filter(d=>valid(d.gap)).sort((a,b)=>Math.abs(b.gap)-Math.abs(a.gap)).slice(0,4),max=d3.max(rows(),d=>Math.abs(d.gap))||1;
    d3.select('#ranking').selectAll('button').data(sorted,d=>d.city).join('button').attr('class',d=>`rank-row${d.city===state.city&&!group?' active':''}`).attr('aria-label',d=>`查看${d.city}`).html(d=>`<span>${escape(d.city)}</span><span class="rank-track"><i class="rank-bar" style="width:${Math.abs(d.gap)/max*100}%"></i></span><span>${fmt(d.gap)}</span>`).on('click',(_,d)=>choose(d.city));
  }
  function renderCompare(){
    $('#compare-count').textContent=`${state.compare.length} / 5`;
    $('#comparisons').style.gridTemplateColumns=innerWidth>540?`repeat(${Math.min(3,Math.max(1,state.compare.length))},minmax(0,1fr))`:'';
    const root=d3.select('#comparisons');root.selectAll('.empty-compare').remove();
    const cards=root.selectAll('.compare-card').data(state.compare,d=>d).join('article').attr('class','compare-card');
    cards.each(function(city){const d=pair(city);this.innerHTML=`<div class="compare-heading"><button class="city-link">${escape(city)} <span style="color:#9ca6b1;font-weight:400">↗</span></button><span class="compare-numbers">${fmt(d.n)}%<span>${fmt(d.r)}%</span></span><button class="remove" aria-label="移除${escape(city)}">×</button></div><div class="compare-chart"></div>`;this.querySelector('.city-link').onclick=()=>{choose(city);$('#city-name').scrollIntoView({block:'nearest',behavior:'smooth'});};this.querySelector('.remove').onclick=()=>{state.compare=state.compare.filter(c=>c!==city);render();};drawTrend(this.querySelector('.compare-chart'),months.map(m=>pair(city,m)),this.querySelector('.compare-chart').clientHeight);});
    if(!state.compare.length)root.append('p').attr('class','empty-compare').text('选择一座城市，点击「加入对比」开始比较。');
  }
  function renderHeat(){if(!$('#heat-details').open)return;const table=d3.select('#heatmap');table.selectAll('*').remove();const color=d3.scaleLinear().domain([-limits[state.metric].gap,0,limits[state.metric].gap]).range(['#4884bd','#f3f4f6','#cf8554']);const sorted=rows().sort((a,b)=>(b.gap??-Infinity)-(a.gap??-Infinity));const tr=table.append('thead').append('tr');tr.append('th').attr('class','city-head').attr('scope','col').text('城市');tr.selectAll('.month').data(months).join('th').attr('scope','col').text(m=>m.slice(2).replace('-','.'));
    const body=table.append('tbody');for(const d of sorted){const row=body.append('tr');row.append('th').attr('class','city-head').attr('scope','row').text(d.city);row.selectAll('td').data(months.map(m=>pair(d.city,m))).join('td').attr('data-city',d=>d.city).attr('data-month',d=>d.month).attr('class',d=>d.city===state.city&&d.month===state.month?'active-cell':'').attr('tabindex',0).attr('role','button').attr('aria-label',d=>`${d.city} ${d.month} 差值${fmt(d.gap)}个百分点`).style('background',d=>valid(d.gap)?color(d.gap):'#d5dae1').on('pointermove',showTip).on('pointerleave',hideTip).on('click',(_,d)=>{stop();state.month=d.month;choose(d.city);}).on('keydown',(e,d)=>{if(['Enter',' '].includes(e.key)){e.preventDefault();stop();state.month=d.month;choose(d.city);}});}
  }
  function render(){
    const current=rows();$('#new-falling').textContent=current.filter(d=>valid(d.n)&&d.n<0).length;$('#resale-falling').textContent=current.filter(d=>valid(d.r)&&d.r<0).length;$('#opposite-summary').innerHTML=`<strong>${current.filter(d=>valid(d.n)&&valid(d.r)&&d.n*d.r<0).length}</strong> 座城市的新房与<br>二手房涨跌方向相反`;
    $('#month-label').textContent=state.month.replace('-','.');$('#month').value=months.indexOf(state.month);$('#prev').disabled=state.month===months[0];$('#next').disabled=state.month===months.at(-1);
    document.querySelectorAll('[data-metric]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.metric===state.metric)));document.querySelectorAll('[data-explore]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.explore===state.explore)));$('#clear').hidden=!state.selected.size&&!state.explore;$('#scatter-subtitle').textContent=`${metricName()}涨跌幅，% · 坐标跨月固定`;
    $('#source-link').href=index.get(`${state.month}|${state.city}|new`)?.source||'../data/sources.json';
    renderScatter();renderDetail();renderCompare();renderHeat();
    const p=new URLSearchParams({m:state.month,metric:state.metric,city:state.city});history.replaceState(null,'',`${location.pathname}?${p}`);
  }
  $('#coverage').textContent=`${cities.length} 座城市 · ${months.length} 个月`;
  $('#start-label').textContent=months[0].replace('-','.');$('#end-label').textContent=months.at(-1).replace('-','.');$('#month').max=months.length-1;
  d3.select('#city-options').selectAll('option').data(cities).join('option').attr('value',d=>d);
  $('#prev').onclick=()=>setMonth(months[months.indexOf(state.month)-1]);$('#next').onclick=()=>setMonth(months[months.indexOf(state.month)+1]);$('#month').oninput=e=>setMonth(months[+e.target.value]);
  $('#play').onclick=()=>{if(state.playing){stop();return;}state.playing=true;$('#play').textContent='Ⅱ';$('#play').setAttribute('aria-label','暂停播放');if(state.month===months.at(-1))setMonth(months[0],false);timer=setInterval(()=>{const i=months.indexOf(state.month);if(i>=months.length-1){stop();return;}setMonth(months[i+1],false);},900);};
  document.querySelectorAll('[data-metric]').forEach(b=>b.onclick=()=>{stop();state.metric=b.dataset.metric;state.selected.clear();state.explore=null;render();});
  document.querySelectorAll('[data-explore]').forEach(b=>b.onclick=()=>{if(state.explore===b.dataset.explore){state.explore=null;state.selected.clear();}else applyExplore(b.dataset.explore);render();});
  $('#clear').onclick=()=>{state.selected.clear();state.explore=null;render();};$('#pin').onclick=()=>pin(state.city);
  function search(){const city=$('#city-search').value.trim();if(cities.includes(city)){choose(city);$('#city-search').value='';}else if(city)notice('没有找到这座城市，请从70城名单中选择。');}
  $('#search-form').onsubmit=e=>{e.preventDefault();search();};$('#city-search').onchange=()=>{if(cities.includes($('#city-search').value.trim()))search();};
  $('#heat-details').ontoggle=renderHeat;document.addEventListener('keydown',e=>{if(e.key==='Escape'){hideTip();state.selected.clear();state.explore=null;render();}});
  let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{hideTip();render();},120);});
  render();window.housingPreview={state,pair,limits,render,choose};
})();
