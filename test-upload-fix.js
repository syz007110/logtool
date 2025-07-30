const axios = require('axios');

async function testUpload() {
  try {
    console.log('测试上传修复...');
    
    // 首先登录获取token
    const loginResponse = await axios.post('http://localhost:3000/api/auth/login', {
      username: 'admin',
      password: 'admin123'
    });
    
    const token = loginResponse.data.token;
    console.log('登录成功，获取到token');
    
    // 测试上传
    const formData = new FormData();
    formData.append('files', 'test file content', 'test.medbot');
    formData.append('decryptKey', '00-01-05-77-6a-09');
    formData.append('deviceId', 'TEST-01');
    
    const uploadResponse = await axios.post('http://localhost:3000/api/logs/upload', formData, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'multipart/form-data'
      }
    });
    
    console.log('上传成功:', uploadResponse.data);
  } catch (error) {
    console.error('测试失败:', error.response?.data || error.message);
  }
}

testUpload(); 