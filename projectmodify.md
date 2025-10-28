前端页面 i18n + 设计 Token 改造

目标：为 {PAGE_PATH} 页面完成前端 i18n 与设计 Token 改造，并通过可视验收。

要求：
1) i18n（前端）
- 找出页面所有中文/硬编码文案，替换为 $t('{NAMESPACE}.{KEY}')。
- 在 {LOCALE_DIR}/zh.json 与 {LOCALE_DIR}/en.json 中补齐键值（中文/英文对应）。
- 处理插值与复数（如 $t('{NAMESPACE}.count', { count })）。
- 所有 Element Plus 组件的文案/placeholder 也改为 $t。
- 为 aria-label/title 等可访问性文本添加 i18n。
- **优化重复条目**：对于相同的中英文条目，应合并到 `shared` 部分，而不是在每个主体下都重新定义一遍。例如：
  * `languageNames`、`languageOptions`、`subsystemOptions` 等通用配置应放在 `shared` 部分
  * 各功能模块通过 `$t('shared.languageNames.zh')` 引用共享条目
  * 避免在 `errorCodes`、`i18nErrorCodes` 等不同模块中重复定义相同的翻译内容

2) 设计 Token / 样式
- 确认 design-tokens.css 已在全局被引入（frontend/src/main.js 有 import './assets/styles/design-tokens.css'）。
- 将按钮统一替换为基于 Token 的类，遵循以下规则：
  * 表格内操作按钮：使用 btn-text（普通文本按钮）和 btn-text-danger（危险文本按钮）
  * 表格外操作栏按钮：使用 btn-primary（主要按钮）和 btn-secondary（次要按钮）
  * 一行多个按钮时：首个按钮使用 btn-primary，其余使用 btn-secondary
  * 可选尺寸类：btn-sm/btn-lg（仅在需要时使用）
- 移除页面内行内色值与 magic number，替换为 var(--text-*)、var(--bg-*)、var(--border-*) 等 Token。
- 若有样式冲突（如第三方库覆盖），保证 btn-* 样式优先级正确（避免使用过多 !important，仅在冲突处最小化使用）。
- 保持尺寸一致：使用 btn-sm/btn-lg；不要在页面里再手动改 padding/line-height 影响统一性。

后端接口 i18n 改造（错误/提示消息国际化）

目标：将后端 {BACKEND_PATH} 模块的用户可见消息国际化（i18n），并与前端语言一致。

要求：
1) 找出所有用户可见字符串（错误信息、成功提示、校验文案、日志可见提示）。
2) 将它们替换为 i18n key（如 server.{MODULE}.{KEY}），在后端 locales 目录增加 zh/en 词条。
3) 语言分发策略：
- 优先读取请求头 Accept-Language 或用户配置（如 JWT 中 locale），默认 zh。
- 回复 JSON 中的 message 字段统一使用 i18n.t(key, params)。
4) 参数插值与复数处理（如文件数/限制）。
5) 单元测试/集成测试：覆盖至少一个 zh 与 en 的断言。
6) 与前端对齐：
- 返回的 key 与最终渲染 message 均可行（推荐返回最终 message 文本）。
- 将 key 列表同步给前端文档。
7) **优化重复条目**：对于相同的中英文条目，应合并到 `shared` 部分，而不是在每个模块下都重新定义一遍。例如：
  * `languageNames`、`subsystemOptions` 等通用配置应放在 `shared` 部分
  * 各模块通过 `i18n.t('shared.languageNames.zh')` 引用共享条目
  * 避免在 `i18nErrorCode` 等不同模块中重复定义相同的翻译内容

仅做页面样式 Token 化（不动文案）
目标：将 {PAGE_PATH} 页面样式全面 Token 化，保持功能不变。

要求：
- 确认 design-tokens.css 已全局引入，button-tokens.css 已生效。
- 替换所有颜色/阴影/边框/背景/文字为对应 Token（示例：var(--text-primary)、var(--bg-brand-solid)、var(--border-secondary)）。
- 按钮统一用 btn-* 与可选尺寸类，遵循以下规则：
  * 表格内操作按钮：使用 btn-text（普通文本按钮）和 btn-text-danger（危险文本按钮）
  * 表格外操作栏按钮：使用 btn-primary（主要按钮）和 btn-secondary（次要按钮）
  * 一行多个按钮时：首个按钮使用 btn-primary，其余使用 btn-secondary
- 移除行内样式与局部硬编码色值。
- 解决第三方覆盖冲突（最小化提升优先级）。
- 验收：交互态一致、无尺寸"干涉"、移动端断点样式 OK，输出差异说明。


如何确定按钮顺序？

对话习惯：按钮放置顺序类似于电脑和用户的对话，优先询问用户可能需要执行的操作，或你希望用户执行的操作，最后向用户提供存在风险的操作。
方向性含义：例如，具有返回意义的按钮，应该放在左侧，暗示其方向是回到之前，例如上一步。

工具栏中的操作类型很多，我们会倾向于将变化较少的内容位置固化。以表格工具栏举例，排列逻辑如下：

业务逻辑：「推进」进程的操作。例如：编辑、新建、发布、保存、取消、撤回等；
视图控制：控制内容展示的形式。例如：全屏、表格密度、放大缩小、布局控制等；
其他：刷新、分享、设置等；
溢出：被折叠的操作，若进行响应式设计，从右往左折叠至溢出操作。

页面/卡片/一组信息都能够呈现一个主题，主题的描述可以抽象为三个区域：

Header：主题的标题和摘要信息内容区的导航等
Body：具体内容
Footer：主题的补充信息和工具栏等
将按钮区放置在不同的区域，有不同的含义：见右图。

也存在一些特殊情况，将“完成”主题类的动作放在 Header 区。例如，编辑器中为了最大化编辑空间，将“完成”类动作放到了右上角

每次修改完成后，列出各按钮控件被定义为什么控件了；