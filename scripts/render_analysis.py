"""Publish the deeper analysis as a readable static companion to the exhibition."""
from pathlib import Path
import markdown
root=Path(__file__).resolve().parents[1]
source=root/'analysis/深入分析.md'
text=source.read_text(encoding='utf-8').replace('本次没有改动或重新部署现有交互网页。此分析可作为下一步选择交互主线和修改报告的依据。','主要分类已接入正式网页的“发现”窗口，可点击城市回到图中追踪；此页保留完整方法、结果与边界。')
body=markdown.markdown(text,extensions=['tables','fenced_code'])
html='''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>同城不同步 深入分析</title><style>
*{box-sizing:border-box}body{margin:0;background:#eeece5;color:#242723;font:14px/2 "Segoe UI","Microsoft YaHei",sans-serif}main{max-width:1050px;margin:40px auto;padding:30px 42px}nav{display:flex;justify-content:space-between;font-size:12px;border-bottom:1px solid #cecec2;padding-bottom:20px}a{color:#bf4b30;text-underline-offset:4px;overflow-wrap:anywhere}h1,h2{font-family:"SimSun",serif;font-weight:500;line-height:1.5}h1{font-size:38px;margin-top:40px}h2{font-size:25px;margin-top:40px}p,li{color:#63695b}img{width:100%;height:auto}table{width:100%;border-collapse:collapse;font-size:12px}th,td{padding:12px;text-align:left;border-bottom:1px solid #cecec2}th{color:#bf4b30;font-weight:500}pre{padding:15px;border:1px solid #cecec2;overflow:auto}code{font-family:Consolas,monospace;font-size:12px}@media(max-width:600px){main{padding:20px 18px;margin:0}h1{font-size:29px}h2{font-size:23px}table{font-size:10px}td,th{padding:8px 4px}}@media print{nav{display:none}main{margin:0;padding:0}h2{break-after:avoid}}
</style><main><nav><a href="../?still=1">← 返回交互作品</a><a href="深入分析.md" download>下载分析记录 ↓</a></nav>'''+body+'</main></html>'
(root/'analysis/index.html').write_text(html,encoding='utf-8')
print('Rendered analysis/index.html')
