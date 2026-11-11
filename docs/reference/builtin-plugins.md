# 内置插件一览

全部内置插件位于 `src/plugins/`，任何都可以在插件中心禁用，或被用户目录里的同 id 插件覆盖升级。

| 插件 | 功能 | 默认热键 |
|---|---|---|
| **截图悬浮** `screenshot-pin` | 框选截图钉在屏幕置顶悬浮：滚轮缩放、透明度、复制、保存、OCR 文字提取；多显示器支持 | `Ctrl+Shift+A` |
| **屏幕画板** `draw-board` | 全屏透明画板：画笔 / 荧光笔 / 直线 / 箭头 / 矩形 / 椭圆 / 橡皮，撤销重做，导出 PNG，贴图置顶 | `Ctrl+Shift+D` |
| **录屏聚焦** `screen-cue` | 默认实时标注，可选冻结当前画面；画笔 / 荧光笔 / 矩形 / 圆形 / 箭头，笔迹保留 / 淡出 / 退出清除；圆形 / 矩形 / 大范围放大镜，中心十字和倍率标签可分别开关，退出后点击穿透 | `Ctrl+Shift+S`（标注）`Ctrl+Shift+X`（清除）`Ctrl+Shift+F`（放大镜） |
| **AI 对话** `ai-chat` | 本地 Agent 助手：多轮工具循环、插话 Steering、工具卡审批、计划模式、MCP 市场与技能库、子代理、长期记忆 | `Ctrl+Shift+I` |
| **剪贴板历史** `clip-history` | 多条历史与置顶收藏、搜索、图片预览、一键回填、敏感内容过滤 | `Ctrl+Shift+V` |
| **JSON 编辑器** `json-editor` | 语法校验 / 格式化 / 树状折叠 / Python 字典转 JSON / 压缩 / 转义 / 去注释（纯前端插件） | `Ctrl+Shift+J` |
| **编码转换** `codec-lab` | Base64 / URL / Hex / Unicode / JWT / 时间戳互转，哈希与对称加密（crypto 后端） | `Ctrl+Shift+C` |
| **色彩工坊** `color-lab` | RGBA 调色板 + 屏幕吸管（像素放大镜、冻结 / 动态双模式），HEX / RGB / HSL / HSV / ARGB 互转 | `Ctrl+Shift+E` |
| **备忘录** `memo` | Markdown 分屏实时预览、笔记 / 待办 / 日历三视图、到期系统提醒 | `Ctrl+Shift+N` |
| **端口与进程** `port-scope` | TCP / UDP 监听端口 + 进程名 + PID，过滤排序，一键结束进程 | `Ctrl+Shift+P` |
| **镜像源切换** `mirror-hub` | npm / pip / docker / maven / rust 国内镜像源并发测速与一键切换（自动备份原配置） | `Ctrl+Shift+M` |
| **计算器** `calculator` | 科学算式安全求值（AST 解析非 eval）、实时预览、历史、剪贴板算式智能求值 | `Ctrl+Shift+L` |
| **反重力启动器** `antigravity-launcher` | Google Antigravity 进程级代理启动：握手探测、网络诊断、终端代理、一键拉起 | `Ctrl+Shift+G`（启动动作） |

录屏聚焦的「标注时冻结屏幕」默认关闭，开启后在下一次进入标注时抓取静态底图，退出标注立即撤去底图。放大镜的「显示中心十字」「显示倍率标签」可分别开关，当前放大镜会立即更新。

放大镜当前仅支持 Windows；「整屏」形态使用避开取景区域的大范围放大带，避免自身被重复采集导致黑屏。

## 宿主级热键

| 热键 | 作用 |
|---|---|
| `Alt+Shift+Space` | 呼出主窗口（可在设置改绑；被外部占用时启动自动降级备用键） |
| `Ctrl+K` | 动作抽屉（窗口内命令面板，可清空） |

悬浮命令面板另支持拼音首字母模糊搜索，动作推荐顺序：划选文本 > 剪贴板内容 > 其他。

## 生态插件

部分工具以独立开源仓库分发，安装方式同样是复制 / clone 到用户插件目录：

- [orbit-plugin-pet](https://github.com/Ikaros-521/orbit-plugin-pet) — 桌面宠物：聊天审批卡片、工作流通知、AI 碎碎念
- [orbit-plugin-dsh-pet](https://github.com/Ikaros-521/orbit-plugin-dsh-pet) — DSH 伴随类桌宠桥接

::: tip
所有内置插件默认快捷键均已互斥分配；若被系统其他软件占用或发生热键冲突，在设置页改绑或清空即可。
:::
