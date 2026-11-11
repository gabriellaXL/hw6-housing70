# 同城不同步

基于国家统计局 2024-01 至 2026-09 数据的 D3 交互可视化作业。33 个月、70 城、两类住宅，4,620 条官方记录。

- 网页：https://gabriellaxl.github.io/hw6-housing70/
- 报告：[report.md](report.md)
- 核验：[verification.md](verification.md)

## 本地运行

不需要前端构建或后端。使用 HTTP 打开，不能双击 `index.html` 后从 `file://` 加载 JSON。

```powershell
cd housing70
python -m http.server 8766 --bind 127.0.0.1
```

访问 http://127.0.0.1:8766/ 。所有网页依赖包括 D3 均保存在项目内，不依赖第三方 CDN。

## 数据复现及追加

```powershell
python -m pip install -r requirements.txt
python scripts/fetch_data.py
# 扫描官方目录，追加新发布月份；已下载月份复用快照
python scripts/fetch_data.py --discover
# 发布前仅复核最新三页目录，若发现新月份会报错要求更新
python scripts/fetch_data.py --check-latest
# 修改 Markdown 报告后重新生成网页版
python scripts/render_report.py
```

脚本保留官方总指数，排除面积分类和年内平均；空值为 null，不插值。输入为 `data/source_urls.json` 和 `raw/*.html`，输出为 `housing.json`、`metadata.json`、`sources.json` 和 `validation.json`。新增月份自动改变滑块、统计范围和图表尺度。若官方改版导致每月记录不足 140 条，脚本停止并报错。

## 正式入口与交互

正式首页沿用作者指定的 preview 动态设计：价格连线、城市坐标、近十二个月轨迹三种视角平滑变换，红色编码新房、蓝色编码二手房，底部时间播放台跨月更新真实数据。原始 preview 文件保持不变。

- 搜索或点击城市，在左侧读取两类价格变化；点击“展开这座城的时间线”单独放大。可在本城纵轴与全体城市尺度之间切换。
- “寻找分化”突出绝对差值最大的五城；“发现”提供同比改善与月度下跌、连续上涨、收敛路径和历史转正四个问题。
- 发现窗口的条形可切换名单，城市及组可回到主图追踪；历史事件定位实际发生月份。
- 分享 URL 保存月份、指标、视角、城市、聚焦组和发现条件；关于窗口可复制链接、恢复默认。
- 空格播放暂停，左右方向键切月；减少动态效果时关闭自动播放和过渡。
- 带 `m` 参数的链接按指定月份打开；无月份参数保留原设计的自动回放。可加 `still=1` 静止查看。
- [完整数据探索页](classic.html)保留框选、热力图、五城对比、单城中位数与分位带对照，入口位于“发现”及“关于”。

## 深入分析复现

```powershell
python scripts/analyze_dynamics.py
# 图形可选 需要 matplotlib
python scripts/analyze_dynamics.py --figures
python scripts/render_analysis.py
```

[完整分析](analysis/index.html)包含定义、计数、历史事件样本、收敛分解、排名稳定性及数据口径边界。`analysis/dynamics.json` 保存名单、全部事件及输入 SHA-256；分析统计仅使用 Python 标准库。

## 验证

```powershell
python -m unittest discover -s tests -p 'test_*.py'
npm ci
npm run check
# 测试默认使用已安装的 Microsoft Edge，需要先启动上述 HTTP 服务
npm test
# 也可测试已部署网页
$env:TEST_URL='https://gabriellaxl.github.io/hw6-housing70/'
npm test
```

浏览器截图及 JSON 结果保存在被 Git 忽略的 `test-results/`。网页部署只需要 HTML、CSS、JS、vendor、data、报告与说明文件，无需安装 Node 包。`.github/workflows/pages.yml` 把这些静态资源打包发布到 GitHub Pages，不发布测试截图或依赖目录；原始页面快照与处理脚本保留在源码仓库。

## 文件

| 路径 | 内容 |
| --- | --- |
| `index.html`、`stage.css`、`stage.js` | 作者指定设计的正式入口与图形动画 |
| `stage-insights.css`、`stage-insights.js` | 延续正式视觉的深入发现窗口及主图聚焦 |
| `classic.html`、`styles.css`、`app.js`、`explore.js` | 完整探索页、热力图、框选与五城对比 |
| `analysis/`、`scripts/analyze_dynamics.py` | 深入分析、结果与复现脚本 |
| `vendor/` | D3 7.9.0 与第三方许可 |
| `data/` | 处理后的数据、元数据、来源及核验结果 |
| `raw/` | 33 个月原始 HTML 快照 |
| `scripts/fetch_data.py` | 下载、解析、核验及追加月份 |
| `tests/` | 数据边界与真实浏览器测试 |
| `report.md` | 研究问题、设计、发现、分工与资源引用 |
| `verification.md` | 最终检查和部署记录 |

报告中的实际分工与人时按要求留空。网页未调用 LLM 或其他付费 API。
