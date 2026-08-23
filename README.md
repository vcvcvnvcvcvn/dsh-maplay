# dsh-maplay

把 [maplay](https://github.com/vcvcvnvcvcvn/maplay) 2D 地图动画能力，以「插件 + preset」的方式装进 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（dsh）。让 agent 像操作工具一样驱动地图上的实体：移动、表情、投射物、镜头、门、状态变化——动画实时出现在浏览器里。

- **29 个 maplay 工具**（`get_board_info`、`moveTo`、`walkTo`、`shoot`、`flyTo`、`jump`……）在 `maplay` preset 下出现
- 前端保留 dsh 完整界面，会话头多一个「地图」tab，点开是实时地图（SSE 动画）
- **每会话独立地图**：地图按 `sessionId` 隔离，每个 agent 会话拥有自己的世界，互不共享

## 快速开始（新用户，约 1 分钟）

环境要求：Node.js 22+、npm（脚本会自动装 pnpm）。

```bash
curl -fsSL https://raw.githubusercontent.com/vcvcvnvcvcvn/dsh-maplay/main/install.sh | sh
dsh web
```

然后：打开 `http://127.0.0.1:3080` → 新建会话 → 预设选 **「地图动画（maplay）」** → 会话头出现「地图」tab，直接对 agent 说：

> 让 Leo 宣布比赛开始，Toby 慢走到胡萝卜，Harry 跳到树下

脚本自动完成：装 dsh → 装插件（GitHub）→ 放 preset → 挂载到 web profile。之后 `dsh web` 直接启动，无需任何参数。

> 国内网络 GitHub 直连慢时：
> ```bash
> git clone https://ghfast.top/https://github.com/vcvcvnvcvcvn/dsh-maplay
> cd dsh-maplay && sh install.sh
> ```

## 手动安装（不想用脚本）

```bash
# ① 装 dsh
npm i -g @deepseek-ai/dsh

# ② 装插件（GitHub 安装，自动带上 @vcvcvn/maplay）
dsh plugin add github:vcvcvnvcvcvn/dsh-maplay

# ③ 放 preset
mkdir -p ~/.dsh/.agent-presets
cp -r <dsh-maplay 仓库>/preset ~/.dsh/.agent-presets/maplay

# ④ 挂载（写进 ~/.dsh/profiles/web/cordis.patch.yml）
- insert:
    - id: maplay
      name: dsh-maplay
      config:
        embedded: true
        prefix: ''
        fetchTimeoutMs: 30000
        maxBoardChars: 12000
        exposeWeb: true
        webPath: /maplay
        chatBridge: false

# ⑤ 配模型（二选一）
#    a. export DEEPSEEK_API_KEY=sk-xxx
#    b. 启动后在 dsh 设置里选模型

# ⑥ 启动
dsh web
```

## 目录结构

```
dsh-maplay/
├── install.sh        一键安装脚本（新用户用）
├── cordis.yml        挂载模板（host 插件）
├── preset/           maplay agent preset（agent.cordis.yml + preset.yml）
├── src/              插件源码（host + tools-preset 两半）
├── browser.js        dsh web UI 的「地图」tab（browser 半）
└── tests/            冒烟测试
```

插件分三半：

| 半 | 作用 |
| --- | --- |
| **host**（`lib/index.js`） | 进程内跑 maplay 执行器、serve 前端、提供 `maplay` executor 服务、每会话隔离地图 |
| **tools-preset**（`dsh-maplay/tools-preset`） | preset 半：把 29 个工具注册进 `maplay` preset 的会话作用域 |
| **browser**（`browser.js`） | dsh web UI：会话头「地图」tab，iframe 展示该会话自己的地图 |

## 验证

- 「地图动画（maplay）」会话的工具表 = 标准工具 + 29 个 maplay 工具
- 普通（standard）会话**没有** maplay 工具
- 会话头出现「地图」tab，点开是实时地图，切「对话」回到聊天
- 两个会话各自驱动各自的地图，互不干扰

## 配置项（挂载时的 config）

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `embedded` | `true` | 自包含模式（进程内执行器 + 内置前端）；`false` 切外部桥接 |
| `mapFile` | 包内 demo.json | 自定义地图 JSON 的绝对路径 |
| `prefix` | `''` | 工具名前缀（如 `maplay_` 避免重名） |
| `exposeWeb` | `true` | 注册 `/maplay` 嵌入视图（地图 tab 依赖它） |
| `webPath` | `/maplay` | 嵌入视图路径前缀 |
| `chatBridge` | `false` | 保持 `false` 让 dsh 前端正常显示；`true` 会让 `/` 重定向到 maplay chat 页 |

## 常见问题

- **会话头没有「地图」tab**：确认插件已挂载（cordis.patch.yml 有 insert 段）且 `~/.dsh/profiles/node_modules/dsh-maplay` 存在；浏览器 Console 看 `/plugins/dsh-maplay/client.js` 是否加载。
- **preset 里没有 29 个工具**：确认 preset 已放置（`~/.dsh/.agent-presets/maplay`），且 `preset/agent.cordis.yml` 的 `name: dsh-maplay/tools-preset` 能解析。
- **地图空白**：确认 `/maplay/playground` 能访问；插件从 `@vcvcvn/maplay` 包读取前端 dist，GitHub 安装已内置。
- **插件更新**：重新 `dsh plugin add github:vcvcvnvcvcvn/dsh-maplay`（或重跑 install.sh）。

## 开发

```bash
# 两个项目各自构建（产物提交进 git，GitHub 安装无需构建）
cd maplay        && npm install && npm run build
cd ../dsh-maplay && npm install && npm run build

# 本地开发：让 dsh-maplay 读本地 maplay 而非 GitHub 版
cd dsh-maplay && rm -rf node_modules/@vcvcvn/maplay && ln -s ../../maplay node_modules/@vcvcvn/maplay

# 冒烟测试（需 maplay 已构建）
node tests/smoke.mjs
```

## License

MIT
