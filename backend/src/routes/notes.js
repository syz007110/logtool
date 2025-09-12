const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const { listNotes, createNote, updateNote, deleteNote } = require('../controllers/logNoteController');

// 获取某日志条目的备注（分页）
router.get('/log-entries/:logEntryId/notes', auth, listNotes);

// 创建备注
router.post('/log-entries/:logEntryId/notes', auth, createNote);

// 更新备注
router.put('/notes/:id', auth, updateNote);

// 删除备注
router.delete('/notes/:id', auth, deleteNote);

module.exports = router;


