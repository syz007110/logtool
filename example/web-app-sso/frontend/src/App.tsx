import { Button, Card, Descriptions, Tag } from 'antd';
import { DingtalkOutlined, UserOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { useState } from 'react';
import './App.css';
import * as dd from 'dingtalk-jsapi';

interface UserInfo {
  name: string;
  userid: string;
  unionid: string;
  sys: boolean;
  sys_level: number;
}

// 声明环境变量类型
declare global {
  
  namespace NodeJS {
    interface ProcessEnv {
      CLIENT_ID: string;
    }
  }
}

function App() {
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [showUserInfo, setShowUserInfo] = useState(false);

  const getRoleInfo = (level: number) => {
    switch (level) {
      case 1: return { text: '主管理员', color: 'red' };
      case 2: return { text: '子管理员', color: 'orange' };
      case 100: return { text: '老板', color: 'gold' };
      default: return { text: '普通员工', color: 'blue' };
    }
  };

  const handleLogin = async () => {
    try {
      setLoading(true);
      const urlParams = new URLSearchParams(window.location.search);
      const corpId = urlParams.get('corpid');
      const clientId = import.meta.env.VITE_CLIENT_ID;
      
      if (!corpId || !clientId) {
        console.error('缺少必要参数');
        return;
      }

      dd.requestAuthCode({
        corpId,
        clientId,
        onSuccess: async (result: { code: string }) => {
          try {
            const response = await fetch(`/api/getUserInfo?code=${result.code}&corpId=${corpId}`);
            const data = await response.json();
            setUserInfo(data.result);
            setShowUserInfo(true);
          } catch (error) {
            console.error('获取用户信息失败：', error);
          } finally {
            setLoading(false);
          }
        },
        onFail: (err: any) => {
          console.error('获取授权码失败：', err);
          setLoading(false);
        }
      });
    } catch (error) {
      console.error('登录失败：', error);
      setLoading(false);
    }
  };

  return (
    <div className="app-container">
      <div className="login-container">
        {showUserInfo && userInfo ? (
          <Card 
            title={
              <div className="user-card-title">
                <UserOutlined className="user-icon" />
                <span>用户信息</span>
              </div>
            }
            className="user-info-card"
            extra={
              <Button 
                icon={<ArrowLeftOutlined />}
                onClick={() => setShowUserInfo(false)}
                className="back-button"
              >
                返回
              </Button>
            }
          >
            <Descriptions column={1}>
              <Descriptions.Item label="姓名">
                <span className="user-name">{userInfo.name}</span>
              </Descriptions.Item>
              <Descriptions.Item label="用户ID">{userInfo.userid}</Descriptions.Item>
              <Descriptions.Item label="UnionID">{userInfo.unionid}</Descriptions.Item>
              <Descriptions.Item label="角色">
                {(() => {
                  const roleInfo = getRoleInfo(userInfo.sys_level);
                  return <Tag color={roleInfo.color}>{roleInfo.text}</Tag>;
                })()}
              </Descriptions.Item>
            </Descriptions>
            <Button 
              type="primary" 
              size="large"
              icon={<DingtalkOutlined />}
              onClick={handleLogin}
              loading={loading}
              style={{ marginTop: 24 }}
            >
              刷新信息
            </Button>
          </Card>
        ) : (
          <>
            <h1 className="login-title">欢迎使用钉钉应用</h1>
            <Button 
              type="primary" 
              size="large"
              icon={<DingtalkOutlined />}
              onClick={handleLogin}
              loading={loading}
            >
              登录
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

export default App;
