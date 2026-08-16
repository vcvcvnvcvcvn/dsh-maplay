# dsh-maplay

让 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（dsh）的 agent 直接驱动 [maplay](https://github.com/vcvcvnvcvcvn/maplay) 地图动画——用 dsh 的「一切皆插件」方式，把 maplay 变成一个 Cordis 插件。

`dsh-maplay` 是一个 Cordis 插件，挂在 dsh 旁边而不是改 dsh 内核：

- **工具**：把 maplay 的 29 个动画工具（`get_board_info`、`moveTo`、`walkTo`、`emote`、`shoot`、`flyTo`、`jump`、`stateChange`……）注册进 dsh 的 `ctx.tools`，模型可以直接调用；每次调用通过 HTTP 桥接到 maplay 的 `/api/tools/call`。
- **maplay chat 前端**：`dsh web` 打开后直接落在 maplay 的 `/chat` 页面（左边地图、右边聊天），聊天请求由插件的 `/api/chat` 桥接，模型走 dsh 的 `ctx.llm`——provider、model、凭据全部来自 dsh 自己的配置，前端零改动、无需填 API Key。
- **生命周期**：插件启动时自动拉起 maplay 的 Vite dev server（已运行则复用），并把地图 JSON 加载进会话。
- **嵌入视图**：在 dsh Web UI 上注册 `/maplay` 代理，`/maplay/playground` 可看全屏动画场景。
- **提示词**：注册一段 system prompt 段落，教会模型「先 `get_board_info` 再动，只使用真实存在的 ID」；chat 桥还会把 maplay 页面的场景摘要拼进每次模型请求。

一切注册都是 effect 作用域：插件卸载时工具、路由自动回收，spawn 的 maplay 进程也会被终止。

## 架构

```text
┌────────────────────────────── dsh ──────────────────────────────┐
│  maplay /chat 页面（浏览器）                                     │
│    │ 同源 POST /api/chat {text, toolCalls}                       │
│    ▼                                                             │
│  dsh-maplay chat bridge → ctx.llm（模型凭据用 dsh 的配置）        │
│    │                                                            │
│  ctx.tools（29 个 maplay 工具，供 headless/web agent 直接调用）    │
│      │ HTTP bridge (POST /api/tools/call)                        │
│      │ /maplay 反向代理（ctx.webServer）                          │
└──────┼──────────────────────────────────────────────────────────┘
       ▼
┌────────────────────────── maplay ───────────────────────────────┐
│  Vite dev server :8992                                          │
│  /api/tools/*  /api/board  /api/playground/session ...          │
│  /chat /playground ← 浏览器里的实时动画                          │
└─────────────────────────────────────────────────────────────────┘
```

插件不 import maplay 的任何代码，只依赖其 HTTP API——两个项目完全解耦。

## 快速开始

前置：Node.js 22+、maplay checkout（`npm install` 过）。

### Web 模式（推荐，打开即 maplay chat）

```bash
dsh web --patch /path/to/dsh-maplay/cordis.yml
```

- 打开 `http://127.0.0.1:3080` → 直接进入 maplay 的 chat 页面（左边地图、右边聊天），模型已默认使用 dsh 配置的 provider/model，不需要填任何 API Key；
- 在「AI 配置」里还可以改 System Prompt；Base URL / API Key / Model 字段由 dsh 接管，填写会被忽略；
- 想全屏看动画：`http://127.0.0.1:3080/maplay/playground`；
- 在会话里输入比如：

  > 让 Leo 宣布比赛开始，Toby 慢走到胡萝卜，Harry 跳到树下睡一觉

### Headless 模式（一次性任务，dsh agent 直接驱动服务端地图）

```bash
dsh --profile headless --patch /path/to/dsh-maplay/cordis.headless.yml \
  "让乌龟慢走到胡萝卜，兔子跳到树旁"
```

### 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `MAPPLAY_DIR` | `/Users/vcvcvn/workspace/maplay` | maplay checkout 路径（cordis.yml 内写死的默认值可按需改） |
| `MAPPLAY_MAP` | `<MAPPLAY_DIR>/demo.json` | 启动时加载进会话的地图 JSON |

> 注意：cordis.yml 里插件 `name` 必须是**绝对路径**（相对路径相对 `~/.dsh/profiles/<name>/` 解析，而不是 patch 文件）。`!!js` 表达式在 dsh 的 loader 里求值，可用 `process.env`。

## 配置项

cordis.yml 中 `config` 支持：

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `baseUrl` | `http://127.0.0.1:8992` | maplay 服务地址 |
| `spawn` | `true` | 无人监听时自动拉起 maplay dev server |
| `maplayDir` | — | maplay checkout 绝对路径（spawn 时需要） |
| `host` / `port` | `127.0.0.1` / `8992` | 拉起 vite 时的绑定参数 |
| `startupTimeoutMs` | `60000` | 等待服务健康的超时 |
| `mapFile` | — | 启动时加载的地图 JSON |
| `prefix` | `''` | 工具名前缀（如 `maplay_`，避免重名） |
| `tools` | 全部 | 只注册这些工具（空数组 = 全部） |
| `fetchTimeoutMs` | `30000` | 单次工具调用超时 |
| `maxBoardChars` | `12000` | 工具结果里 board 文本上限 |
| `exposeWeb` | `true` | 注册 `/maplay` 嵌入视图（headless 下自动跳过） |
| `webPath` | `/maplay` | 嵌入视图路径前缀 |
| `chatBridge` | `true` | 用 dsh 的 `ctx.llm` 接管 `/api/chat`，并把 `/` 重定向到 chat 页面（maplay chat 成为 dsh 前端） |

## 工具清单

注册进 dsh 的 29 个工具（名称与 maplay 一致，模型提示词、会话记录可与 MCP/HTTP 客户端互通）：

`get_board_info` `rollD20` `focus` `resetCamera` `moveTo` `walkTo` `emote` `breathe` `stateChange` `shoot` `flyTo` `knockback` `shove` `grab` `equip` `clearEquipment` `swingEquipment` `removeElement` `changeAppearance` `addEntity` `earthquake` `transition` `addDoor` `removeDoor` `openDoor` `closeDoor` `jump` `setNote` `explodeEntity`

## 与 maplay MCP 方案的对比

maplay 自带 MCP server（stdio 代理到 HTTP API），dsh 的 `@deepseek-ai/dsh-mcp-client` 也能接。两种方式并存：

| | dsh-maplay 插件 | MCP 桥接 |
| --- | --- | --- |
| 工具 schema | dsh 原生 `defineTool`，进 `ctx.tools` 注册表 | MCP 发现，工具名带 `mcp__<server>__` 前缀 |
| 生命周期 | 插件自动 spawn / 回收 maplay | 需要外部启动 maplay + MCP 进程 |
| 嵌入视图 | `/maplay` 代理进 dsh Web UI | 无 |
| 配置 | 一个 cordis.yml | 一个 cordis.yml（`dsh-mcp-client`） |
| 结果格式 | 结构化 board + summary | MCP content 文本 |

## 开发

```bash
npm install
npm run build      # tsc → lib/
node tests/smoke.mjs   # 独立冒烟测试（需要 maplay 已在 8992 运行）
```

插件以 npm 发布包方式分发；本地验证时用 cordis.yml 的绝对路径引用 `lib/index.js`。

## 已知限制

- `/maplay` 嵌入视图依赖插件自带 vite 启动（`--base` 与代理匹配）。外部手动启动的 maplay 没有 base，嵌入视图资源路径会错位——请直接打开 `http://127.0.0.1:8992/playground` 观看。
- Vite HMR websocket 不做代理，页面热更新不可用（不影响播放）。
- 插件与 dsh 各自携带一份 `@deepseek-ai/dsh-tools` 等依赖；`defineTool` 产物是纯数据对象，跨副本兼容，但升级 dsh 时建议同步升级插件依赖。

## License

MIT
