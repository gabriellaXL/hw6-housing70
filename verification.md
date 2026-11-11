# 验证记录

## 数据

- 2026-11-11 获取国家统计局最新发布目录，最新正式发布月份为 2026-09。
- 33 个连续月份，每月 70 城、两类住宅，共 4,620 条记录。
- 唯一键无重复，每月城市集合一致，数值缺失 0。
- 原始 HTML 快照 33 份，逐页 SHA-256 与官方链接保存在 `data/sources.json`。
- 抽查 2024-01、2025-01、2026-01、2026-09 北京两类住宅的环比与同比；2026-01 原文包含基期、权数调整说明。
- 8 项 Python 数据测试通过：完整面板、跨年表格、缺失语义、重复项、漏城、异常值、基期说明及全部原始快照哈希。

## 正式前端与设计核验

- 正式首页采用作者指定的 `preview/index.html`、`preview/stage.css`、`preview/stage.js` 动态设计，原始文件保留。
- 保持单屏布局、红蓝住宅类型、连线与散点及轨迹之间的形态过渡、月份播放、数字补间、悬停突出及按需时间线。
- 新增的“发现”窗口采用相同米灰背景、衬线标题、红蓝配色及细线结构；条形过渡和城市组聚焦接入主图。
- 单城时间线可切换本城放大与全体城市范围；两种指标的说明及基期提示完整。
- 桌面 1440px 与移动端 390px 截图已检查，修正了移动端聚焦文字及条形数字裁切。
- 117 项真实浏览器检查本地全部通过：正式展览 19 项、深入发现 29 项、完整探索页 44 项、原有单城放大 25 项。
- 核验包含形态切换中间位置、数据绑定、真实月份轨迹、播放暂停、城市搜索、时间线、减少动态效果、无横向溢出、组聚焦、同比与环比联合分类、连续上涨条件、绝对差值路径分解、历史事件观察窗口和 URL 恢复。
- 完整探索页 `classic.html` 继续提供框选、热力图、五城对比、缺失处理与中位数分位带放大；两套入口均捕获未处理脚本错误。

## 深入分析

- `scripts/analyze_dynamics.py` 使用官方一位小数对应的整数判断变化方向与差值，避免浮点误分类。
- 核对最新月改善组、连续上涨城市、完整后续事件和绝对差值分解；全部排序相关与独立 SciPy 实现一致。
- 结果 JSON 保存输入数据 SHA-256；方法与边界见 `analysis/深入分析.md`。

## 部署

- 平台：GitHub Pages，HTTPS 已启用。
- 正式网页：https://gabriellaxl.github.io/hw6-housing70/
- 完整探索：https://gabriellaxl.github.io/hw6-housing70/classic.html
- 分析说明：https://gabriellaxl.github.io/hw6-housing70/analysis/
- 报告：https://gabriellaxl.github.io/hw6-housing70/report.html
- 源码：https://github.com/gabriellaXL/hw6-housing70
- 首次部署记录：[Actions](https://github.com/gabriellaXL/hw6-housing70/actions/runs/42973838915)。旧版此前 69 项线上检查通过；本次新版部署后另行执行正式入口及发现检查。
- 原始快照禁用 Git 换行转换，仓库字节与来源清单 SHA-256 一致。

## 复现

```powershell
python -m unittest discover -s tests -p 'test_*.py'
npm ci
npm run check
python -m http.server 8766 --bind 127.0.0.1
# 另一终端运行
npm test
```
