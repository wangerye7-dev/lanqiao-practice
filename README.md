# 蓝桥起步练习室

面向零基础学生的 Python 大学 C 组备赛练习站，包含 10 个引导短课和 50 道原创训练题。本站不是蓝桥杯官方平台，原创训练题不冒充历年真题。

## 使用

固定入口：https://wangerye7-dev.github.io/lanqiao-practice/

Python 常用词互动页：https://wangerye7-dev.github.io/lanqiao-practice/words/

学生打开网站，等待“Python 已就绪”，即可编写、运行代码和检查答案。无需 ChatGPT 账号或本地 Python 安装。

Python 和判题在学生浏览器内运行。进度保存在当前浏览器，不会自动跨设备同步；可以通过“备份进度”和“导入”转移记录。清理浏览器数据可能移除进度。

## 部署

网站是纯静态文件，支持 GitHub Pages 的仓库子路径。Pages 使用 `main` 分支的根目录，`.nojekyll` 保留运行时文件的原样发布。无需购买域名、服务器或开通付费套餐。

所有运行文件随站点托管；首次访问下载约 5.2 MB 的压缩 Python 核心和标准库，另有页面、题目和运行器资源。浏览器缓存核心文件，后续使用可减少下载。

## 第三方运行时

使用 Pyodide 0.29.4。许可证及来源校验记录见 `runtime/PYODIDE-LICENSE.txt` 和 `runtime/provenance.json`。

网站上线状态以实际部署结果为准。平台免费政策和网络可达性会变化，不承诺永久服务。

## Python 常用词互动学习

`words/` 包含 59 个常用词条、16 组符号；其中 10 个词作为零基础优先学习范围。每条包含中文解释、用途分类、可编辑代码、预期结果和易错提醒。

- 查词：按分类或中英文检索，标记“已记住”与“待复习”。输入搜索词时自动搜索全部分类。
- 运行：首次点击运行才加载现有的 `runner.js` 和同源 Pyodide 资源。错误词条例子故意触发相应异常，便于观察并修正。超过 10 秒的执行会终止，可重新运行。
- 翻卡：先回忆再翻开，自评后进入下一张；跳过不会改变学习记录。
- 自测：从当前范围抽取最多 8 个不同词，混合词义辨认与代码题（另有 20 道代码理解题）。答案顺序随机，每题只记第一次选择。答错进入待复习，相关题答对后移出；答对不自动等同于“已记住”。
- 记录：使用独立的 `lanqiao-python-words-v1` 本地记录，不修改原练题进度。支持导出和合并导入；合并时待复习优先。不会自动跨设备同步。

全页使用原生 HTML、CSS、JavaScript，不依赖外部字体或 CDN。查词、翻卡与自测不需要下载 Python。例子草稿在本次页面使用期间保留，刷新后恢复原例子；学习标记持久保存到当前浏览器。

词语说明使用原创入门表述。参考 Python 官方 [内置函数](https://docs.python.org/zh-cn/3/library/functions.html)、[控制流](https://docs.python.org/zh-cn/3/tutorial/controlflow.html) 和 [数据结构](https://docs.python.org/zh-cn/3/tutorial/datastructures.html) 文档。不是官方词汇表或正式比赛题。
