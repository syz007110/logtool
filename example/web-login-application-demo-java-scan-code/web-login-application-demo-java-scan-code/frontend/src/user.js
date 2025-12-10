function getQueryParam(name) {
    const url = new URL(window.location.href);
    return url.searchParams.get(name) || '';
}

async function fetchUserInfo(code) {
    try {
        const resp = await fetch(`http://localhost:8080/api/auth/code?authCode=${encodeURIComponent(code)}`);
        if (!resp.ok) throw new Error('请求失败');
        const data = await resp.json();
        document.getElementById('user-nick').textContent = data.nick || '-';
        document.getElementById('user-phone').textContent = data.phone || '-';
        document.getElementById('user-unionid').textContent = data.unionId || '-';
        document.getElementById('user-statecode').textContent = data.stateCode || '-';
    } catch (e) {
        document.getElementById('user-nick').textContent = '获取失败';
        document.getElementById('user-phone').textContent = '-';
        document.getElementById('user-unionid').textContent = '-';
        document.getElementById('user-statecode').textContent = '-';
        console.error(e);
    }
}

const code = getQueryParam('code');
if (code) {
    fetchUserInfo(code);
} else {
    document.getElementById('user-nick').textContent = '无code参数';
} 