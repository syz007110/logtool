const { Op } = require('sequelize');
const LogNote = require('../models/log_note');
const LogEntry = require('../models/log_entry');
const UserRole = require('../models/user_role');
const Role = require('../models/role');
const { hasPermission } = require('../config/roles');

// 工具：获取用户是否为admin
async function isAdmin(userId) {
  const roles = await UserRole.findAll({
    where: { user_id: userId },
    include: [{ model: Role, as: 'Role', attributes: ['id', 'name'] }]
  });
  return hasPermission(roles, 'user:update');
}

// 列出某日志条目的备注（分页，按创建时间升序）
async function listNotes(req, res) {
  try {
    const logEntryId = parseInt(req.params.logEntryId, 10);
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize || '10', 10), 1), 50);
    if (!Number.isFinite(logEntryId)) {
      return res.status(400).json({ message: 'logEntryId 无效' });
    }

    const { count, rows } = await LogNote.findAndCountAll({
      where: { log_entry_id: logEntryId },
      order: [['created_at', 'ASC']],
      offset: (page - 1) * pageSize,
      limit: pageSize,
      include: [{ model: require('../models/user'), as: 'user', attributes: ['id', 'username'] }]
    });

    res.json({
      total: count,
      page,
      pageSize,
      items: rows.map(n => ({
        id: n.id,
        log_entry_id: n.log_entry_id,
        user_id: n.user_id,
        username: n.user ? n.user.username : '未知用户',
        content: n.content,
        created_at: n.created_at,
        updated_at: n.updated_at,
        created_by: n.created_by
      }))
    });
  } catch (error) {
    console.error('listNotes error:', error);
    res.status(500).json({ message: '获取备注失败', error: error.message });
  }
}

// 创建备注（管理员/专家/普通用户都可创建）
async function createNote(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: '未登录' });

    const { content } = req.body;
    const logEntryId = parseInt(req.params.logEntryId, 10);
    if (!content || content.trim().length === 0 || content.length > 50) {
      return res.status(400).json({ message: '备注内容不能为空且不超过50字符' });
    }
    if (!Number.isFinite(logEntryId)) {
      return res.status(400).json({ message: 'logEntryId 无效' });
    }

    // 确认 logEntry 存在
    const entry = await LogEntry.findByPk(logEntryId);
    if (!entry) return res.status(404).json({ message: '日志条目不存在' });

    // 推断创建者角色显示
    const roles = await UserRole.findAll({ where: { user_id: userId }, include: [{ model: Role, as: 'Role' }] });
    let createdBy = 'user';
    for (const ur of roles) {
      const name = (ur.Role?.name || '').toLowerCase();
      if (name === 'admin' || ur.Role?.id === 1) { createdBy = 'admin'; break; }
      if (name === 'expert' || ur.Role?.id === 2 || name === '工程师' || name === '专家') { createdBy = 'expert'; }
    }

    const note = await LogNote.create({
      log_entry_id: logEntryId,
      user_id: userId,
      content: content.trim(),
      created_at: new Date(),
      updated_at: null,
      created_by: createdBy
    });

    res.status(201).json({ id: note.id });
  } catch (error) {
    console.error('createNote error:', error);
    res.status(500).json({ message: '创建备注失败', error: error.message });
  }
}

// 更新备注（管理员可改任何；专家/普通用户仅可改自己）
async function updateNote(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: '未登录' });
    const noteId = parseInt(req.params.id, 10);
    const { content } = req.body;
    if (!content || content.trim().length === 0 || content.length > 50) {
      return res.status(400).json({ message: '备注内容不能为空且不超过50字符' });
    }

    const note = await LogNote.findByPk(noteId);
    if (!note) return res.status(404).json({ message: '备注不存在' });

    const admin = await isAdmin(userId);
    if (!admin && note.user_id !== userId) {
      return res.status(403).json({ message: '无权修改他人备注' });
    }

    await LogNote.update({ content: content.trim(), updated_at: new Date() }, { where: { id: noteId } });
    res.json({ message: '更新成功' });
  } catch (error) {
    console.error('updateNote error:', error);
    res.status(500).json({ message: '更新备注失败', error: error.message });
  }
}

// 删除备注（管理员可删任何；专家/普通用户仅可删自己）
async function deleteNote(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: '未登录' });
    const noteId = parseInt(req.params.id, 10);

    const note = await LogNote.findByPk(noteId);
    if (!note) return res.status(404).json({ message: '备注不存在' });

    const admin = await isAdmin(userId);
    if (!admin && note.user_id !== userId) {
      return res.status(403).json({ message: '无权删除他人备注' });
    }

    await LogNote.destroy({ where: { id: noteId } });
    res.json({ message: '删除成功' });
  } catch (error) {
    console.error('deleteNote error:', error);
    res.status(500).json({ message: '删除备注失败', error: error.message });
  }
}

module.exports = {
  listNotes,
  createNote,
  updateNote,
  deleteNote
};


