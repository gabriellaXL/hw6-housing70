import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

// A separate headless browser tests this project; no existing user browser is attached.
const browser = await chromium.launch({channel:'msedge',headless:true});
const page = await browser.newPage({viewport:{width:1440,height:1100}});
const errors = [], checks = [];
page.on('pageerror',e=>errors.push(e.message));
const base = process.env.TEST_URL || 'http://127.0.0.1:8766/';
await mkdir('test-results',{recursive:true});
const check = (name,condition) => {assert.ok(condition,name);checks.push(name);};
try {
  await page.goto(base);
  await page.waitForFunction(()=>window.housingApp);
  check('70 scatter marks',await page.locator('.city-dot').count()===70);
  check('70 heat rows',await page.locator('#heatmap tbody tr').count()===70);
  check('2310 heat cells',await page.locator('#heatmap td').count()===2310);
  check('default four comparison cities',await page.locator('.trend-card').count()===4);
  check('latest month and yoy',await page.evaluate(()=>housingApp.state.month==='2026-09'&&housingApp.state.metric==='yoy'));
  check('index conversion and gap',await page.evaluate(()=>{
    const d=housingApp.pair('北京','2024-01','yoy');return d.n===1.3&&d.r===-3.7&&d.gap===5;
  }));
  await page.screenshot({path:'test-results/desktop.png',fullPage:true});
  // Drag a real D3 brush across most of the plotting area.
  await page.locator('#scatter svg').scrollIntoViewIfNeeded();
  const box=await page.locator('#scatter svg').boundingBox();
  const sx=box.width/600,sy=box.height/540;
  await page.mouse.move(box.x+240*sx,box.y+210*sy);
  await page.mouse.down();await page.mouse.move(box.x+340*sx,box.y+350*sy,{steps:15});await page.mouse.up();
  const selected=await page.evaluate(()=>[...housingApp.state.selected]);
  check('brush selects a nonempty strict subset',selected.length>0&&selected.length<70);
  check('brush selection updates dots',await page.locator('.city-dot.brushed').count()===selected.length);
  await page.locator('#focus').check();
  check('heat focus follows brush',await page.locator('#heatmap tbody tr').count()===selected.length);
  await page.locator('#prev').click();
  check('month change preserves selected cities',await page.evaluate(expected=>JSON.stringify([...housingApp.state.selected])===JSON.stringify(expected),selected));
  check('month change preserves comparison',await page.locator('.trend-card').count()===4);
  await page.locator('[data-metric=mom]').click();
  check('metric switch clears brush',await page.evaluate(()=>housingApp.state.selected.size===0));
  check('empty focus is explained',await page.locator('#heat-empty').isVisible());
  await page.locator('#focus').uncheck();
  check('all heat rows restored',await page.locator('#heatmap tbody tr').count()===70);
  await page.locator('#city-search').fill('杭州');
  await page.locator('#city-results button').click();
  check('search adds fifth city',await page.locator('.trend-card').count()===5);
  await page.locator('#city-search').fill('成都');await page.locator('#city-results button').click();
  check('sixth city rejected',await page.locator('.trend-card').count()===5);
  check('limit notice visible',(await page.locator('#status').textContent()).includes('最多'));
  await page.getByRole('button',{name:'移除广州',exact:true}).click();
  check('remove comparison city',await page.locator('.trend-card').count()===4);
  await page.locator('#city-search').fill('不存在');
  check('unmatched search explained',(await page.locator('#city-results').textContent()).includes('没有匹配'));
  await page.locator('#reset').click();
  await page.locator('#heatmap td[data-city="杭州"][data-month="2024-01"]').click();
  check('heat cell locates month and adds city',await page.evaluate(()=>housingApp.state.month==='2024-01'&&housingApp.state.compare.includes('杭州')));
  await page.locator('#question-opposite').click();
  check('direction exploration uses real values',await page.evaluate(()=>housingApp.state.selected.size===17&&[...housingApp.state.selected].every(c=>{const d=housingApp.pair(c,'2024-01','yoy');return d.n*d.r<0;})));
  await page.locator('#question-gap').click();
  check('gap exploration selects largest five',await page.evaluate(()=>housingApp.state.compare.length===5&&housingApp.state.compare[0]==='上海'&&housingApp.state.selected.size===5));
  const shared=page.url();await page.reload();await page.waitForFunction(()=>window.housingApp);
  check('URL restores month metric comparison selection',await page.evaluate(()=>housingApp.state.month==='2024-01'&&housingApp.state.metric==='yoy'&&housingApp.state.compare[0]==='上海'&&housingApp.state.selected.size===5));
  const domainBefore=await page.evaluate(()=>housingApp.limits.yoy.domain);
  await page.locator('#next').click();
  check('coordinate domain fixed across months',await page.evaluate(before=>JSON.stringify(housingApp.limits.yoy.domain)===JSON.stringify(before),domainBefore));
  await page.locator('#play').click();await page.waitForTimeout(1300);
  check('play advances month',await page.evaluate(()=>housingApp.state.month==='2024-03'));
  check('brush disabled during playback',await page.locator('#scatter .brush').evaluate(el=>getComputedStyle(el).pointerEvents==='none'));
  await page.locator('#play').click();
  check('pause stops playback',await page.evaluate(()=>!housingApp.state.playing));
  await page.locator('#reset').click();
  check('reset restores all defaults',await page.evaluate(()=>housingApp.state.month==='2026-09'&&housingApp.state.metric==='yoy'&&housingApp.state.compare.join(',')==='北京,上海,广州,深圳'&&!housingApp.state.selected.size&&!housingApp.state.focus));
  // All referenced sources and static assets must return successfully.
  for(const asset of ['styles.css','app.js','vendor/d3.v7.min.js','data/housing.json','data/metadata.json','data/sources.json','report.md','report.html']) {
    const r=await page.request.get(new URL(asset,base).href);check(`asset ${asset}`,r.ok());
  }
  await page.setViewportSize({width:390,height:844});
  check('mobile has no page horizontal overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  check('mobile heatmap scrolls horizontally',await page.locator('#heat-scroll').evaluate(el=>el.scrollWidth>el.clientWidth));
  await page.locator('#heat-scroll').evaluate(el=>{el.scrollLeft=650;});
  const sticky=await page.locator('#heatmap tbody .city-head').first().boundingBox();
  const heat=await page.locator('#heat-scroll').boundingBox();
  check('city labels remain sticky during horizontal scrolling',Math.abs(sticky.x-heat.x)<8);
  await page.screenshot({path:'test-results/mobile.png',fullPage:true});
  // A separate synthetic fixture checks missing-value rendering; production data stay unchanged.
  const missing=await browser.newPage();
  await missing.route('**/data/housing.json',async route=>{
    const response=await route.fetch(), rows=await response.json();
    for(const r of rows)if(r.city==='北京'&&r.type==='new'&&['2025-01','2026-09'].includes(r.month))r.yoy_index=null;
    await route.fulfill({response,json:rows});
  });
  await missing.goto(base);await missing.waitForFunction(()=>window.housingApp);
  check('missing coordinate omitted rather than zero',await missing.locator('.city-dot').count()===69);
  await missing.locator('[data-heat=new]').click();
  check('missing heat cell gray',await missing.locator('#heatmap td[data-city="北京"][data-month="2026-09"]').evaluate(el=>getComputedStyle(el).backgroundColor==='rgb(213, 217, 208)'));
  check('trend breaks at missing month',await missing.locator('.trend-card').first().locator('.trend-line').first().evaluate(el=>(el.getAttribute('d').match(/M/g)||[]).length===2));
  await missing.close();
  check('no uncaught browser errors',errors.length===0);
  await writeFile('test-results/browser.json',JSON.stringify({base,passed:checks.length,checks,errors,shared},null,2));
  console.log(`PASS ${checks.length} browser checks`);
} finally {await browser.close();}
