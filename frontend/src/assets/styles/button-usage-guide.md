# 按钮样式使用指南

基于设计token的按钮组件样式系统，提供一致性和可维护性的按钮设计。

## 设计Token定义

### 主要按钮 (Primary Button)
- **背景色**: `--bg-brand-solid` (蓝色实心背景)
- **悬浮色**: `--bg-brand-solid-hover` (深蓝色悬浮背景)
- **文字色**: `--text-white` (白色文字)
- **边框色**: 与背景色相同

### 次要按钮 (Secondary Button)
- **背景色**: `--bg-primary` (白色背景)
- **悬浮色**: `--bg-primary-hover` (浅灰色悬浮背景)
- **文字色**: `--text-primary` (深色文字)
- **边框色**: `--border-secondary` (浅灰色边框)

### 第三级按钮 (Tertiary Button)
- **背景色**: `transparent` (透明背景)
- **悬浮色**: `--bg-primary-hover` (浅灰色悬浮背景)
- **文字色**: `--text-primary` (深色文字)
- **边框色**: `--border-primary` (深灰色边框)

### 幽灵按钮 (Ghost Button)
- **背景色**: `transparent` (透明背景)
- **悬浮色**: `--bg-primary-hover` (浅灰色悬浮背景)
- **文字色**: `--text-secondary` (次要文字色)
- **边框色**: `transparent` (无边框)

### 文本按钮 (Text Button)
- **背景色**: `transparent` (透明背景)
- **悬浮色**: `--bg-primary-hover` (浅灰色悬浮背景)
- **文字色**: `--text-brand-primary` (品牌色文字)
- **边框色**: `transparent` (无边框)

### 危险按钮 (Danger Button)
- **背景色**: `--bg-error-secondary` (红色背景)
- **悬浮色**: `--bg-error-secondary-hover` (深红色悬浮背景)
- **文字色**: `--text-white` (白色文字)
- **边框色**: `--bg-error-secondary` (红色边框)

### 成功按钮 (Success Button)
- **背景色**: `--bg-success-secondary` (绿色背景)
- **悬浮色**: `--bg-success-secondary-hover` (深绿色悬浮背景)
- **文字色**: `--text-white` (白色文字)
- **边框色**: `--bg-success-secondary` (绿色边框)

## 基础用法

### HTML 结构
```html
<!-- 主要按钮 -->
<button class="btn-primary">确认</button>
<button class="btn-primary" disabled>确认</button>

<!-- 次要按钮 -->
<button class="btn-secondary">取消</button>
<button class="btn-secondary" disabled>取消</button>

<!-- 第三级按钮（线框按钮） -->
<button class="btn-tertiary">编辑</button>
<button class="btn-tertiary" disabled>编辑</button>

<!-- 幽灵按钮（无边框） -->
<button class="btn-ghost">更多</button>
<button class="btn-ghost" disabled>更多</button>

<!-- 文本按钮 -->
<button class="btn-text">链接</button>
<button class="btn-text" disabled>链接</button>

<!-- 危险按钮 -->
<button class="btn-danger">删除</button>
<button class="btn-danger" disabled>删除</button>

<!-- 成功按钮 -->
<button class="btn-success">保存</button>
<button class="btn-success" disabled>保存</button>
```

### Vue 组件中使用
```vue
<template>
  <div class="action-buttons">
    <!-- 主要操作 -->
    <button class="btn-primary" @click="handleConfirm">
      <i class="fas fa-check"></i>
      确认操作
    </button>
    
    <!-- 次要操作 -->
    <button class="btn-secondary" @click="handleCancel">
      <i class="fas fa-times"></i>
      取消操作
    </button>
    
    <!-- 第三级操作（线框按钮） -->
    <button class="btn-tertiary" @click="handleEdit">
      <i class="fas fa-edit"></i>
      编辑
    </button>
    
    <!-- 辅助操作（幽灵按钮） -->
    <button class="btn-ghost" @click="handleMore">
      <i class="fas fa-ellipsis-h"></i>
      更多
    </button>
    
    <!-- 危险操作 -->
    <button class="btn-danger" @click="handleDelete">
      <i class="fas fa-trash"></i>
      删除
    </button>
  </div>
</template>
```

## 尺寸变体

### 小尺寸按钮
```html
<button class="btn-primary btn-sm">小按钮</button>
<button class="btn-secondary btn-sm">小按钮</button>
<button class="btn-tertiary btn-sm">小按钮</button>
<button class="btn-ghost btn-sm">小按钮</button>
<button class="btn-text btn-sm">小按钮</button>
<button class="btn-danger btn-sm">小按钮</button>
<button class="btn-success btn-sm">小按钮</button>
```

### 大尺寸按钮
```html
<button class="btn-primary btn-lg">大按钮</button>
<button class="btn-secondary btn-lg">大按钮</button>
<button class="btn-tertiary btn-lg">大按钮</button>
<button class="btn-ghost btn-lg">大按钮</button>
<button class="btn-text btn-lg">大按钮</button>
<button class="btn-danger btn-lg">大按钮</button>
<button class="btn-success btn-lg">大按钮</button>
```

## 图标按钮

### 带图标的按钮
```html
<button class="btn-primary">
  <i class="fas fa-save"></i>
  保存
</button>
```

### 纯图标按钮
```html
<button class="btn-primary btn-icon">
  <i class="fas fa-plus"></i>
</button>

<button class="btn-primary btn-icon btn-sm">
  <i class="fas fa-edit"></i>
</button>
```

## 加载状态

```html
<button class="btn-primary btn-loading">处理中...</button>
```

## 按钮组

```html
<div class="btn-group">
  <button class="btn-primary">第一个</button>
  <button class="btn-primary">第二个</button>
  <button class="btn-primary">第三个</button>
</div>
```

## 按钮层次设计原则

### 视觉层次
1. **Primary（主要按钮）**：最重要的操作，使用品牌色背景
2. **Secondary（次要按钮）**：重要的操作，使用白色背景+边框
3. **Tertiary（第三级按钮）**：一般操作，使用透明背景+边框
4. **Ghost（幽灵按钮）**：辅助操作，使用透明背景+无边框
5. **Text（文本按钮）**：链接式操作，使用品牌色文字
6. **Danger（危险按钮）**：删除等危险操作，使用红色背景
7. **Success（成功按钮）**：保存等成功操作，使用绿色背景

### 使用建议
- **每个操作组只使用一个Primary按钮**
- **Secondary按钮用于重要的辅助操作**
- **Tertiary按钮用于一般操作，提供线框视觉**
- **Ghost按钮用于不重要的辅助操作**
- **Text按钮用于链接式操作**
- **Danger按钮用于删除等不可逆操作**
- **Success按钮用于保存等确认操作**

## 实际应用示例

### 在手术数据比对组件中
```vue
<template>
  <div class="action-buttons">
    <button class="btn-secondary" @click="visible = false">取消</button>
    <button class="btn-primary" @click="confirmOverride" :class="{ 'btn-loading': confirming }">
      确认覆盖
    </button>
  </div>
</template>
```

### 在日志管理页面中
```vue
<template>
  <div class="toolbar">
    <!-- 主要操作：上传日志 -->
    <button class="btn-primary btn-sm" @click="handleUpload">
      <i class="fas fa-upload"></i>
      上传日志
    </button>
    
    <!-- 次要操作：查看详情 -->
    <button class="btn-secondary btn-sm" @click="showDeviceDetail(row)">
      <i class="fas fa-list"></i>
      查看详情
    </button>
    
    <!-- 第三级操作：手术数据（线框按钮） -->
    <button class="btn-tertiary btn-sm" @click="openSurgeryDrawerForDevice(row)">
      <i class="fas fa-chart-line"></i>
      手术数据
    </button>
    
    <!-- 辅助操作：刷新（幽灵按钮） -->
    <button class="btn-ghost btn-sm btn-icon" @click="handleRefresh">
      <i class="fas fa-refresh"></i>
    </button>
    
    <!-- 危险操作：删除 -->
    <button class="btn-danger btn-sm" @click="handleDelete(row)">
      <i class="fas fa-trash"></i>
      删除
    </button>
  </div>
</template>
```

## 自定义样式

如果需要自定义按钮样式，建议通过CSS变量覆盖：

```css
/* 自定义主要按钮颜色 */
:root {
  --btn-primary-bg: var(--bg-success-secondary);
  --btn-primary-bg-hover: var(--bg-success-secondary-hover);
}

/* 或者创建新的按钮变体 */
.btn-success {
  background-color: var(--bg-success-secondary);
  color: var(--text-white);
  border: 1px solid var(--bg-success-secondary);
}

.btn-success:hover:not(:disabled) {
  background-color: var(--bg-success-secondary-hover);
  border-color: var(--bg-success-secondary-hover);
}
```

## 无障碍支持

所有按钮都包含：
- 键盘焦点指示器 (`:focus-visible`)
- 适当的对比度
- 禁用状态的视觉反馈
- 语义化的HTML结构

## 响应式设计

在移动设备上，按钮会自动调整：
- 最小触摸目标尺寸 (44px)
- 更大的字体和间距
- 优化的交互体验



可以学习按钮设计的网站：
https://ant.design/docs/spec/buttons-cn#%E6%8C%89%E9%92%AE%E5%8C%BA