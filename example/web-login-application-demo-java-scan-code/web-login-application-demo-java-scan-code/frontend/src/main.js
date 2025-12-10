
// 钉钉扫码登录二维码初始化
function initDingLogin() {
    if (window.DTFrameLogin) {
        const corpId = "ding42xxxx64d335";
        const clientId = "ding1xxxxf8qkqc";
        window.DTFrameLogin(
            {
                id: 'self_defined_element',
                width: 300,
                height: 300,
            },
            {
                // 注意：redirect_uri 需为完整URL，扫码后钉钉会带code跳转到这里
                redirect_uri: encodeURIComponent('http://localhost:5173/user.html'),
                client_id: clientId,
                scope: 'openid corpid',
                response_type: 'code',
                state: '1',
                prompt: 'consent',
                corpId: corpId,
            },
            (loginResult) => {
                const {redirectUrl, authCode, state} = loginResult;
                // 这里可以直接进行重定向
                window.location.href = redirectUrl;
                console.log(authCode);
            },
            (errorMsg) => {
                // 这里一般需要展示登录失败的具体原因
                alert(`Login Error: ${errorMsg}`);
            },
        );
    } else {
        setTimeout(initDingLogin, 100);
    }
}
initDingLogin(); 