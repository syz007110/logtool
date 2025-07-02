const User = require('../models/user');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const register = async (req, res) => {
  try {
    const { username, password, email } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: '用户名和密码不能为空' });
    }
    const exist = await User.findOne({ where: { username } });
    if (exist) {
      return res.status(409).json({ message: '用户名已存在' });
    }
    const password_hash = await bcrypt.hash(password, 10);
    const user = await User.create({ username, password_hash, email });
    res.status(201).json({ message: '注册成功', user: { id: user.id, username: user.username, email: user.email } });
  } catch (err) {
    res.status(500).json({ message: '注册失败', error: err.message });
  }
};

const login = async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ where: { username } });
    if (!user) {
      return res.status(401).json({ message: '用户名或密码错误' });
    }
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ message: '用户名或密码错误' });
    }
    const token = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '12h' });
    res.json({ message: '登录成功', token, user: { id: user.id, username: user.username, email: user.email } });
  } catch (err) {
    res.status(500).json({ message: '登录失败', error: err.message });
  }
};

module.exports = { register, login }; 