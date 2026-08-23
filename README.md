# dsh-maplay 部署包

把 maplay 2D 地图动画能力，以「插件 + preset」的方式装进 DeepSeek Harness（dsh）。

- 29 个 maplay 工具（`get_board_info`、`moveTo`、`shoot`、`flyTo`……）只在 `maplay` preset 下出现
- 前端保留 DSH 完整界面（侧边栏 / 对话历史 / 设置），会话头多一个「地图」tab，点开是实时地图
- 地图是进程内单例，动画通过 SSE 实时广播

## 目录结构

```
dsh-maplay-deploy/
├── README.md        本说明
├── dsh-maplay/      dsh 插件（host + preset + browser 三半）
├── maplay/          地图运行时（@vcvcvn/maplay，dsh-maplay 依赖它）
└── preset/          maplay agent preset
```

> 注意：`dsh-maplay/package.json` 里 `@vcvcvn/maplay` 是 `file:../maplay`，
> 所以 `dsh-maplay` 和 `maplay` 必须保持**同级目录**（`dsh-maplay/../maplay`）。

## 部署步骤

前置：Node.js 22+、npm。

```bash
# 1. 装 DSH（全局）
npm i -g @deepseek-ai/dsh

# 2. 两个项目各装依赖并构建（先 maplay，dsh-maplay 依赖它的 file 路径）
cd maplay        && npm install && npm run build
cd ../dsh-maplay && npm install && npm run build

# 3. 把 dsh-maplay 链接成 dsh 能识别的包名（本地部署态）
ln -s "$(pwd)/dsh-maplay" ~/.dsh/profiles/node_modules/dsh-maplay

# 4. 放 preset
mkdir -p ~/.dsh/.agent-presets
cp -r preset ~/.dsh/.agent-presets/maplay

# 5. 配模型（二选一）
#    a. export DEEPSEEK_API_KEY=sk-xxx
#    b. 或启动后在 DSH 设置里选模型

# 6. 启动
dsh web --patch "$(pwd)/dsh-maplay/cordis.yml"
```

打开 http://127.0.0.1:3080，新建会话，预设选「地图动画（maplay）」。

## 验证

- 「地图动画（maplay）」会话的工具表 = 标准工具 + 29 个 maplay 工具
- 普通（standard）会话**没有** maplay 工具
- 会话头出现「地图」tab，点开是实时地图，切「对话」回到聊天

## 关键配置（dsh-maplay/cordis.yml）

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `embedded` | `true` | 自包含模式（进程内执行器 + 内置前端）；`false` 切外部桥接 |
| `mapFile` | 包内 demo.json | 自定义地图 JSON 的绝对路径 |
| `prefix` | `''` | 工具名前缀（如 `maplay_` 避免重名） |
| `exposeWeb` | `true` | 注册 `/maplay` 嵌入视图（地图 tab 依赖它） |
| `webPath` | `/maplay` | 嵌入视图路径前缀 |
| `chatBridge` | `false` | 保持 `false`，让 DSH 前端正常显示；`true` 会让 `/` 重定向到 maplay chat 页 |

## 常见问题

- **会话头没有「地图」tab**：看浏览器 Console 的 `/plugins/dsh-maplay/client.js` 加载错误；确认步骤 3 的符号链接指向正确的 `dsh-maplay` 目录。
- **preset 里工具报错 / 没有 29 个工具**：确认步骤 2 两个项目都 `npm run build` 成功，且 `preset/agent.cordis.yml` 里的 `name: dsh-maplay/tools-preset` 能解析。
- **地图空白**：确认 `/maplay/playground` 能访问，且 maplay 的 `dist` 已由 `npm run build` 生成。

## 正式发布（可选）

本地部署靠 `file:../maplay` + 符号链接。要「一键安装」，把 `@vcvcvn/maplay` 发到 npm，再把
`dsh-maplay/package.json` 的依赖从 `file:../maplay` 改成 `^0.2.0` 并发布，之后另一台只需：

```bash
npm i -g @deepseek-ai/dsh
dsh plugin add dsh-maplay
# 再 cp preset 到 ~/.dsh/.agent-presets/maplay
```
