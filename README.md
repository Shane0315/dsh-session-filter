# DSH Activity 侧栏

在 DeepSeek Harness 的「工作区」标题行显示铃铛，打开后在原有会话列表区域显示跨工作区活动；再次点击、按 Escape 或使用 `⌘⌥U` 返回原列表。名册来自 `sessions.list` / `workspaces.list`，运行、等待操作和完成未读来自 `uiSession.sessionStatus`，不读取会话正文。

活动按「需关注」「置顶」（默认关闭）、「定时任务」（默认关闭）和「最近活动」（本地日历近七天，按今天、昨天及星期分组）展示；关闭需关注分组时，超过七天但仍需关注的会话显示在「更早」。支持标题、工作区和路径搜索，最近活动初始显示 10 条并按 10 条加载更多。归档、子会话和空闲空白会话不列出；列表包括折叠工作区中的会话。点击条目调用 DSH 官方跨工作区导航。

菜单支持显示选项、恢复默认、全部标为已读和清理已读。插件在本机 localStorage 保存已观察到的完成未读和已读确认，重建页面后保留待查看结果。批量已读**只影响插件视图**，不会修改 DSH 原生未读状态；运行或等待操作不因标记已读而消失。清理已读会移除不再需要关注的快照条目。插件保留的活动轮次只能依据宿主状态变化和更新时间识别，如果应用完全关闭期间发生多次且最终状态与时间完全一致，无法区分这些轮次。

定时任务使用 DSH `schedule.catalog()` 的最近实际交付记录及其 `sessionId`，展示关联会话并订阅变更；同一会话也可能包含普通对话，DSH 不提供可直接区分独立执行结果会话的合同。读取失败可重试，不影响其他活动。DSH 没有 Codex 的 Work/Chat 来源。插件不会修改宿主或其他插件。菜单可对当前显示的「需关注」分组发起批量归档，确认框逐项列出范围；运行中或等待操作的会话须明确选择「停止并归档」。

## 安装与更新

推荐从 GitHub Release 安装预构建包，无需在安装时构建：

```bash
dsh plugin add https://github.com/Shane0315/dsh-session-filter/releases/latest/download/dsh-session-filter.tgz
```

也可从源码仓库安装（仓库包含预构建产物）：

```bash
dsh plugin add github:Shane0315/dsh-session-filter
```

桌面端请在插件管理或插件市场选择安装来源；desktop profile 由 Electron 管理，不应在应用运行时强行改写配置。安装后按宿主提示重载。插件更新可从发布页面获取新包并使用宿主的更新功能；收录插件市场不等于保证宿主未来版本的兼容性。

本版本已在 DSH Desktop `0.2.1-rc.5` 验证。插件使用官方发布的客户端服务，并通过宿主工作区标题和列表容器定位；DSH 改版可能需要适配，定位失败时界面会提示。关闭视图或插件时恢复原列表。

## 本地开发

```bash
npm ci
npm run check
npm pack
```

需要 Node.js 20 或更新版本。React 由 DSH 宿主提供。`npm run check` 执行类型检查、React 集成和模型测试，并生成 `client/client.js` 与 `lib/`。发布包可直接安装，不依赖源码构建或安装脚本。

## 限制与隐私

- 本地已读状态和显示偏好存储在当前设备的 localStorage，不与 DSH 原生批量已读同步。
- 不读取会话正文、不外传数据；归档操作必须由用户明确确认，运行中目标会提示停止。
- 工作区归属、归档和子会话由宿主名册判断，不通过行图标猜测状态。

## Activity sidebar for DeepSeek Harness

A sidebar activity view across workspaces, using live running, pending-interaction and completion-unread state from DSH. Includes search, optional pinned and scheduled-delivery groups, local read tracking, pagination and confirmed archiving. The default view shows attention items and recent activity. Read acknowledgements are local to this plugin; scheduled deliveries refer to their associated sessions.

Licensed under MIT.
