# Artemis

Artemis 是一个项目与任务管理应用，基于 React + TypeScript + Supabase 构建，支持认证、任务管理、主题系统、AI 辅助描述和每日打卡功能。

## 项目状态

**阶段性归档（Maintenance Pause）**

自本次归档发布起，项目进入阶段性维护暂停：

- 不再持续迭代新功能
- 仅在必要时处理阻断性问题
- Issue/PR 可能延迟响应

后续如果恢复活跃开发，会在仓库 Release 和 README 中同步说明。

## 当前功能范围

- 邮箱注册/登录（Supabase Auth）
- 项目与任务管理
- 任务优先级、依赖关系、时间字段
- 多主题界面切换
- AI 任务描述建议（Edge Function）
- 每日打卡（Supabase 持久化）

## 技术栈

- Frontend: React, TypeScript, Vite
- Backend: Supabase (PostgreSQL, Auth, RLS, Realtime, Edge Functions)
- Deploy: Cloudflare Pages

## 运行与部署

- 本地开发：`npm run dev`
- 构建：`npm run build`
- 线上地址：https://artemis-b7j.pages.dev/

## 数据库变更说明

每日打卡功能依赖新增表与策略，请在 Supabase 执行：

- `docs/add_checkin_tables.sql`

## 仓库链接

- GitHub: https://github.com/macintoshwan/Artemis

## 许可证

本项目按仓库现有 License 发布。
