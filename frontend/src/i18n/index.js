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
      info: '提示'
    },
    // 登录页面
    login: {
      title: 'LogTool 故障码管理系统',
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
      logout: '退出登录'
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
      time: '时间',
      user: '用户',
      details: '详情'
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
      info: 'Info'
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
      logout: 'Logout'
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
      time: 'Time',
      user: 'User',
      details: 'Details'
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

const i18n = createI18n({
  locale: localStorage.getItem('language') || 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages
})

export default i18n 