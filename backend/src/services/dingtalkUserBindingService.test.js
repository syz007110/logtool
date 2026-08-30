const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  buildNormalizedIdentity,
  resolveOrBindDingtalkUser
} = require('./dingtalkUserBindingService');

function createUserModelStub(initialUsers = []) {
  const users = Array.isArray(initialUsers) ? initialUsers.map((item) => ({ ...item })) : [];
  let nextId = users.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;

  function attachSave(user) {
    user.save = async () => user;
    return user;
  }

  return {
    users,
    async findOne({ where = {} } = {}) {
      const [field, value] = Object.entries(where)[0] || [];
      if (!field) return null;
      const found = users.find((item) => item[field] === value);
      return found ? attachSave(found) : null;
    },
    async create(payload) {
      const created = attachSave({
        id: nextId++,
        ...payload
      });
      users.push(created);
      return created;
    }
  };
}

function createUserRoleModelStub(existingUserIds = []) {
  const roles = new Set(existingUserIds);
  return {
    async findOne({ where = {} } = {}) {
      return roles.has(where.user_id) ? { user_id: where.user_id } : null;
    },
    async create(payload) {
      roles.add(payload.user_id);
      return payload;
    }
  };
}

describe('dingtalkUserBindingService', () => {
  it('normalizes dingtalk message identity', () => {
    const identity = buildNormalizedIdentity({
      senderStaffId: ' staff_1 ',
      senderNick: ' 张三 '
    });

    assert.deepEqual(identity, {
      unionId: null,
      userId: 'staff_1',
      mobile: null,
      nick: '张三',
      corpId: null
    });
  });

  it('reuses existing bound user by dingtalk_userid and updates metadata', async () => {
    const UserModel = createUserModelStub([{
      id: 12,
      username: 'dd_old',
      dingtalk_unionid: null,
      dingtalk_userid: 'staff_12',
      dingtalk_mobile: null,
      dingtalk_nick: '旧昵称'
    }]);
    const UserRoleModel = createUserRoleModelStub([12]);

    const result = await resolveOrBindDingtalkUser({
      userId: 'staff_12',
      unionId: 'union_12',
      nick: '新昵称'
    }, {
      UserModel,
      UserRoleModel
    });

    assert.equal(result.created, false);
    assert.equal(result.user.id, 12);
    assert.equal(result.user.dingtalk_unionid, 'union_12');
    assert.equal(result.user.dingtalk_nick, '新昵称');
  });

  it('creates local user when no binding exists', async () => {
    const UserModel = createUserModelStub();
    const UserRoleModel = createUserRoleModelStub();

    const result = await resolveOrBindDingtalkUser({
      userId: 'staff_99',
      nick: '测试用户'
    }, {
      UserModel,
      UserRoleModel
    });

    assert.equal(result.created, true);
    assert.equal(result.user.id, 1);
    assert.equal(result.user.dingtalk_userid, 'staff_99');
    assert.equal(result.user.dingtalk_nick, '测试用户');
  });
});
