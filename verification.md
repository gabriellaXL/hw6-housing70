# 验证记录

## 数据

- 2026-11-11 获取国家统计局最新发布目录，最新正式发布月份为 2026-09。
- 33 个连续月份，每月 70 城、两类住宅，共 4,620 条记录。
- 唯一键无重复，每月城市集合一致，数值缺失 0。
- 原始 HTML 快照 33 份，逐页 SHA-256 与官方链接保存在 `data/sources.json`。
- 抽查 2024-01、2025-01、2026-01、2026-09 北京两类住宅的环比与同比；2026-01 原文包含基期、权数调整说明。
- 8 项 Python 数据测试通过：完整面板、跨年表格、缺失语义、重复项、漏城、异常值、基期说明及全部原始快照哈希。

## 前端

- JavaScript 语法检查通过。
- 独立无界面 Microsoft Edge 的 43 项真实浏览器检查全部通过，结果保存在本地 `test-results/browser.json`。
- 验证真实拖动刷选、统计联动、热力图聚焦、跨月保留、指标切换、城市搜索、五城上限、移除、热力图定位、探索入口、URL 恢复、固定坐标范围、播放暂停及全部重置。
- 检查桌面 1440px 与移动端 390px 布局、页面无横向溢出、热力图内部滚动与城市标签固定。
- 模拟缺失值，验证散点排除无完整坐标记录、热力图灰显、趋势断线；模拟数据不写入生产文件。
- 页面脚本、样式、D3、本地 JSON 和报告资源均核验 HTTP 状态。
- 桌面、移动端截图已人工查看；改进了相近城市的标签避让及移动端趋势图字号。

## 部署

新增交互验证：原有浏览器检查更新为 44 项，新增 25 项不同走势与单城放大检查，本地共 69 项通过。覆盖入选规则、候选切换、与其余 69 城比较、三图放大、月份联动、URL 恢复、Esc 关闭、移动端及逐城查看框选名单。桌面与移动端放大窗口截图已检查。

- 平台：GitHub Pages，HTTPS 已启用。
- 网页：https://gabriellaxl.github.io/hw6-housing70/
- 报告：https://gabriellaxl.github.io/hw6-housing70/report.html
- 源码：https://github.com/gabriellaXL/hw6-housing70
- 首次部署工作流成功：[Actions 记录](https://github.com/gabriellaXL/hw6-housing70/actions/runs/42973838915)。
- 2026-11-11 对已部署 HTTPS 网页重新运行全部 43 项浏览器检查，全部通过，浏览器未捕获未处理异常；本地及线上主要交互结果一致。
- 发布前再次复核官方最新三页目录，最新正式数据仍为 2026-09，记录见 `data/latest-release-check.json`。
- 原始快照禁用 Git 换行转换，保证仓库中的字节与来源清单 SHA-256 一致。

## 复现

```powershell
python -m unittest discover -s tests -p 'test_*.py'
npm ci
npm run check
python -m http.server 8766 --bind 127.0.0.1
# 另一终端运行
npm test
```
