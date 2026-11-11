/* Explicit discovery rules and a separate city inspection view. */
'use strict';
window.initExplore = function(api) {
  const {state,months,cities,limits,pair,current,setMonth,stop,syncURL,fmt,valid,showTip,hideTip}=api;
  const $=s=>document.querySelector(s), dialog=$('#city-detail');
  const params=new URLSearchParams(location.search);
  const modes=['minority','gap','turn'], types=['new','resale','gap'];
  Object.assign(state,{
    unusual:modes.includes(params.get('unusual'))?params.get('unusual'):'minority',
    detailCity:cities.includes(params.get('detail'))?params.get('detail'):null,
    detailType:types.includes(params.get('detailType'))?params.get('detailType'):'new',
    detailZoom:params.get('zoom')!=='0'
  });
  let inspectionGroup=[];
  const metricName=()=>state.metric==='yoy'?'同比':'环比';
  const name=t=>({new:'新房',resale:'二手房',gap:'新旧房差值'}[t]);
  const key=t=>({new:'n',resale:'r',gap:'gap'}[t]);
  const unit=t=>t==='gap'?' 个百分点':'%';
  const values=(rows,k)=>rows.map(d=>d[k]).filter(valid).sort(d3.ascending);
  const median=(rows,k)=>{const v=values(rows,k);return v.length?d3.median(v):null;};
  const textValue=(v,t)=>valid(v)?fmt(v)+unit(t):'—';

  function discover() {
    const rows=current(),previous=months[months.indexOf(state.month)-1];
    const majorities=['n','r'].map(k=>{
      const vs=values(rows,k),down=vs.filter(v=>v<0).length,up=vs.filter(v=>v>0).length;
      return {k,total:vs.length,down,up,sign:down>vs.length/2?-1:up>vs.length/2?1:0};
    });
    let found=[];
    if(state.unusual==='minority') {
      found=rows.map(d=>{
        const matches=majorities.filter(g=>valid(d[g.k])&&d[g.k]*g.sign<0);
        return {...d,type:matches[0]?.k==='r'?'resale':'new',
          reason:matches.map(g=>`${g.k==='n'?'新房':'二手房'}${metricName()} ${fmt(d[g.k])}%，该类住宅${g.sign<0?'下跌':'上涨'}占多数（${g.sign<0?g.down:g.up}/${g.total} 城）`).join('；'),
          score:d3.max(matches,g=>Math.abs(d[g.k]-median(rows,g.k)))||0};
      }).filter(d=>d.reason).sort((a,b)=>b.score-a.score);
    } else if(state.unusual==='gap') {
      found=rows.filter(d=>valid(d.gap)&&Math.abs(d.gap)>0).sort((a,b)=>Math.abs(b.gap)-Math.abs(a.gap)).slice(0,5)
        .map(d=>({...d,type:'gap',reason:`新房${fmt(d.n)}%、二手房${fmt(d.r)}%，相差 ${Math.abs(d.gap).toFixed(1)} 个百分点（按绝对差值排前五）`}));
    } else if(previous) {
      found=rows.map(d=>{
        const prev=pair(d.city,previous,state.metric);
        const matches=['n','r'].filter(k=>valid(d[k])&&valid(prev[k])&&d[k]*prev[k]<0);
        return {...d,type:matches[0]==='r'?'resale':'new',
          reason:matches.map(k=>`${k==='n'?'新房':'二手房'}${metricName()}从 ${previous} 的 ${fmt(prev[k])}% 变为 ${fmt(d[k])}%`).join('；'),
          score:d3.max(matches,k=>Math.abs(d[k]-prev[k]))||0};
      }).filter(d=>d.reason).sort((a,b)=>b.score-a.score);
    }
    return {found,majorities,previous};
  }

  function renderList() {
    const {found,majorities,previous}=discover();
    $('#unusual-period').textContent=`${state.month} · ${metricName()}`;
    document.querySelectorAll('[data-unusual]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.unusual===state.unusual));
    const context=majorities.map(g=>`${g.k==='n'?'新房':'二手房'}${g.sign?`${g.sign<0?'下跌':'上涨'}占多数（${g.sign<0?g.down:g.up}/${g.total} 城）`:'无过半数同向变化'}`).join('；');
    const rules={minority:`${context}。匹配 ${found.length} 城${found.length>8?'，显示偏离整体中位数较大的前八城':''}。`,
      gap:`比较 ${state.month} 的新房与二手房${metricName()}，按绝对差值取前五城；正差值只表示新房变化高于二手房。`,
      turn:previous?`比较 ${previous} → ${state.month} 的${metricName()}符号，匹配 ${found.length} 城${found.length>8?'，显示变化绝对值较大的前八城':''}。零值不算转向。`:'起始月份没有前月记录，无法判断最近转向。'};
    $('#unusual-rule').textContent=rules[state.unusual];
    const cards=d3.select('#unusual-cards').selectAll('button').data(found.slice(0,8),d=>d.city).join(enter=>{
      const b=enter.append('button').attr('class','unusual-card');b.append('strong');b.append('span').attr('class','unusual-values');b.append('span').attr('class','unusual-reason');b.append('span').attr('class','unusual-cta').text('放大查看 ↗');return b;
    });
    cards.attr('aria-label',d=>`放大查看${d.city}的不同走势`).each(function(d){
      const b=d3.select(this);b.select('strong').text(d.city);b.select('.unusual-values').text(`新 ${textValue(d.n,'new')} / 旧 ${textValue(d.r,'resale')}`);b.select('.unusual-reason').text(d.reason);
    }).on('click',(_,d)=>openCity(d.city,found.map(r=>r.city),d.type));
    d3.select('#unusual-cards').selectAll('.empty').data(found.length?[]:[0]).join('p').attr('class','empty').text('此月没有符合这条规则的城市。可以更换月份、指标或探索规则。');
    $('#inspect-selected').disabled=!state.selected.size;
  }

  function openCity(city,group=cities,type=state.detailType) {
    if(!cities.includes(city))return;
    stop();hideTip();inspectionGroup=group.filter(c=>cities.includes(c));
    state.detailCity=city;state.detailType=type;
    renderDetail();syncURL();
  }
  function axis(svg,x,y,width,height,m,ticks) {
    svg.append('g').attr('class','grid').attr('transform',`translate(${m.left},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(width-m.left-m.right)).tickFormat(''));
    svg.append('g').attr('class','axis').attr('transform',`translate(${m.left},0)`).call(d3.axisLeft(y).ticks(5).tickSize(0).tickPadding(8).tickFormat(v=>`${v}${state.detailType==='gap'?'':'%'}`));
    svg.append('g').attr('class','axis').attr('transform',`translate(0,${height-m.bottom})`).call(d3.axisBottom(x).tickValues(ticks).tickSize(0).tickPadding(12).tickFormat(i=>months[i].replace('-','.')));
    svg.append('line').attr('class','zero-line').attr('x1',m.left).attr('x2',width-m.right).attr('y1',y(0)).attr('y2',y(0));
  }
  function localDomain(vs,minSpan) {
    const extent=d3.extent([0,...vs.filter(valid)]),span=Math.max(minSpan,extent[1]-extent[0]);
    return d3.scaleLinear().domain([extent[0]-span*.1,extent[1]+span*.1]).nice(5).domain();
  }
  function renderDetail() {
    if(!state.detailCity){if(dialog.open)dialog.close();return;}
    if(!dialog.open) {
      dialog.showModal();document.body.classList.add('detail-open');
      dialog.append($('#tooltip'));
    }
    const city=state.detailCity,type=state.detailType,k=key(type),d=pair(city,state.month,state.metric);
    const rest=current().filter(r=>r.city!==city);
    $('#detail-heading').textContent=`${city} · ${state.month} · ${metricName()}`;
    $('#detail-city').value=city;$('#detail-zoom').checked=state.detailZoom;
    const group=inspectionGroup.includes(city)?inspectionGroup:cities;
    const i=group.indexOf(city);
    $('#detail-candidate').textContent=`查看名单 ${i+1} / ${group.length} 城 · 切换月份保留名单`;
    $('#detail-prev-city').disabled=i===0;$('#detail-next-city').disabled=i===group.length-1;
    const match=discover().found.find(r=>r.city===city);
    $('#detail-reason').textContent=match?`为什么值得看：${match.reason}`:'当前月份未命中所选探索规则。可以继续查看这座城市的历史，或切换探索规则。';
    $('#detail-stats').innerHTML=types.map(t=>{
      const val=d[key(t)],med=median(rest,key(t));
      return `<div><span>${name(t)}${t==='gap'?' / 百分点':metricName()}</span><strong>${valid(val)?fmt(val)+(t==='gap'?'':'%'):'—'}</strong><small>其余城市中位数 ${textValue(med,t)}<br>偏离中位数 ${valid(val)&&valid(med)?fmt(val-med)+' 个百分点':'—'}</small></div>`;
    }).join('');
    document.querySelectorAll('[data-detail-type]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.detailType===type));
    const series=months.map((m,i)=>{
      const vs=values(cities.filter(c=>c!==city).map(c=>pair(c,m,state.metric)),k);
      return {month:m,i,value:pair(city,m,state.metric)[k],med:vs.length?d3.median(vs):null,q1:vs.length?d3.quantileSorted(vs,.25):null,q3:vs.length?d3.quantileSorted(vs,.75):null,count:vs.length};
    });
    const color=type==='resale'?'#c77448':'#237d79';
    const domain=state.detailZoom?localDomain(series.flatMap(d=>[d.value,d.med,d.q1,d.q3]),state.metric==='mom'?1:4):type==='gap'?[-limits[state.metric].gapMax,limits[state.metric].gapMax]:limits[state.metric].domain;
    const w=680,h=335,m={left:59,right:22,top:18,bottom:40};
    const x=d3.scaleLinear().domain([0,months.length-1]).range([m.left,w-m.right]);
    const y=d3.scaleLinear().domain(domain).range([h-m.bottom,m.top]);
    const svg=d3.select('#detail-trend').selectAll('svg').data([0]).join('svg').attr('viewBox',`0 0 ${w} ${h}`).attr('role','img').attr('aria-label',`${city}${name(type)}趋势与其余城市中位数和中间50%范围`);
    svg.selectAll('*').remove();
    axis(svg,x,y,w,h,m,[0,6,12,18,24,months.length-1].filter((v,i,a)=>v<months.length&&a.indexOf(v)===i));
    svg.append('path').datum(series).attr('class','detail-band').attr('fill','#d9dfd4').attr('opacity',.7).attr('d',d3.area().defined(d=>valid(d.q1)&&valid(d.q3)).x(d=>x(d.i)).y0(d=>y(d.q1)).y1(d=>y(d.q3)));
    svg.append('path').datum(series).attr('class','detail-median').attr('fill','none').attr('stroke','#85917f').attr('stroke-width',2).attr('stroke-dasharray','5 4').attr('d',d3.line().defined(d=>valid(d.med)).x(d=>x(d.i)).y(d=>y(d.med)));
    svg.append('path').datum(series).attr('class','detail-city-line').attr('fill','none').attr('stroke',color).attr('stroke-width',3).attr('d',d3.line().defined(d=>valid(d.value)).x(d=>x(d.i)).y(d=>y(d.value)));
    const currentIndex=months.indexOf(state.month),baseline=months.indexOf('2026-01');
    if(baseline>=0)svg.append('line').attr('class','baseline-line').attr('x1',x(baseline)).attr('x2',x(baseline)).attr('y1',m.top).attr('y2',h-m.bottom);
    svg.append('line').attr('stroke','#afbcaa').attr('x1',x(currentIndex)).attr('x2',x(currentIndex)).attr('y1',m.top).attr('y2',h-m.bottom);
    if(valid(d[k]))svg.append('circle').attr('cx',x(currentIndex)).attr('cy',y(d[k])).attr('r',5).attr('fill',color).attr('stroke','#fffefa').attr('stroke-width',2);
    const cross=svg.append('line').attr('stroke','#667f64').attr('stroke-dasharray','2 3').attr('y1',m.top).attr('y2',h-m.bottom).style('display','none');
    const nearest=e=>Math.max(0,Math.min(months.length-1,Math.round(x.invert(d3.pointer(e,svg.node())[0]))));
    svg.append('rect').attr('class','detail-trend-hit').attr('x',m.left).attr('y',m.top).attr('width',w-m.left-m.right).attr('height',h-m.top-m.bottom).attr('fill','transparent').attr('cursor','crosshair')
      .on('pointermove',e=>{const s=series[nearest(e)];cross.style('display',null).attr('x1',x(s.i)).attr('x2',x(s.i));showTip(e,`<strong>${city} · ${s.month}</strong>${name(type)}${type==='gap'?'':metricName()} ${textValue(s.value,type)}<br>其余城市中位数 ${textValue(s.med,type)}<br>中间 50%：${textValue(s.q1,type)} 至 ${textValue(s.q3,type)}<br>比较组有效城市 ${s.count} 座`);})
      .on('pointerleave',()=>{cross.style('display','none');hideTip();}).on('click',e=>setMonth(months[nearest(e)]));
    $('#detail-line-label').textContent=`━ ${city} · ${name(type)}${type==='gap'?'（百分点）':metricName()+'（%）'}`;
    $('#detail-line-label').style.color=color;
    renderDetailScatter(city);
    $('#detail-scale-note').textContent=state.detailZoom?'放大已开启：趋势纵轴依据本城全时段及其余城市中间 50% 范围设定，散点坐标依据本城全时段设定；均包含零。更换月份不改变本城坐标范围；不同城市可能使用不同范围。总览图保留原有固定尺度。':'总览尺度：散点图沿用页面的全时段坐标，趋势图采用同指标的全时段范围；差值图使用对称的全时段差值范围。';
    $('#detail-month').max=months.length-1;$('#detail-month').value=currentIndex;
    $('#detail-month-label').textContent=state.month;$('#detail-month-prev').disabled=currentIndex===0;$('#detail-month-next').disabled=currentIndex===months.length-1;
    renderDetailHeat(city);
  }
  function renderDetailScatter(city) {
    const w=390,h=390,m={left:58,right:22,top:18,bottom:54},side=Math.min(w-m.left-m.right,h-m.top-m.bottom);
    const history=months.map(month=>pair(city,month,state.metric));
    const domain=state.detailZoom?localDomain(history.flatMap(d=>[d.n,d.r]),state.metric==='mom'?1:4):limits[state.metric].domain;
    const x=d3.scaleLinear().domain(domain).range([m.left,m.left+side]),y=d3.scaleLinear().domain(domain).range([m.top+side,m.top]);
    const svg=d3.select('#detail-scatter').selectAll('svg').data([0]).join('svg').attr('viewBox',`0 0 ${w} ${h}`).attr('role','img').attr('aria-label',`${city}新房与二手房散点放大`);svg.selectAll('*').remove();
    svg.append('defs').append('clipPath').attr('id','detail-scatter-clip').append('rect').attr('x',m.left).attr('y',m.top).attr('width',side).attr('height',side);
    svg.append('g').attr('class','axis').attr('transform',`translate(0,${m.top+side})`).call(d3.axisBottom(x).ticks(5).tickSize(0).tickPadding(10).tickFormat(v=>v+'%'));
    svg.append('g').attr('class','axis').attr('transform',`translate(${m.left},0)`).call(d3.axisLeft(y).ticks(5).tickSize(0).tickPadding(8).tickFormat(v=>v+'%'));
    svg.append('line').attr('class','equal-line').attr('x1',m.left).attr('y1',m.top+side).attr('x2',m.left+side).attr('y2',m.top);
    const plot=svg.append('g').attr('clip-path','url(#detail-scatter-clip)');
    plot.append('line').attr('class','zero-line').attr('x1',x(0)).attr('x2',x(0)).attr('y1',m.top).attr('y2',m.top+side);
    plot.append('line').attr('class','zero-line').attr('x1',m.left).attr('x2',m.left+side).attr('y1',y(0)).attr('y2',y(0));
    plot.selectAll('.detail-context-dot').data(current().filter(d=>d.city!==city&&valid(d.n)&&valid(d.r))).join('circle').attr('class','detail-context-dot').attr('cx',d=>x(d.n)).attr('cy',d=>y(d.r)).attr('r',3).attr('fill','#bfc9b9').attr('opacity',.7);
    const i=months.indexOf(state.month);
    plot.append('path').datum(history.slice(Math.max(0,i-5),i+1)).attr('fill','none').attr('stroke','#237d79').attr('stroke-width',2).attr('opacity',.6).attr('d',d3.line().defined(d=>valid(d.n)&&valid(d.r)).x(d=>x(d.n)).y(d=>y(d.r)));
    const d=pair(city,state.month,state.metric);
    if(valid(d.n)&&valid(d.r)) {
      plot.append('circle').attr('class','detail-focus-dot').attr('cx',x(d.n)).attr('cy',y(d.r)).attr('r',7).attr('fill','#237d79').attr('stroke','#fffefa').attr('stroke-width',2);
      svg.append('text').attr('x',Math.max(m.left+8,Math.min(m.left+side-40,x(d.n)+10))).attr('y',Math.max(m.top+12,y(d.r)-12)).attr('class','city-label').style('font-size','14px').text(city);
    }
    svg.append('text').attr('class','axis-label').attr('x',m.left+side/2).attr('y',h-8).attr('text-anchor','middle').text(`新房${metricName()} →`);
    svg.append('text').attr('class','axis-label').attr('transform',`translate(14,${m.top+side/2}) rotate(-90)`).attr('text-anchor','middle').text(`二手房${metricName()} →`);
  }
  function renderDetailHeat(city) {
    const table=d3.select('#detail-heat');
    table.selectAll('thead').data([0]).join('thead').selectAll('tr').data([0]).join('tr').selectAll('th').data(['类型',...months]).join('th').text(m=>m==='类型'?m:m.slice(2).replace('-','.'));
    const rows=table.selectAll('tbody').data([0]).join('tbody').selectAll('tr').data(types).join('tr');
    rows.each(function(type){
      const row=d3.select(this),max=type==='gap'?limits[state.metric].gapMax:limits[state.metric].valueMax;
      const color=d3.scaleLinear().domain([-max,0,max]).range(['#467c91','#f0f0e5','#c06c49']).clamp(true);
      row.selectAll('th').data([type]).join('th').attr('scope','row').text(name(type));
      row.selectAll('td').data(months.map(m=>pair(city,m,state.metric))).join('td').style('background',d=>valid(d[key(type)])?color(d[key(type)]):'#d5d9d0').classed('current-month',d=>d.month===state.month)
        .attr('tabindex',0).attr('role','button').attr('aria-label',d=>`${city} ${d.month} ${name(type)} ${textValue(d[key(type)],type)}`).attr('data-month',d=>d.month)
        .on('pointermove',(e,d)=>showTip(e,`<strong>${city} · ${d.month}</strong>${name(type)}${type==='gap'?'':metricName()} ${textValue(d[key(type)],type)}`)).on('pointerleave',hideTip)
        .on('click',(_,d)=>setMonth(d.month)).on('keydown',(e,d)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setMonth(d.month);}});
    });
  }

  document.querySelectorAll('[data-unusual]').forEach(b=>b.onclick=()=>{stop();state.unusual=b.dataset.unusual;renderList();syncURL();});
  $('#detail-close').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>{
    if(dialog.open)return;
    state.detailCity=null;document.body.classList.remove('detail-open');hideTip();document.body.append($('#tooltip'));syncURL();
  });
  d3.select('#detail-city').selectAll('option').data(cities).join('option').attr('value',c=>c).text(c=>c);
  $('#detail-city').onchange=e=>{state.detailCity=e.target.value;renderDetail();syncURL();};
  function stepCity(step) {const group=inspectionGroup.includes(state.detailCity)?inspectionGroup:cities;const city=group[group.indexOf(state.detailCity)+step];if(city){state.detailCity=city;renderDetail();syncURL();}}
  $('#detail-prev-city').onclick=()=>stepCity(-1);$('#detail-next-city').onclick=()=>stepCity(1);
  $('#detail-zoom').onchange=e=>{state.detailZoom=e.target.checked;renderDetail();syncURL();};
  document.querySelectorAll('[data-detail-type]').forEach(b=>b.onclick=()=>{state.detailType=b.dataset.detailType;renderDetail();syncURL();});
  $('#detail-month').oninput=e=>setMonth(months[+e.target.value]);
  $('#detail-month-prev').onclick=()=>setMonth(months[months.indexOf(state.month)-1]);$('#detail-month-next').onclick=()=>setMonth(months[months.indexOf(state.month)+1]);
  $('#inspect-selected').onclick=()=>{const group=[...state.selected];if(group.length)openCity(group[0],group);};
  const explorer={render(){renderList();renderDetail();},openCity,discover,
    reset(){state.unusual='minority';state.detailCity=null;state.detailType='new';state.detailZoom=true;if(dialog.open)dialog.close();}};
  window.housingApp.explorer=explorer;
  return explorer;
};
