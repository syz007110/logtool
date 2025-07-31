import { createI18n } from 'vue-i18n'

const messages = {
  'zh-CN': {
    // 通用
    common: {
      confirm: '确认',
      cancel: '取消',
      save: '保存',
      delete: '删除',
      edit: '编辑',
      add: '添加',
      search: '搜索',
      reset: '重置',
      export: '导出',
      import: '导入',
      loading: '加载中...',
      success: '操作成功',
      error: '操作失败',
      warning: '警告',
      info: '提示',
      refresh: '刷新',
      operation: '操作'
    },
    // 登录页面
    login: {
      title: '故障码管理工具',
      username: '用户名',
      password: '密码',
      login: '登录',
      register: '注册',
      forgotPassword: '忘记密码？'
    },
    // 注册页面
    register: {
      title: '用户注册',
      username: '用户名',
      email: '邮箱',
      password: '密码',
      confirmPassword: '确认密码',
      register: '注册',
      backToLogin: '返回登录',
      registerSuccess: '注册成功',
      registerFailed: '注册失败'
    },
    // 忘记密码
    forgotPassword: {
      title: '忘记密码',
      email: '邮箱',
      submit: '提交',
      backToLogin: '返回登录',
      submitSuccess: '重置邮件已发送',
      submitFailed: '提交失败'
    },
    // 导航
    nav: {
      dashboard: '首页',
      errorCodes: '故障码管理',
      logs: '日志解析',
      account: '账户管理',
      history: '历史记录',
      logout: '退出登录',
      profile: '个人信息'
    },
    // 故障码管理
    errorCodes: {
      title: '故障码管理',
      code: '故障码',
      name: '名称',
      description: '描述',
      solution: '解决方案',
      category: '分类',
      severity: '严重程度',
      addErrorCode: '添加故障码',
      editErrorCode: '编辑故障码',
      deleteErrorCode: '删除故障码',
      exportXML: '导出XML',
      searchPlaceholder: '搜索故障码...'
    },
    // 多语言故障码管理
    i18nErrorCodes: {
      title: '多语言故障码管理',
      addContent: '添加多语言内容',
      batchImport: '批量导入',
      exportXML: '导出XML',
      subsystem: '子系统',
      selectSubsystem: '请选择子系统',
      errorCode: '故障码',
      inputErrorCode: '输入故障码',
      language: '语言',
      selectLanguage: '选择语言',
      all: '全部',
      shortMessage: '精简的提示信息',
      userHint: '提示信息',
      operation: '操作信息',
      edit: '编辑',
      delete: '删除',
      search: '搜索',
      reset: '重置',
      subsystemNumber: '子系统号',
      addDialogTitle: '添加多语言内容',
      editDialogTitle: '编辑多语言内容',
      batchImportTitle: '批量导入多语言内容',
      csvUpload: 'CSV文件上传',
      selectFile: '选择文件',
      uploadImport: '上传导入',
      importSuccess: '导入成功',
      importFailed: '导入失败',
      noData: '暂无数据',
      confirmDelete: '确认删除',
      deleteConfirmText: '确定要删除这条多语言内容吗？',
      deleteSuccess: '删除成功',
      deleteFailed: '删除失败',
      saveSuccess: '保存成功',
      saveFailed: '保存失败',
      exportDialogTitle: '导出多语言XML',
      selectLanguages: '选择语言',
      selectAtLeastOne: '请至少选择一种语言',
      exportSuccess: '导出成功',
      multiLanguageExportSuccess: '多语言导出成功',
      exportFailed: '导出失败'
    },
    // 日志管理
    logs: {
      title: '日志解析',
      upload: '上传日志',
      parse: '解析日志',
      download: '下载日志',
      delete: '删除日志',
      filename: '文件名',
      size: '文件大小',
      status: '状态',
      uploadTime: '上传时间',
      parseTime: '解析时间',
      uploadSuccess: '上传成功',
      parseSuccess: '解析成功',
      downloadSuccess: '下载成功'
    },
    // 账户管理
    account: {
      title: '账户信息',
      profile: '个人信息',
      changePassword: '修改密码',
      oldPassword: '原密码',
      newPassword: '新密码',
      confirmPassword: '确认密码',
      updateSuccess: '更新成功',
      updateFailed: '更新失败'
    },
    // 历史记录
    history: {
      title: '历史记录',
      operation: '操作',
      description: '描述',
      time: '时间',
      user: '用户',
      status: '状态',
      details: '详情',
      view: '查看',
      ip: 'IP地址',
      userAgent: '用户代理',
      moreDetails: '详细信息',
      statusSuccess: '成功',
      statusFailed: '失败',
      statusPending: '进行中'
    },
    // 用户管理
    users: {
      title: '用户管理',
      username: '用户名',
      email: '邮箱',
      role: '角色',
      status: '状态',
      createTime: '创建时间',
      addUser: '添加用户',
      editUser: '编辑用户',
      deleteUser: '删除用户',
      assignRole: '分配角色'
    },
    // 角色管理
    roles: {
      title: '角色管理',
      name: '角色名称',
      description: '角色描述',
      permissions: '权限',
      addRole: '添加角色',
      editRole: '编辑角色',
      deleteRole: '删除角色'
    }
  },
  'en-US': {
    // Common
    common: {
      confirm: 'Confirm',
      cancel: 'Cancel',
      save: 'Save',
      delete: 'Delete',
      edit: 'Edit',
      add: 'Add',
      search: 'Search',
      reset: 'Reset',
      export: 'Export',
      import: 'Import',
      loading: 'Loading...',
      success: 'Operation successful',
      error: 'Operation failed',
      warning: 'Warning',
      info: 'Info',
      refresh: 'Refresh',
      operation: 'Operation'
    },
    // Login page
    login: {
      title: 'LogTool Error Code Management System',
      username: 'Username',
      password: 'Password',
      login: 'Login',
      register: 'Register',
      forgotPassword: 'Forgot password?'
    },
    // Register page
    register: {
      title: 'User Registration',
      username: 'Username',
      email: 'Email',
      password: 'Password',
      confirmPassword: 'Confirm Password',
      register: 'Register',
      backToLogin: 'Back to Login',
      registerSuccess: 'Registration successful',
      registerFailed: 'Registration failed'
    },
    // Forgot password
    forgotPassword: {
      title: 'Forgot Password',
      email: 'Email',
      submit: 'Submit',
      backToLogin: 'Back to Login',
      submitSuccess: 'Reset email sent',
      submitFailed: 'Submit failed'
    },
    // Navigation
    nav: {
      dashboard: 'Dashboard',
      errorCodes: 'Error Codes',
      logs: 'Log Analysis',
      account: 'Account',
      history: 'History',
      logout: 'Logout',
      profile: 'Profile'
    },
    // Error codes management
    errorCodes: {
      title: 'Error Code Management',
      code: 'Error Code',
      name: 'Name',
      description: 'Description',
      solution: 'Solution',
      category: 'Category',
      severity: 'Severity',
      addErrorCode: 'Add Error Code',
      editErrorCode: 'Edit Error Code',
      deleteErrorCode: 'Delete Error Code',
      exportXML: 'Export XML',
      searchPlaceholder: 'Search error codes...'
    },
    // I18n Error Codes management
    i18nErrorCodes: {
      title: 'I18n Error Code Management',
      addContent: 'Add I18n Content',
      batchImport: 'Batch Import',
      exportXML: 'Export XML',
      subsystem: 'Subsystem',
      selectSubsystem: 'Please select subsystem',
      errorCode: 'Error Code',
      inputErrorCode: 'Input error code',
      language: 'Language',
      selectLanguage: 'Select language',
      all: 'All',
      shortMessage: 'Short Message',
      userHint: 'User Hint',
      operation: 'Operation',
      edit: 'Edit',
      delete: 'Delete',
      search: 'Search',
      reset: 'Reset',
      subsystemNumber: 'Subsystem Number',
      addDialogTitle: 'Add I18n Content',
      editDialogTitle: 'Edit I18n Content',
      batchImportTitle: 'Batch Import I18n Content',
      csvUpload: 'CSV File Upload',
      selectFile: 'Select File',
      uploadImport: 'Upload & Import',
      importSuccess: 'Import successful',
      importFailed: 'Import failed',
      noData: 'No data',
      confirmDelete: 'Confirm Delete',
      deleteConfirmText: 'Are you sure to delete this i18n content?',
      deleteSuccess: 'Delete successful',
      deleteFailed: 'Delete failed',
      saveSuccess: 'Save successful',
      saveFailed: 'Save failed',
      exportDialogTitle: 'Export Multi-language XML',
      selectLanguages: 'Select Languages',
      selectAtLeastOne: 'Please select at least one language',
      exportSuccess: 'Export successful',
      multiLanguageExportSuccess: 'Multi-language export successful',
      exportFailed: 'Export failed'
    },
    // Log management
    logs: {
      title: 'Log Analysis',
      upload: 'Upload Log',
      parse: 'Parse Log',
      download: 'Download Log',
      delete: 'Delete Log',
      filename: 'Filename',
      size: 'File Size',
      status: 'Status',
      uploadTime: 'Upload Time',
      parseTime: 'Parse Time',
      uploadSuccess: 'Upload successful',
      parseSuccess: 'Parse successful',
      downloadSuccess: 'Download successful'
    },
    // Account management
    account: {
      title: 'Account Information',
      profile: 'Profile',
      changePassword: 'Change Password',
      oldPassword: 'Old Password',
      newPassword: 'New Password',
      confirmPassword: 'Confirm Password',
      updateSuccess: 'Update successful',
      updateFailed: 'Update failed'
    },
    // History
    history: {
      title: 'History',
      operation: 'Operation',
      description: 'Description',
      time: 'Time',
      user: 'User',
      status: 'Status',
      details: 'Details',
      view: 'View',
      ip: 'IP Address',
      userAgent: 'User Agent',
      moreDetails: 'More Details',
      statusSuccess: 'Success',
      statusFailed: 'Failed',
      statusPending: 'Pending'
    },
    // User management
    users: {
      title: 'User Management',
      username: 'Username',
      email: 'Email',
      role: 'Role',
      status: 'Status',
      createTime: 'Create Time',
      addUser: 'Add User',
      editUser: 'Edit User',
      deleteUser: 'Delete User',
      assignRole: 'Assign Role'
    },
    // Role management
    roles: {
      title: 'Role Management',
      name: 'Role Name',
      description: 'Role Description',
      permissions: 'Permissions',
      addRole: 'Add Role',
      editRole: 'Edit Role',
      deleteRole: 'Delete Role'
    }
  }
}

// 获取语言设置（固定为中文）
const getStoredLocale = () => {
  return 'zh-CN'
}

const i18n = createI18n({
  legacy: false, // 使用 Vue 3 的 Composition API 模式
  globalInjection: true, // 全局注入 $t 函数
  locale: getStoredLocale(),
  fallbackLocale: 'zh-CN',
  messages,
  silentTranslationWarn: true, // 静默翻译警告
  missingWarn: false, // 禁用缺失翻译警告
  fallbackWarn: false // 禁用回退警告
})

export default i18n 