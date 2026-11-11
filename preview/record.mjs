import {chromium} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
const b=await chromium.launch({channel:'msedge',headless:true});
const p=await b.newPage({viewport:{width:1200,height:800},deviceScaleFactor:1});
await mkdir('test-results/stage-frames',{recursive:true});
await p.goto('http://127.0.0.1:8766/preview/?still=1');await p.waitForFunction(()=>window.housingStage);
for(let i=0;i<85;i++){
  if(i===18)await p.locator('[data-view=scatter]').click();
  if(i===37)await p.locator('[data-view=trails]').click();
  if(i===57)await p.evaluate(()=>housingStage.play(true));
  await p.screenshot({path:`test-results/stage-frames/${String(i).padStart(3,'0')}.png`});
  await p.waitForTimeout(90);
}
await b.close();console.log('85 animation frames captured');
