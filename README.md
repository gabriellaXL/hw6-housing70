# 同一座城，两种楼市

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

## 交互

- 新增“哪些城市走得不一样”：按逆着多数方向、新旧房分化最大、最近转向三条规则发现例外，每张卡片写明入选数值。
- 点击候选卡片或趋势图的“放大”打开独立窗口：本城大折线与其余城市中位数、中间 50% 范围对比，并提供放大散点和本城热力图。窗口中可逐城查看、切月份、切住宅类型及恢复总览尺度。
- 放大查看保留原对比名单及框选；框选后也可用“逐城放大查看框选城市”入口。URL 恢复放大城市、图层及尺度，Esc 或关闭按钮返回总览。

- 散点图空白处拖动框选；点击点位添加对比，悬停读数。
- 框选集合随月份保留；切换同比／环比清除。统计面板按城市等权计算中位数。
- 搜索并添加最多五城；默认北上广深。对比城市显示近六个月散点轨迹。
- 播放每 1.1 秒前进，播放时禁止新框选；末月自动停止。
- 趋势图共享纵轴，悬停读数，点击定位月份。
- 热力图切换类型、排序或只看框选，点击单元格定位月份及城市；城市标签固定。
- URL 自动保存视图，复制当前链接可复现；全部重置恢复最新月、同比和默认四城。

“当前涨跌幅”排序按热力图当前图层数值执行：新房、二手房或差值。“差值”排序始终按新房减二手房降序，探索入口“差距最大”则按绝对差值选择前五。

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
| `index.html`、`styles.css`、`app.js`、`explore.js` | 中文页面、D3 联动、不同走势发现及单城放大 |
| `vendor/` | D3 7.9.0 与第三方许可 |
| `data/` | 处理后的数据、元数据、来源及核验结果 |
| `raw/` | 33 个月原始 HTML 快照 |
| `scripts/fetch_data.py` | 下载、解析、核验及追加月份 |
| `tests/` | 数据边界与真实浏览器测试 |
| `report.md` | 研究问题、设计、发现、分工与资源引用 |
| `verification.md` | 最终检查和部署记录 |

报告中的实际分工与人时按要求留空。网页未调用 LLM 或其他付费 API。
