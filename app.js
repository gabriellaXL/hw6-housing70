/* All charts use official period indices; no synthetic observations. D3 v7.9.0. */
'use strict';
(async function () {
  const $ = s => document.querySelector(s);
  const defaults = ['北京', '上海', '广州', '深圳'];
  const tip = $('#tooltip');
  const fmt = v => v == null || !Number.isFinite(v) ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(1)}`;
  const valid = v => v != null && Number.isFinite(v);
  const escape = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let records, meta, sources;
  try {
    [records, meta, sources] = await Promise.all(['data/housing.json','data/metadata.json','data/sources.json'].map(async p => {
      const r = await fetch(p); if (!r.ok) throw new Error(`${p}: ${r.status}`); return r.json();
    }));
  } catch (error) {
    $('#coverage').textContent = '数据加载失败';
    $('#status').textContent = `无法加载静态数据。请通过 HTTP 服务打开此页面。${error.message}`;
    return;
  }
  const months = meta.months, cities = meta.cities;
  const index = new Map(records.map(r => [`${r.month}|${r.city}|${r.type}`,r]));
  const get = (city, month, type, metric) => {
    const v = index.get(`${month}|${city}|${type}`)?.[`${metric}_index`];
    return valid(v) ? Math.round((v - 100) * 10) / 10 : null;
  };
  const pair = (city, month, metric) => {
    const n = get(city,month,'new',metric), r = get(city,month,'resale',metric);
    return {city,month,n,r,gap:valid(n)&&valid(r)?Math.round((n-r)*10)/10:null};
  };
  const params = new URLSearchParams(location.search);
  const parseCities = raw => [...new Set((raw || '').split(','))].filter(c => cities.includes(c));
  const state = {
    month: months.includes(params.get('m')) ? params.get('m') : months.at(-1),
    metric: params.get('metric') === 'mom' ? 'mom' : 'yoy',
    compare: params.has('c') ? parseCities(params.get('c')).slice(0,5) : [...defaults],
    selected: new Set(parseCities(params.get('s'))),
    heat: ['new','resale','gap'].includes(params.get('heat')) ? params.get('heat') : 'gap',
    sort: ['original','value','gap'].includes(params.get('sort')) ? params.get('sort') : 'gap',
    focus: params.get('focus') === '1', hovered: null, playing: false
  };
  const limits = {};
  for (const metric of ['mom','yoy']) {
    const values = records.flatMap(r => valid(r[`${metric}_index`]) ? [r[`${metric}_index`]-100] : []);
    const extent = d3.extent(values);
    const pad = (extent[1]-extent[0])*.07;
    const domain = d3.scaleLinear().domain([Math.min(0,extent[0])-pad,Math.max(0,extent[1])+pad]).nice(6).domain();
    const gapMax = d3.max(months.flatMap(m => cities.map(c => Math.abs(pair(c,m,metric).gap ?? 0)))) || 1;
    limits[metric] = {domain, valueMax: d3.max(values,Math.abs)||1, gapMax};
  }
  let timer, noticeTimer;
  const metricName = () => state.metric === 'yoy' ? '同比' : '环比';
  const current = () => cities.map(c => pair(c,state.month,state.metric));
  function notice(message) {
    clearTimeout(noticeTimer); $('#status').textContent = message;
    noticeTimer = setTimeout(() => { $('#status').textContent = ''; }, 6000);
  }
  function showTip(event, html) {
    tip.innerHTML = html; tip.hidden = false;
    const width = tip.offsetWidth, height = tip.offsetHeight;
    tip.style.left = `${Math.max(8,Math.min(event.clientX+16,innerWidth-width-12))}px`;
    tip.style.top = `${Math.max(8,Math.min(event.clientY+16,innerHeight-height-12))}px`;
  }
  function hideTip() {tip.hidden = true;}
  function tipPair(event,d) {
    showTip(event,`<strong>${escape(d.city)} <span class="tip-muted">${d.month}</span></strong>${metricName()} / 新房 ${fmt(d.n)}%<br>二手房 ${fmt(d.r)}%<br>新房 − 二手房 ${fmt(d.gap)} 个百分点`);
  }
  function syncURL() {
    const p = new URLSearchParams({m:state.month, metric:state.metric,c:state.compare.join(','),heat:state.heat,sort:state.sort});
    if(state.selected.size) p.set('s',[...state.selected].join(','));
    if(state.focus) p.set('focus','1');
    history.replaceState(null,'',`${location.pathname}?${p}${location.hash}`);
  }
  function hover(city) {
    state.hovered = city;
    d3.selectAll('.city-dot').classed('hovered',d=>d.city===city);
    d3.selectAll('#heatmap tbody tr').classed('row-hover',d=>d===city);
    d3.selectAll('.trend-card').style('opacity',d=>city && d!==city ? .48 : 1);
  }
  function stop() {
    clearInterval(timer); state.playing=false;
    $('#play').textContent='▶'; $('#play').setAttribute('aria-label','播放月份');
    d3.select('#scatter .brush').style('pointer-events',null);
  }
  function setMonth(m,manual=true) {
    if (!months.includes(m)) return;
    if(manual) stop();
    state.month=m; hideTip(); render(true);
  }
  function addCity(city) {
    if(state.compare.includes(city)) return true;
    if(state.compare.length>=5) {notice('最多对比五座城市，请先移除一座再添加。');return false;}
    state.compare.push(city); render(); return true;
  }
  function setSelected(names) {
    state.selected = new Set(names);
    renderSelection(); renderHeat(); syncURL();
  }
  function renderSelection() {
    const rows = current(), has = state.selected.size>0;
    const selected = has ? rows.filter(d=>state.selected.has(d.city)) : rows;
    const rest = has ? rows.filter(d=>!state.selected.has(d.city)) : [];
    $('#selection-title').textContent=has?`选中 ${selected.length} 城`:'全体 70 城';
    $('#selection-note').textContent=has?'选中城市跨月份保留；切换同比／环比将清除框选。':'在左图框选，比较一组城市与其余城市。';
    $('#clear-brush').disabled=!has;
    const med = (rows,k) => { const vs=rows.map(d=>d[k]).filter(valid);return vs.length?d3.median(vs):null;};
    const span = v => `<span class="stat-value ${v<0?'negative':v>0?'positive':''}">${fmt(v)}</span>`;
    $('#group-stats').innerHTML=`<div class="stats-header"><span>城市等权中位数</span><span>${has?'选中组':'全体'} (${selected.length})</span><span>其余 (${rest.length})</span></div>`+
      [['n','新房 / %'],['r','二手房 / %'],['gap','差值 / 百分点']].map(([key,label])=>`<div class="stat-row"><span>${label}</span>${span(med(selected,key))}${span(med(rest,key))}</div>`).join('');
    $('#selection-list-title').textContent=has?'框选城市 · 添加到对比':'当前新旧房差值最大的城市';
    const list = has?selected:[...rows].filter(d=>valid(d.gap)).sort((a,b)=>Math.abs(b.gap)-Math.abs(a.gap)).slice(0,8);
    d3.select('#selected-list').selectAll('button').data(list,d=>d.city).join('button').attr('class','city-add')
      .attr('aria-label',d=>`添加${d.city}到对比`).text(d=>`${d.city} ${state.compare.includes(d.city)?'✓':'+'}`)
      .on('click',(_,d)=>addCity(d.city)).on('mouseenter',(_,d)=>hover(d.city)).on('mouseleave',()=>hover(null));
    d3.selectAll('.city-dot').classed('brushed',d=>state.selected.has(d.city)).classed('dimmed',d=>has&&!state.selected.has(d.city));
  }
  function renderScatter(animate=false) {
    const root = d3.select('#scatter');
    const w=600,h=540,margin={left:62,right:30,top:30,bottom:64};
    const side=Math.min(w-margin.left-margin.right,h-margin.top-margin.bottom);
    const x=d3.scaleLinear().domain(limits[state.metric].domain).range([margin.left,margin.left+side]);
    const y=d3.scaleLinear().domain(limits[state.metric].domain).range([margin.top+side,margin.top]);
    let svg=root.select('svg');
    const first=svg.empty();
    if(first) {
      svg=root.append('svg').attr('viewBox',`0 0 ${w} ${h}`).attr('role','img').attr('aria-label','新房与二手房涨跌幅散点图，可拖动框选城市');
      svg.append('defs').append('marker').attr('id','trajectory-arrow').attr('viewBox','0 -3 6 6').attr('refX',5).attr('markerWidth',5).attr('markerHeight',5).attr('orient','auto').append('path').attr('d','M0,-3L6,0L0,3').attr('fill','#237d79');
      ['grid-x','grid-y','refs','trails','brush','dots','labels','axis-x','axis-y','captions'].forEach(cls=>svg.append('g').attr('class',cls));
    }
    svg.select('.grid-x').attr('class','grid grid-x').attr('transform',`translate(0,${margin.top+side})`).call(d3.axisBottom(x).ticks(6).tickSize(-side).tickFormat(''));
    svg.select('.grid-y').attr('class','grid grid-y').attr('transform',`translate(${margin.left},0)`).call(d3.axisLeft(y).ticks(6).tickSize(-side).tickFormat(''));
    svg.select('.axis-x').attr('class','axis axis-x').attr('transform',`translate(0,${margin.top+side})`).call(d3.axisBottom(x).ticks(6).tickSize(0).tickPadding(10).tickFormat(d=>`${d}%`));
    svg.select('.axis-y').attr('class','axis axis-y').attr('transform',`translate(${margin.left},0)`).call(d3.axisLeft(y).ticks(6).tickSize(0).tickPadding(9).tickFormat(d=>`${d}%`));
    svg.select('.refs').selectAll('*').remove();
    svg.select('.refs').append('line').attr('class','zero-line').attr('x1',x(0)).attr('x2',x(0)).attr('y1',margin.top).attr('y2',margin.top+side);
    svg.select('.refs').append('line').attr('class','zero-line').attr('y1',y(0)).attr('y2',y(0)).attr('x1',margin.left).attr('x2',margin.left+side);
    svg.select('.refs').append('line').attr('class','equal-line').attr('x1',x(x.domain()[0])).attr('y1',y(x.domain()[0])).attr('x2',x(x.domain()[1])).attr('y2',y(x.domain()[1]));
    svg.select('.captions').selectAll('*').remove();
    svg.select('.captions').append('text').attr('class','axis-label').attr('x',margin.left+side/2).attr('y',h-12).attr('text-anchor','middle').text(`新房${metricName()}涨跌幅 →`);
    svg.select('.captions').append('text').attr('class','axis-label').attr('transform',`translate(15,${margin.top+side/2}) rotate(-90)`).attr('text-anchor','middle').text(`二手房${metricName()}涨跌幅 →`);
    svg.select('.captions').append('text').attr('class','quadrant-label').attr('x',margin.left+8).attr('y',margin.top+12).text('二手房变化高于新房');
    svg.select('.captions').append('text').attr('class','quadrant-label').attr('x',margin.left+side-6).attr('y',margin.top+side-10).attr('text-anchor','end').text('新房变化高于二手房');
    const i=months.indexOf(state.month), recent=months.slice(Math.max(0,i-5),i+1);
    const line=d3.line().defined(d=>valid(d.n)&&valid(d.r)).x(d=>x(d.n)).y(d=>y(d.r));
    svg.select('.trails').selectAll('path').data(state.compare,d=>d).join('path').attr('class','trajectory').attr('marker-end','url(#trajectory-arrow)').attr('d',c=>line(recent.map(m=>pair(c,m,state.metric))));
    const rows=current().filter(d=>valid(d.n)&&valid(d.r));
    const dots=svg.select('.dots').selectAll('circle').data(rows,d=>d.city).join(enter=>enter.append('circle').attr('cx',d=>x(d.n)).attr('cy',d=>y(d.r)))
      .attr('class',d=>`city-dot${state.compare.includes(d.city)?' compared':''}`).attr('r',d=>state.compare.includes(d.city)?5.5:4.2)
      .attr('tabindex',0).attr('role','button').attr('aria-label',d=>`${d.city}，新房${fmt(d.n)}%，二手房${fmt(d.r)}%，点击添加对比`)
      .on('pointerenter',(e,d)=>{hover(d.city);tipPair(e,d);}).on('pointermove',tipPair)
      .on('pointerleave',()=>{hover(null);hideTip();}).on('click',(_,d)=>addCity(d.city))
      .on('keydown',(e,d)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();addCity(d.city);}});
    dots.interrupt();
    if(animate && !matchMedia('(prefers-reduced-motion: reduce)').matches) dots.transition().duration(450).attr('cx',d=>x(d.n)).attr('cy',d=>y(d.r));
    else dots.attr('cx',d=>x(d.n)).attr('cy',d=>y(d.r));
    const placed=[];
    const labels=rows.filter(d=>state.compare.includes(d.city)).sort((a,b)=>y(a.r)-y(b.r)).map(d=>{
      let lx=x(d.n)+8,ly=y(d.r)-8;
      for(let tries=0;tries<8&&placed.some(p=>Math.abs(p.x-lx)<38&&Math.abs(p.y-ly)<14);tries++)ly+=15;
      placed.push({x:lx,y:ly});return {...d,lx,ly};
    });
    const labelGroups=svg.select('.labels').selectAll('g').data(labels,d=>d.city).join(enter=>{
      const g=enter.append('g');g.append('line');g.append('text').attr('class','city-label');return g;
    });
    labelGroups.select('line').attr('x1',d=>x(d.n)+3).attr('y1',d=>y(d.r)).attr('x2',d=>d.lx-2).attr('y2',d=>d.ly-3).attr('stroke','#a5b9a7').attr('stroke-width',.7);
    labelGroups.select('text').attr('x',d=>d.lx).attr('y',d=>d.ly).text(d=>d.city);
    const brush=d3.brush().extent([[margin.left,margin.top],[margin.left+side,margin.top+side]])
      .on('start',()=>hideTip()).on('end',event=>{
        if(!event.sourceEvent||state.playing)return;
        if(!event.selection){setSelected([]);return;}
        const [[x0,y0],[x1,y1]]=event.selection;
        setSelected(rows.filter(d=>x(d.n)>=x0&&x(d.n)<=x1&&y(d.r)>=y0&&y(d.r)<=y1).map(d=>d.city));
      });
    svg.select('.brush').call(brush).call(brush.move,null).style('pointer-events',state.playing?'none':null);
    // Dot hit targets sit above the brush; empty plot space remains brushable.
    $('#scatter-tag').textContent=`${metricName()} · %`;
  }
  function renderCompareControls() {
    d3.select('#comparison-chips').selectAll('.chip').data(state.compare,d=>d).join(enter=>{
      const chip=enter.append('span').attr('class','chip');chip.append('span');chip.append('button').text('×');return chip;
    }).each(function(city){
      d3.select(this).select('span').text(city);
      d3.select(this).select('button').attr('aria-label',`移除${city}`).on('click',()=>{state.compare=state.compare.filter(c=>c!==city);render();});
    });
    $('#comparison-count').textContent=`${state.compare.length} / 5 城`;
  }
  function renderTrends() {
    const cards=d3.select('#trends').selectAll('.trend-card').data(state.compare,d=>d).join(enter=>{
      const card=enter.append('article').attr('class','trend-card');card.append('div').attr('class','trend-title');card.append('svg');return card;
    });
    if(!state.compare.length) {
      d3.select('#trends').selectAll('.empty').data([0]).join('p').attr('class','empty').text('搜索城市，开始比较它们的时间线。');return;
    }
    d3.select('#trends').selectAll('.empty').remove();
    cards.each(function(city){
      const card=d3.select(this),w=300,h=235,margin={left:40,right:14,top:18,bottom:36};
      const x=d3.scaleLinear().domain([0,months.length-1]).range([margin.left,w-margin.right]);
      const y=d3.scaleLinear().domain(limits[state.metric].domain).range([h-margin.bottom,margin.top]);
      const d=pair(city,state.month,state.metric);
      card.select('.trend-title').html(`<h3>${city}</h3><span>新 ${fmt(d.n)} / 旧 ${fmt(d.r)}%</span>`);
      const svg=card.select('svg').attr('viewBox',`0 0 ${w} ${h}`).attr('role','img').attr('aria-label',`${city}新房和二手房${metricName()}趋势`);
      svg.selectAll('*').remove();
      svg.append('g').attr('class','grid').attr('transform',`translate(${margin.left},0)`).call(d3.axisLeft(y).ticks(4).tickSize(-(w-margin.left-margin.right)).tickFormat(''));
      svg.append('line').attr('class','zero-line').attr('x1',margin.left).attr('x2',w-margin.right).attr('y1',y(0)).attr('y2',y(0));
      const ticks=[0,12,24,months.length-1].filter((v,i,a)=>v<months.length&&a.indexOf(v)===i);
      svg.append('g').attr('class','axis').attr('transform',`translate(0,${h-margin.bottom})`).call(d3.axisBottom(x).tickValues(ticks).tickSize(0).tickPadding(11).tickFormat(i=>months[i].replace('-','.'))).selectAll('text').attr('font-size',9);
      svg.append('g').attr('class','axis').attr('transform',`translate(${margin.left},0)`).call(d3.axisLeft(y).ticks(4).tickSize(0).tickPadding(7).tickFormat(v=>`${v}%`));
      const change=months.indexOf('2026-01');
      if(change>=0) svg.append('line').attr('class','baseline-line').attr('x1',x(change)).attr('x2',x(change)).attr('y1',margin.top).attr('y2',h-margin.bottom);
      const series=months.map((m,i)=>({...pair(city,m,state.metric),i}));
      for(const [key,color,dash] of [['n','#237d79',null],['r','#c77448','4 3']]) {
        svg.append('path').datum(series).attr('class','trend-line').attr('stroke',color).attr('stroke-dasharray',dash).attr('d',d3.line().defined(d=>valid(d[key])).x(d=>x(d.i)).y(d=>y(d[key])));
        if(valid(d[key])) svg.append('circle').attr('cx',x(months.indexOf(state.month))).attr('cy',y(d[key])).attr('r',3).attr('fill',color).attr('stroke','#fffefa').attr('stroke-width',1);
      }
      svg.append('line').attr('x1',x(months.indexOf(state.month))).attr('x2',x(months.indexOf(state.month))).attr('y1',margin.top).attr('y2',h-margin.bottom).attr('stroke','#7f927d').attr('opacity',.3);
      const cross=svg.append('line').attr('y1',margin.top).attr('y2',h-margin.bottom).attr('stroke','#879a80').attr('stroke-dasharray','2 3').style('display','none');
      svg.append('rect').attr('x',margin.left).attr('y',margin.top).attr('width',w-margin.left-margin.right).attr('height',h-margin.top-margin.bottom).attr('fill','transparent').attr('cursor','crosshair')
        .on('pointermove',function(e){const i=Math.max(0,Math.min(months.length-1,Math.round(x.invert(d3.pointer(e,this)[0]))));cross.style('display',null).attr('x1',x(i)).attr('x2',x(i));tipPair(e,series[i]);hover(city);})
        .on('pointerleave',()=>{cross.style('display','none');hideTip();hover(null);})
        .on('click',function(e){const i=Math.max(0,Math.min(months.length-1,Math.round(x.invert(d3.pointer(e,this)[0]))));setMonth(months[i]);});
    });
  }
  function renderHeat() {
    const max=state.heat==='gap'?limits[state.metric].gapMax:limits[state.metric].valueMax;
    const color=d3.scaleLinear().domain([-max,0,max]).range(['#467c91','#f0f0e5','#c06c49']).clamp(true);
    const value=d=>state.heat==='gap'?d.gap:state.heat==='new'?d.n:d.r;
    let order=[...cities];
    const currentMap=new Map(current().map(d=>[d.city,d]));
    if(state.sort!=='original') order.sort((a,b)=>{
      const av=state.sort==='gap'?currentMap.get(a).gap:value(currentMap.get(a));
      const bv=state.sort==='gap'?currentMap.get(b).gap:value(currentMap.get(b));
      return (bv??-Infinity)-(av??-Infinity)||cities.indexOf(a)-cities.indexOf(b);
    });
    if(state.focus)order=order.filter(c=>state.selected.has(c));
    $('#heat-empty').hidden=order.length>0;
    $('#heat-tag').textContent=`${order.length} 城 × ${months.length} 个月`;
    $('#legend-low').textContent=fmt(-max);$('#legend-high').textContent=fmt(max);
    $('#heat-unit').textContent=state.heat==='gap'?'百分点':'%';
    $('#heat-gradient').style.background=`linear-gradient(to right,${color(-max)},${color(0)},${color(max)})`;
    const table=d3.select('#heatmap');
    table.selectAll('thead').data([0]).join('thead').selectAll('tr').data([0]).join('tr').selectAll('th').data(['城市',...months]).join('th')
      .attr('scope','col').attr('class',m=>m==='城市'?'city-head':`${m===state.month?'current-month':''} ${m==='2026-01'?'change-col':''}`)
      .text(m=>m==='城市'?m:m.replace(/^20/,'').replace('-','.'));
    const rows=table.selectAll('tbody').data([0]).join('tbody').selectAll('tr').data(order,d=>d).join('tr').attr('data-city',d=>d)
      .classed('brushed-row',d=>state.selected.has(d)).on('pointerenter',(_,c)=>hover(c)).on('pointerleave',()=>{hideTip();hover(null);});
    rows.each(function(city){
      const row=d3.select(this);
      row.selectAll('th').data([city]).join('th').attr('scope','row').attr('class','city-head').text(city);
      row.selectAll('td').data(months.map(m=>pair(city,m,state.metric)),d=>d.month).join('td')
        .attr('class',d=>`${d.month===state.month?'current-month':''} ${d.month==='2026-01'?'change-col':''}`)
        .attr('data-month',d=>d.month).attr('data-city',city)
        .attr('tabindex',0).attr('role','button').attr('aria-label',d=>`${city} ${d.month} ${state.heat==='gap'?'新旧房差值':state.heat==='new'?'新房':'二手房'}${fmt(value(d))}${state.heat==='gap'?'个百分点':'%'}`)
        .style('background-color',d=>valid(value(d))?color(value(d)):'#d5d9d0')
        .on('pointermove',tipPair)
        .on('click',(_,d)=>{setMonth(d.month);if(!addCity(city))notice(`已定位 ${city} · ${d.month}；对比已达五城，请先移除一座。`);})
        .on('keydown',(e,d)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setMonth(d.month);addCity(city);}});
    });
  }
  function render(animate=false) {
    $('#month').value=months.indexOf(state.month);$('#month-label').textContent=state.month.replace('-','.');
    $('#prev').disabled=state.month===months[0];$('#next').disabled=state.month===months.at(-1);
    $('#metric-help').textContent=state.metric==='yoy'?'与上年同月比较':'与上月比较';
    document.querySelectorAll('[data-metric]').forEach(el=>el.setAttribute('aria-pressed',el.dataset.metric===state.metric));
    document.querySelectorAll('[data-heat]').forEach(el=>el.setAttribute('aria-pressed',el.dataset.heat===state.heat));
    $('#sort').value=state.sort;$('#focus').checked=state.focus;
    renderScatter(animate);renderSelection();renderCompareControls();renderTrends();renderHeat();syncURL();
  }
  $('#month').max=months.length-1;
  $('#month').addEventListener('input',e=>setMonth(months[+e.target.value]));
  $('#prev').onclick=()=>setMonth(months[months.indexOf(state.month)-1]);
  $('#next').onclick=()=>setMonth(months[months.indexOf(state.month)+1]);
  $('#play').onclick=()=>{
    if(state.playing){stop();return;}
    if(state.month===months.at(-1))setMonth(months[0]);
    state.playing=true;$('#play').textContent='Ⅱ';$('#play').setAttribute('aria-label','暂停播放');
    d3.select('#scatter .brush').style('pointer-events','none');hideTip();
    timer=setInterval(()=>{const i=months.indexOf(state.month);if(i>=months.length-1){stop();return;}setMonth(months[i+1],false);},1100);
  };
  document.querySelectorAll('[data-metric]').forEach(el=>el.onclick=()=>{
    if(state.metric===el.dataset.metric)return;stop();state.metric=el.dataset.metric;state.selected.clear();render();
  });
  document.querySelectorAll('[data-heat]').forEach(el=>el.onclick=()=>{state.heat=el.dataset.heat;renderHeat();syncURL();document.querySelectorAll('[data-heat]').forEach(e=>e.setAttribute('aria-pressed',e.dataset.heat===state.heat));});
  $('#sort').onchange=e=>{state.sort=e.target.value;renderHeat();syncURL();};
  $('#focus').onchange=e=>{state.focus=e.target.checked;renderHeat();syncURL();};
  $('#clear-brush').onclick=()=>{state.selected.clear();render();};
  $('#reset').onclick=()=>{
    stop();Object.assign(state,{month:months.at(-1),metric:'yoy',compare:[...defaults],selected:new Set(),heat:'gap',sort:'gap',focus:false,hovered:null});
    $('#city-search').value='';$('#city-results').replaceChildren();hideTip();render();notice('已恢复最新月份、同比与默认四城。');
  };
  $('#share').onclick=async()=>{
    syncURL();try{await navigator.clipboard.writeText(location.href);notice('当前视图链接已复制，包含月份、指标、对比城市和框选城市。');}
    catch{notice('浏览器未允许复制，可直接复制地址栏中的当前视图链接。');}
  };
  function searchCities() {
    const text=$('#city-search').value.trim();
    const found=cities.filter(c=>c.includes(text)&&!state.compare.includes(c));
    const box=d3.select('#city-results');box.selectAll('*').remove();
    if(!found.length){box.append('div').attr('class','micro').text('没有匹配的城市');return;}
    box.selectAll('button').data(found.slice(0,12)).join('button').text(c=>`${c} +`).on('click',(_,c)=>{
      if(addCity(c)){$('#city-search').value='';box.selectAll('*').remove();$('#city-search').focus();}
    });
  }
  $('#city-search').oninput=searchCities;$('#city-search').onfocus=searchCities;
  $('#city-search').onkeydown=e=>{if(e.key==='Escape')$('#city-results').replaceChildren();if(e.key==='Enter'){$('#city-results button')?.click();e.preventDefault();}};
  document.addEventListener('click',e=>{if(!e.target.closest('.search-wrap'))$('#city-results').replaceChildren();});
  $('#question-opposite').onclick=()=>{
    stop();const names=current().filter(d=>valid(d.n)&&valid(d.r)&&d.n*d.r<0).map(d=>d.city);setSelected(names);
    notice(`${state.month} · ${metricName()}：严格涨跌方向相反的城市有 ${names.length} 座（零值不计入）。`);
    $('#scatter-section').scrollIntoView({behavior:'smooth',block:'start'});
  };
  $('#question-gap').onclick=()=>{
    stop();const names=current().filter(d=>valid(d.gap)).sort((a,b)=>Math.abs(b.gap)-Math.abs(a.gap)).slice(0,5).map(d=>d.city);
    state.compare=names;state.selected=new Set(names);state.heat='gap';state.sort='gap';render();
    notice(`${state.month} · ${metricName()}：已对比新旧房绝对差值最大的五城。`);
  };
  $('#question-city').onclick=()=>{$('#trends-section').scrollIntoView({behavior:'smooth'});$('#city-search').focus({preventScroll:true});};
  $('#coverage').textContent=`截至 ${meta.latest_month.replace('-',' 年 ')} 月 · ${months.length} 个月 · ${meta.count.toLocaleString()} 条记录`;
  $('#range-end').textContent=meta.latest_month.replace('-','.');$('#end-year').textContent=meta.latest_month.slice(0,4);
  $('#latest-source').href=sources.at(-1).url;
  $('#validation-summary').textContent=`数据核验：${months.length} × 70 × 2 = ${meta.count.toLocaleString()} 条，重复键 ${meta.duplicate_keys}，缺失数值 ${meta.missing_values}。来源复核时间：${new Date(meta.release_checked_at||meta.checked_at).toLocaleDateString('zh-CN')}。`;
  d3.select('#source-list').selectAll('a').data(sources).join('a').attr('href',d=>d.url).attr('target','_blank').attr('rel','noopener').text(d=>`${d.month} ↗`);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
  // Narrow inspection surface for repeatable data and browser validation.
  window.housingApp={state,months,cities,limits,get,pair,current,setMonth,addCity,setSelected,stop};
  render();
})();
