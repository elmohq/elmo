# Web 控制台 i18n 与 Locale 系统设置实施规划

> 状态：已实施并完成本地浏览器验收
> 编写日期：2026-08-08
> 当前 Locale：`en`、`es`、`ja`、`zh-CN`、`zh-TW`

## 1. 决策摘要

Web 控制台将采用 Paraglide 建立 i18n 基础设施，并通过服务端设置持久化 Locale，不新增独立的客户端 Locale Cookie。

最终采用两层设置：

1. 系统默认语言：管理员设置，对当前部署生效。
2. 用户显示语言：用户设置，跨品牌、浏览器和设备生效。

保持现有 URL 不变，不引入 Locale 路径前缀。服务端根据认证 Session、用户偏好、浏览器 `Accept-Language` 和系统默认值解析当前请求的 Locale；客户端从 SSR 输出的 `<html lang>` 读取当前 Locale。用户修改语言后，由 Server Function 写入数据库并刷新当前文档，以保证 SSR 内容、Hydration、页面标题和无障碍属性使用同一种语言。

## 2. 目标与非目标

### 2.1 目标

- 为 `apps/web` 的固定界面文案提供英语、西班牙语、日语、简体中文和繁体中文显示。
- 提供全局“系统设置 / 语言与地区”页面。
- 支持系统默认语言和用户显示语言的服务端持久化。
- 保证首次 SSR、客户端 Hydration、SPA 导航和页面 Metadata 的 Locale 一致。
- 统一日期、数字、百分比、复数和相对时间的本地化格式。
- 覆盖可见文案以及 `aria-label`、`title`、`placeholder`、屏幕阅读器文本等无障碍文案。
- 保持现有路由、认证回调、公共 API 和数据库业务标识兼容。
- 为后续增加更多 Locale 和翻译协作工具保留扩展空间。

### 2.2 非目标

- 不翻译品牌名、竞争对手名称、用户输入的 Prompt、域名和引用标题。
- 不自动翻译 LLM Response、AI 生成的 Opportunities 或报告正文。
- 不在本项目中国际化 `apps/www`、开发者文档、CLI、Worker 日志或公共 OpenAPI 内容。
- 不本地化 URL 路径。
- 不改变 `/api/v1` 的字段、错误结构和既有英文契约。
- 不在首版提供未登录用户的手动语言持久化；认证前页面使用浏览器语言和系统默认语言。

## 3. 当前状态盘点

当前 `apps/web` 没有 i18n 依赖或消息目录，主要问题包括：

- `apps/web/src/routes/__root.tsx` 将 `<html lang>` 固定为 `en`，并将 `og:locale` 固定为 `en_US`。
- `apps/web/src/components/nav-user.tsx` 只有品牌切换和退出登录，没有全局系统设置入口。
- `apps/web/src/components/app-sidebar.tsx` 中的 Settings 全部是品牌级设置，不适合承载用户级 Locale。
- `apps/web/src/lib/domain-categories.ts`、`apps/web/src/lib/prompt-order.ts` 等模块把稳定业务值和英文显示标签绑定在一起。
- 图表、列表和报告中同时存在固定 `en-US`、运行环境默认 Locale 和无 Locale 的 `toLocaleString` 调用。
- `packages/ui` 的 Breadcrumb、Dialog、Sheet、Sidebar、TagsInput 和 Command 等组件包含英文无障碍文本。
- 服务端错误大量直接使用英文字符串，部分会透传到 UI。

一次启发式静态扫描得到以下改造基线：

| 类别 | 数量 | 说明 |
| --- | ---: | --- |
| 包含直接 JSX 英文文本的 TSX 文件 | 48 | 已排除 Story 和测试，不能视为完整消息数 |
| 包含日期或数字格式化的文件 | 34 | 共约 92 个调用点，包含展示逻辑和内部日期计算 |
| 包含 Route Head 的路由文件 | 19 | 页面标题、描述和社交 Metadata |
| 包含服务端 `throw new Error` 的文件 | 14 | 需区分 UI 错误与技术错误 |
| `aria-label`、`placeholder`、`title` 等调用点 | 约 118 | 需人工判断是否属于用户可见文案 |

以上数字用于评估工作量，不作为翻译完整性检查的唯一依据。

## 4. Locale 语义与解析规则

### 4.1 类型

```ts
export const supportedLocales = ["en", "es", "ja", "zh-CN", "zh-TW"] as const;

export type Locale = (typeof supportedLocales)[number];
export type LocalePreference = "auto" | Locale;
```

- `system.defaultLocale` 只能是受支持的显式 Locale。
- `user.localePreference` 可以是 `auto` 或显式 Locale。
- `auto` 表示优先使用请求的 `Accept-Language`，而不是复制系统默认值到用户记录。

### 4.2 请求解析顺序

认证用户：

1. 用户显式选择的任一受支持 Locale。
2. 用户选择 `auto` 时，将 `Accept-Language` 匹配到受支持 Locale。
3. 系统默认语言。
4. 代码内最终回退 `en`。

未认证用户：

1. 将 `Accept-Language` 匹配到受支持 Locale。
2. 系统默认语言。
3. 代码内最终回退 `en`。

解析失败、数据库暂时不可用或设置值非法时必须安全回退，不得阻止登录页或错误页渲染。

### 4.3 部署模式行为

| 部署模式 | 用户语言 | 系统默认语言 |
| --- | --- | --- |
| local | 单个用户可设置 | 管理员可设置 |
| cloud | 每个账号独立设置 | 平台管理员可设置 |
| whitelabel | 每个 Auth0 映射用户独立设置 | 当前部署管理员可设置 |
| demo | 只读，保持 `auto` | 读取既有值，不允许修改 |

Demo 使用共享账号。如果把语言写入共享用户记录，不同访客会互相覆盖，因此 Demo 不开放用户语言写入，按每个请求的 `Accept-Language` 显示。

## 5. 服务端持久化设计

### 5.1 数据表

建议使用独立偏好表，不把 Locale 写进 Better Auth 自动生成的 `user` Schema。这样可以避免认证 Schema 生成流程和 Session Cookie Cache 导致的偏好陈旧，也为未来时区、日期格式等设置提供稳定边界。

`user_preferences`：

| 字段 | 类型 | 约束 |
| --- | --- | --- |
| `user_id` | text | 主键，外键到 `user.id`，级联删除 |
| `locale_preference` | text | 非空，默认 `auto` |
| `created_at` | timestamp | 非空，默认当前时间 |
| `updated_at` | timestamp | 非空，更新时刷新 |

`system_settings`：

| 字段 | 类型 | 约束 |
| --- | --- | --- |
| `id` | text | 主键，首版固定为 `global` |
| `default_locale` | text | 非空，默认 `en` |
| `updated_at` | timestamp | 非空，更新时刷新 |
| `updated_by` | text/null | 可选外键到 `user.id` |

Locale 在应用边界使用共享 Zod Schema 校验。数据库中不存在 `system_settings` 行时读取为 `en`，管理员第一次保存时执行 Upsert，不要求单独 Seed。

### 5.2 服务端接口

新增设置服务模块，建议暴露：

- `getLocaleSettingsFn`：返回当前用户偏好、系统默认值和支持的 Locale。
- `updateMyLocalePreferenceFn`：认证用户更新自己的 `auto` 或任一受支持 Locale。
- `updateSystemDefaultLocaleFn`：仅管理员更新系统默认值。
- `resolveRequestLocale`：供 SSR Locale 中间件使用，不作为公共 API 暴露。

所有写入都必须使用服务端枚举校验和现有权限判断。公共 `/api/v1` 不增加 Locale 设置接口，除非以后明确需要外部自动化管理。

### 5.3 读取与缓存

- 使用现有 Better Auth Session 只获取用户身份。
- Locale Resolver 根据 `user.id` 直接读取 `user_preferences`，避免依赖可能缓存五分钟的自定义 Session 字段。
- 用户修改偏好后刷新当前文档，下一次 SSR 必须立即读取新值。
- 系统默认值可以使用短 TTL 缓存，但更新接口必须使当前进程缓存失效。
- 多实例部署若使用进程内缓存，允许在 TTL 内最终一致；如果产品要求全实例立即生效，再引入数据库通知或共享缓存，不在首版增加基础设施依赖。

## 6. i18n 技术架构

### 6.1 方案选择

采用 Paraglide，原因如下：

- TanStack Router/Start 已提供官方集成范式。
- 支持请求级 SSR Locale 隔离。
- 生成类型安全、可 Tree-shake 的消息函数。
- 支持基于 `Intl` 的数字、日期、复数和相对时间格式。
- React Adapter 可以渲染包含链接、强调样式和内联组件的完整消息。

首版需要评估并通过 pnpm 安装：

- `@inlang/paraglide-js`
- `@inlang/paraglide-js-react`
- Inlang Message Format 对应模块

安装必须遵守仓库的 pnpm 供应链安全策略；如果依赖因最小发布时间或构建脚本策略被阻止，应停止并报告，不得绕过。

### 6.2 消息与生成物

建议目录：

```text
apps/web/
  messages/
    en.json
    es.json
    ja.json
    zh-CN.json
    zh-TW.json
  project.inlang/
    settings.json
  src/
    i18n/
      locale.ts
      locale.server.ts
      formatting.ts
    paraglide/          # Vite/CLI 生成物
```

英文目录是默认消息和语义来源。生成目录由构建流程维护，不手工编辑；是否提交生成物应以本地开发、CI 类型检查和 Paraglide 官方建议验证后确定。

### 6.3 SSR 请求链路

`apps/web/src/server.ts` 中的目标顺序：

```text
Sentry fetch wrapper
  → resolve authenticated identity
  → resolveRequestLocale
  → Paraglide request context
  → TanStack Start handler
  → append existing security headers
  → response
```

必须保证 Paraglide 返回的重定向或错误响应同样获得现有安全 Header。

服务端自定义 Locale Strategy 可以异步访问数据库，并把最终 Locale 放入请求级 AsyncLocalStorage。不得使用可在并发请求间共享的全局可变 Locale。

### 6.4 客户端 Locale

不使用独立 Locale Cookie，也不依赖 URL，因此客户端 Runtime 从 `document.documentElement.lang` 读取 SSR 已解析的 Locale。

语言设置流程：

1. 用户在系统设置页选择语言。
2. 调用对应 Server Function 写入数据库。
3. 服务端返回成功。
4. 浏览器刷新当前 `pathname + search + hash`。
5. 新 SSR 请求读取最新服务端设置。

不使用 `setLocale(locale, { reload: false })`，避免文档语言、Metadata 和 React UI 不一致。

### 6.5 根文档和 Metadata

`apps/web/src/routes/__root.tsx` 需要动态生成：

- `<html lang={locale}>`
- `<html dir={getTextDirection(locale)}>`
- `og:locale`，例如 `en_US`、`es_ES`、`ja_JP`、`zh_CN`、`zh_TW`
- 默认页面标题、描述、Twitter 和 Open Graph 文案

各业务 Route 的 `head` 使用请求上下文中的消息函数生成页面标题和描述。不能在模块加载时把翻译结果缓存为常量。

如果 PWA Manifest 本地化名称和描述，必须按 Locale 区分缓存或使用不共享的缓存策略，防止一个用户的语言响应被另一个用户复用。

## 7. 系统设置界面

### 7.1 路由与入口

- 新增全局认证路由 `/settings`，不放在 `/app/$brand/settings/*` 下。
- 在 `NavUser` 中增加“系统设置”入口。
- 设置页提供返回当前品牌 Dashboard 或品牌选择页的操作。
- 品牌级 Settings 保持 Brand、Competitors、Prompts、LLMs 和 Team，不混入用户全局偏好。

### 7.2 普通用户区域

“语言与地区”卡片：

- 显示语言：
  - 跟随浏览器（`auto`）
  - English（`en`）
  - Español（`es`）
  - 日本語（`ja`）
  - 简体中文（`zh-CN`）
  - 繁体中文（`zh-TW`）
- 显示当前解析结果，例如“当前显示：简体中文”。
- 说明该设置对当前账号和所有品牌生效。
- 保存期间禁用控件，失败时显示本地化错误，不提前刷新页面。

### 7.3 管理员区域

管理员额外看到“系统默认语言”：

- 只能选择显式 Locale，不能选择 `auto`。
- 说明仅对没有用户显式设置且浏览器语言无法匹配的请求生效。
- 修改后记录 `updated_by` 和 `updated_at`。
- Demo 模式中只读显示。

## 8. 翻译工程规范

### 8.1 消息键

- 使用稳定语义键，例如 `nav.overview`、`settings.language.title`。
- 不把英文原文直接作为消息键。
- 共享消息复用同一个键，业务语义不同的同词应使用不同键。
- 为短词补充翻译上下文，避免 `Brand`、`Run`、`Prompt` 等术语歧义。

### 8.2 完整句子

- 翻译完整句子，不使用“前半句 + 数字 + 后半句”拼接。
- 复数、数字和日期作为原始值传入消息函数，由消息格式处理。
- 包含 Link、强调数字或 Badge 的句子使用 Paraglide React Markup，允许译文调整词序。

### 8.3 稳定值与显示标签分离

以下类型的配置只能保存稳定值，不保存运行时翻译结果：

- Navigation Item
- Citation Category 和 Page Type
- Prompt Order
- Tab、Filter 和 Lookback 选项
- Job Status、Report Status 和错误码

标签必须在 React 渲染或 Route Head 执行时根据当前请求 Locale 解析。不得在模块顶层调用消息函数并保存字符串，否则会产生 SSR 请求串语言或语言切换后标签不更新的问题。

### 8.4 日期、数字与时区

- 新增统一的展示格式化封装，Locale 来自当前 i18n Runtime。
- 时间仍使用现有用户浏览器时区，语言切换不能改变查询范围。
- 当前用于生成 `YYYY-MM-DD` 业务日期键的 `en-CA` 调用属于内部计算，不应机械替换成用户 Locale。
- 图表坐标轴、Tooltip、报告日期、分页数字和百分比统一使用 Locale-aware Formatter。
- 排序时根据业务语义决定是否使用当前 Locale Collator；ID、URL 和内部 Key 不进行本地化排序。

### 8.5 错误处理

- UI 可预期错误逐步改为稳定错误码，由客户端映射成翻译消息。
- 技术日志、Sentry Exception 和公共 API 错误保持可诊断的英文信息。
- Better Auth 返回的错误按 Code/Status 映射，未知错误显示本地化通用消息，避免直接展示不可控的第三方英文文案。
- 不为完成 i18n 而改写所有服务端异常；只处理会直接到达用户界面的路径。

### 8.6 `packages/ui`

`packages/ui` 不依赖 `apps/web` 的 Paraglide 生成物。通用组件中的固定无障碍文案通过 Props 或轻量 Labels 对象由调用方注入，同时保留英文默认值，避免破坏 `apps/www`、Storybook 和其他消费者。

## 9. 页面迁移范围与顺序

### 9.1 第一批：框架和认证

- Root、404、默认错误页、Pending Shell。
- Sidebar、Breadcrumb、NavUser、SiteHeader。
- Login、Register、Forgot Password、Reset Password、Invitation。
- Brand Switcher、Brand Onboarding、Missing Env Page。
- 系统设置页。

### 9.2 第二批：核心分析页面

- Overview。
- Visibility。
- Share of Voice。
- Query Fan-Out。
- Citations。
- Opportunities。

### 9.3 第三批：Prompt 与品牌设置

- Prompt 列表、编辑、详情和 History。
- Brand、Competitors、Prompts、LLMs、Team。
- 通用 Filter、Pagination、Empty State、Unsaved Changes。

### 9.4 第四批：管理与输出

- Admin Brands、Workflows、Tools。
- Reports 列表和固定报告 UI。
- Chart Download、Chart Export Preview 和 Print UI。
- PWA Manifest、Route Head、Open Graph 固定文案。

AI 生成正文、Prompt 内容、引用页面标题和品牌数据保持原始语言。若未来需要“按报告语言生成内容”，应为 Report Job 增加独立 Locale 字段并调整 Worker Prompt，不与本次 UI i18n 混合实施。

## 10. 分阶段交付计划

### PR 1：服务端设置模型与 Locale Resolver

- 新增共享 Locale 类型和 Zod Schema。
- 新增 `user_preferences`、`system_settings` Drizzle Schema。
- 生成新的 Drizzle Migration 文件，但不执行 Migration。
- 实现查询、Upsert、权限和请求 Locale 解析。
- 为解析优先级、非法值、匿名请求和数据库回退添加单元测试。

### PR 2：Paraglide SSR 基础设施

- 使用 pnpm 引入依赖。
- 增加 Inlang Project、英文和中文消息目录。
- 配置 Vite 生成流程。
- 接入 Server Middleware、客户端 Document Strategy 和动态 Root Metadata。
- 增加 SSR 请求隔离和 Hydration 一致性测试。
- 此时不暴露语言切换入口。

### PR 3：系统设置与用户切换

- 新增 `/settings` 路由。
- 增加用户偏好和管理员默认语言区域。
- 在 NavUser 增加入口。
- 写入成功后刷新并保持当前地址。
- 处理 Demo 只读模式和错误状态。

### PR 4：公共 Shell、认证与共享 UI

- 迁移 Navigation、Breadcrumb、Auth、Onboarding 和全局错误页。
- 为 `packages/ui` 增加可注入无障碍 Labels。
- 建立术语表和消息命名约定。
- 更新相关 Storybook Fixture，验证中英文布局。

### PR 5：核心分析与设置页面

- 按功能域迁移 Dashboard、Charts、Prompts 和品牌设置。
- 拆分静态配置中的业务值与标签。
- 统一日期、数字、复数和百分比格式。
- 将用户可见错误替换为错误码映射。

### PR 6：管理、报告、完整性检查与启用

- 完成 Admin、Reports、Export、Print、Metadata 和剩余无障碍文案。
- 添加消息完整性检查和允许保留英文的明确 Allowlist。
- 完成 E2E、视觉检查和中文术语审校。
- 最后启用系统设置入口和中文 Locale。
- 为用户可见功能添加 Patch Changeset。

## 11. 测试与验证

遵循仓库约定，开发过程中只运行当前改动所需的定向测试；完整测试、类型检查和格式化由 CI 承担，除非排查问题必须在本地运行。

### 11.1 单元测试

- `Accept-Language` 匹配和区域回退。
- 用户显式设置优先于浏览器和系统默认值。
- `auto`、匿名用户、非法数据库值和读取失败回退。
- Locale Schema、设置权限和 Upsert。
- 日期、数字、百分比和复数格式。
- 稳定业务枚举不因翻译而变化。

### 11.2 SSR/集成测试

- 同时发起不同受支持 Locale 的请求时不串语言。
- SSR HTML、`lang`、`dir`、标题和 Hydration 一致。
- 用户更新后下一次文档请求立即使用新语言。
- System Default 更新只影响符合回退条件的请求。
- 公共 API 输出不随 UI Locale 改变。

### 11.3 E2E

- `auto` 用户按浏览器语言进入中文 UI。
- 用户在 `/settings` 选择中文，刷新和跨品牌后保持。
- 同一账号在新浏览器 Session 中读取服务端偏好。
- 管理员更新系统默认值，普通用户不能更新。
- Demo 显示只读设置且不同访客不会互相覆盖。
- 切换前保留当前 Path、Search 和 Hash。
- 五种语言下登录、Dashboard、Prompt、Citations 和设置主流程可用。

### 11.4 视觉与无障碍检查

- Sidebar、Table、Dialog、Tooltip 和移动端布局没有本地化文案截断。
- 图表 Tooltip 和轴标签在五种 Locale 下可读。
- 屏幕阅读器文本、Button Name、Form Label 和错误 Alert 均已翻译。
- 语言选择器可以使用键盘操作，并用每种语言的自称显示选项。

## 12. 验收标准

- `en`、`es`、`ja`、`zh-CN` 和 `zh-TW` 均可完整显示 Web 控制台固定 UI。
- 用户偏好和系统默认值只保存在服务端数据库，不新增 Locale Cookie。
- 用户显式设置跨品牌、刷新和设备保持。
- `auto` 严格按既定优先级解析。
- SSR 和 Hydration 不出现语言闪烁或不匹配警告。
- 页面标题、Metadata、日期、数字、复数和无障碍文本与当前 Locale 一致。
- 不出现翻译 Key、意外英文残留或通过字符串拼接造成的中文语序问题。
- Demo 共享账号不会因服务端用户偏好发生访客间语言竞争。
- `/api/v1`、认证回调、业务枚举、URL 和用户内容保持兼容。
- Migration 文件经过 Review；本地隔离数据库仅在获得明确授权后执行，其他环境仍需单独授权。
- 用户可见功能附带符合仓库规则的 Patch Changeset。

## 13. 发布与回滚

- 数据库变更只新增表，保持向后兼容。
- 在英文消息和 SSR 基础设施完成后再逐域迁移，语言入口最后启用，避免公开半翻译状态。
- 缺少目标语言消息时开发和 CI 应报告；生产环境以英文为安全回退。
- 回滚 UI 时可以隐藏 `/settings` 入口并将 Resolver 固定回 `en`，已保存的偏好数据无需删除。
- 回滚不得删除设置表或用户偏好数据，后续重新启用时可继续使用。
- 数据库 Migration 的实际执行必须由用户单独明确授权。

## 14. 预计工作量

以一名熟悉代码库的工程师、首批 `en + zh-CN` 为基准：

| 工作项 | 预计工程日 |
| --- | ---: |
| 数据模型、权限和请求 Locale Resolver | 2–3 |
| Paraglide、SSR 和 Metadata 基础设施 | 2–3 |
| 系统设置 UI 和服务端切换 | 1–2 |
| 页面、图表、错误和共享 UI 迁移 | 5–7 |
| 测试、视觉检查和翻译审校 | 2–3 |
| 合计 | 12–18 |

该估算不包含专业翻译采购、更多 Locale、AI 生成内容本地化或公共网站国际化。

## 15. 主要影响文件

预计涉及但不限于：

- `apps/web/package.json`
- `apps/web/vite.config.ts`
- `apps/web/src/server.ts`
- `apps/web/src/routes/__root.tsx`
- `apps/web/src/routes/_authed.tsx`
- `apps/web/src/components/nav-user.tsx`
- `apps/web/src/components/app-sidebar.tsx`
- `apps/web/src/components/site-header.tsx`
- `apps/web/src/lib/route-head.ts`
- `apps/web/src/lib/domain-categories.ts`
- `apps/web/src/lib/prompt-order.ts`
- `apps/web/src/components/base-chart.tsx`
- `packages/lib/src/db/schema.ts`
- `packages/lib/src/db/migrations/*`
- `packages/ui/src/components/*`
- `e2e/tests/*`

## 16. 参考资料

- [TanStack Router Internationalization](https://tanstack.com/router/latest/docs/guide/internationalization-i18n)
- [Paraglide for TanStack Start](https://paraglidejs.com/tanstack-start)
- [Paraglide Locale Strategy](https://paraglidejs.com/strategy)
- [Paraglide Runtime and Locale Switching](https://paraglidejs.com/basics)
- [Paraglide Formatting](https://paraglidejs.com/formatting)
- [Paraglide React Markup](https://paraglidejs.com/markup)

## 17. 实施记录（2026-08-08）

已按本规划完成以下内容：

- 接入 Paraglide，建立五种语言的消息目录、请求级服务端 Locale Strategy、客户端 Document Strategy 以及动态 `lang`、`dir` 和 Metadata。
- 新增 `user_preferences` 与 `system_settings` Schema 和 `0012_locale_settings.sql` Migration，并在获得授权后应用到隔离测试数据库。
- 实现“用户显式偏好 → Accept-Language → 系统默认值 → en”的解析链路，并提供用户设置和管理员系统默认设置的服务端写入。
- 新增全局 `/settings` 页面和导航入口；Demo 模式保持只读，保存后刷新当前文档以重新完成 SSR。
- 完成认证、Shell、Dashboard、Visibility、Share of Voice、Query Fan-Out、Citations、Opportunities、Prompt、品牌设置、Admin、Reports、Export 与 Print 固定界面文案迁移。
- 为 Breadcrumb、Dialog、Sheet、Sidebar 和 TagsInput 提供可注入 Labels，`packages/ui` 不依赖 Web 翻译运行时。
- 将用户可见日期、数字、百分比、分页和图表 Tooltip 接入当前 Locale 的 `Intl` 格式化；生成业务日期键所需的 `en-CA` 保持不变。
- 五个语言目录各包含 812 个同名消息键；品牌名、用户 Prompt、引用标题和 AI 生成正文按非目标保持原文。

已完成的本地验证：

- Paraglide 消息生成成功。
- Web TypeScript 检查成功。
- Locale Resolver 定向测试 7 项全部通过。
- Web 客户端与 SSR 生产构建成功。
- 可见 JSX 文本、文案属性、固定 Locale 格式化和语言目录键集合完成静态审计。

已完成的运行时验收：

- 获得明确授权后，在空的隔离数据库 `elmo_i18n_dev` 执行现有项目 Migration；13 条 Drizzle Migration 全部成功，未修改其他数据库。
- 启动本地 Web 开发服务并通过浏览器创建合成测试账号；登录页、品牌选择页、全局设置、管理后台和品牌配置页均成功完成 SSR 与客户端渲染。
- 从 `auto` 切换到 `en` 后，刷新后的页面标题、固定文案和 `<html lang>` 立即变为英文，数据库偏好为 `en`。
- 切换到 `zh-CN` 后，刷新及退出后重新登录仍恢复简体中文，数据库偏好为 `zh-CN`。
- `auto` 模式通过 UI 写入数据库并按浏览器语言解析为中文。
- 管理员通过系统设置将默认 Locale 保存为 `zh-CN`，数据库记录了 `updated_by`；匿名 `fr-FR` 请求回退为中文，匿名 `en-US` 请求仍优先显示英文。
- 中文文档元数据实测为 `lang="zh-CN"`、`dir="ltr"`、`og:locale="zh_CN"`，页面描述和标题使用中文消息。
- 西班牙语、日语和繁体中文通过匿名 SSR 请求验收，区域语言分别解析为 `es`、`ja`、`zh-TW`，并输出对应的本地化标题和 `og:locale`。
- 管理后台图表日期按中文 Locale 显示，浏览器控制台无错误；中文系统设置页完成全页视觉检查，无明显截断或布局错位。
- 浏览器验收发现全局设置页曾生成 `/app/undefined` 品牌链接；已修正为仅在存在品牌上下文时渲染品牌导航，并复验不存在无效链接。

生产、预发布或其他共享环境的 Migration 仍必须获得对应环境的单独明确授权。
