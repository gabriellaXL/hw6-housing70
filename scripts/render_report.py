"""Render the submission report as a standalone readable static HTML page."""
from pathlib import Path
import markdown

root = Path(__file__).resolve().parents[1]
body = markdown.markdown((root / 'report.md').read_text(encoding='utf-8'), extensions=['tables','fenced_code'])
html = '''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>同一座城 两种楼市 设计报告</title><style>
*{box-sizing:border-box}body{margin:0;background:#f5f4ee;color:#263d35;font:15px/2 "Segoe UI","Microsoft YaHei",sans-serif}main{max-width:850px;margin:45px auto;padding:40px 55px;background:#fffefa;border:1px solid #dedfd4;border-radius:8px}h1{font:600 36px/1.5 Georgia,"SimSun",serif;margin:22px 0 5px}h2{font-size:23px;margin:38px 0 15px}h3{font-size:17px;margin:26px 0 10px}p{margin:14px 0}a{color:#237d79;text-underline-offset:3px;overflow-wrap:anywhere}code{font-size:13px;background:#edf1e9;padding:2px 4px;border-radius:3px}pre{overflow:auto;padding:15px;background:#edf1e9}pre code{padding:0}li{margin:12px 0}table{border-collapse:collapse;width:100%}td,th{border:1px solid #dedfd4;padding:8px;text-align:left}nav{display:flex;justify-content:space-between;gap:15px;font-size:12px}footer{border-top:1px solid #dedfd4;margin-top:35px;padding-top:15px;font-size:12px;color:#75817b}@media(max-width:600px){main{margin:0;padding:25px 20px;border:0;border-radius:0}h1{font-size:29px}}@media print{body{background:white}main{border:0;margin:0;padding:0;max-width:none}nav,footer{display:none}h2,h3{break-after:avoid}a{color:inherit}p,li{orphans:3;widows:3}}
</style><main><nav><a href="./">← 返回交互作品</a><a href="report.md" download>下载 Markdown 报告</a></nav>'''+body+'''<footer>数据范围 2024 年 1 月至 2026 年 9 月 · 国家统计局 70 城官方发布</footer></main></html>'''
(root / 'report.html').write_text(html, encoding='utf-8')
print('Rendered report.html')
