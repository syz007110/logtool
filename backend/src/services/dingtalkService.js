const https = require('https')
const querystring = require('querystring')

function getJSON (url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        try {
          resolve(JSON.parse(data))
        } catch (err) {
          reject(err)
        }
      })
    }).on('error', reject)
  })
}

function postJSON (url, body = {}) {
  const payload = JSON.stringify(body)
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, res => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        try {
          resolve(JSON.parse(data))
        } catch (err) {
          reject(err)
        }
      })
    })
    req.on('error', reject)
    req.write(payload)
    req.end()
  })
}

async function getInternalAccessToken () {
  const appKey = process.env.DINGTALK_APP_KEY
  const appSecret = process.env.DINGTALK_APP_SECRET
  if (!appKey || !appSecret) {
    throw new Error('DingTalk appKey/appSecret missing')
  }
  const query = querystring.stringify({ appkey: appKey, appsecret: appSecret })
  const url = `https://oapi.dingtalk.com/gettoken?${query}`
  const res = await getJSON(url)
  if (res.errcode !== 0) {
    throw new Error(res.errmsg || 'Failed to get access token')
  }
  return res.access_token
}

async function getUserInfoByAuthCode (authCode) {
  if (!authCode) throw new Error('authCode required')
  const token = await getInternalAccessToken()
  const url = `https://oapi.dingtalk.com/topapi/v2/user/getuserinfo?access_token=${token}`
  const res = await postJSON(url, { code: authCode })
  if (res.errcode !== 0) {
    throw new Error(res.errmsg || 'Failed to exchange authCode')
  }
  const result = res.result || {}
  return {
    unionId: result.unionid || null,
    userId: result.userid || null,
    nick: result.name || '',
    mobile: result.mobile || null
  }
}

async function getSnsAccessToken () {
  const appId = process.env.DINGTALK_APP_ID
  // 网站应用的 ClientSecret：优先单独配置 DINGTALK_WEB_APP_SECRET，若未配置则回落到 DINGTALK_APP_SECRET
  const appSecret = process.env.DINGTALK_WEB_APP_SECRET || process.env.DINGTALK_APP_SECRET
  if (!appId || !appSecret) {
    throw new Error('DingTalk appId/appSecret missing')
  }
  const query = querystring.stringify({ appid: appId, appsecret: appSecret })
  const url = `https://oapi.dingtalk.com/sns/gettoken?${query}`
  const res = await getJSON(url)
  if (!res.access_token) {
    throw new Error(res.errmsg || 'Failed to get sns access token')
  }
  return res.access_token
}

async function getUserInfoByTmpCode (tmpCode) {
  if (!tmpCode) throw new Error('tmpCode required')
  const token = await getSnsAccessToken()
  const url = `https://oapi.dingtalk.com/sns/getuserinfo_bycode?access_token=${token}`
  const res = await postJSON(url, { tmp_auth_code: tmpCode })
  if (!res.user_info) {
    throw new Error(res.errmsg || 'Failed to exchange tmp_auth_code')
  }
  const info = res.user_info
  return {
    unionId: info.unionid || null,
    userId: info.dingId || null,
    nick: info.nick || '',
    mobile: null
  }
}

async function exchangeUser (code) {
  try {
    return await getUserInfoByAuthCode(code)
  } catch (err) {
    // fallback to sns tmp auth code (PC扫码)
    return await getUserInfoByTmpCode(code)
  }
}

module.exports = {
  exchangeUser
}

