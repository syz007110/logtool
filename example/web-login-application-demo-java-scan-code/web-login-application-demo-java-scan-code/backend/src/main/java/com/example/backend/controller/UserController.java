package com.example.backend.controller;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.alibaba.fastjson.JSONObject;
import com.aliyun.dingtalkcontact_1_0.Client;
import com.aliyun.dingtalkcontact_1_0.models.GetUserHeaders;
import com.aliyun.dingtalkcontact_1_0.models.GetUserResponse;
import com.aliyun.dingtalkoauth2_1_0.models.GetUserTokenRequest;
import com.aliyun.dingtalkoauth2_1_0.models.GetUserTokenResponse;
import com.aliyun.tea.TeaException;
import com.aliyun.teaopenapi.models.Config;
import com.aliyun.teautil.models.RuntimeOptions;

/**
 * 用户相关接口，主要实现钉钉OAuth2登录和用户信息获取。
 */
@CrossOrigin(origins = "*")
@RestController
@RequestMapping("/api")
public class UserController {

    @Value("${app.clientId}")
    private String clientId;
    @Value("${app.clientSecret}")
    private String clientSecret;

    /**
     * 通过钉钉授权码获取用户信息
     * @param authCode 授权码
     * @return 用户信息或错误信息
     */
    @GetMapping("/auth/code")
    public ResponseEntity<JSONObject> getUsers(@RequestParam String authCode) {
        ResponseEntity<String> tokenResp = getAccessToken(authCode);
        if (!tokenResp.getStatusCode().is2xxSuccessful()) {
            JSONObject error = new JSONObject();
            error.put("error", tokenResp.getBody());
            return ResponseEntity.status(tokenResp.getStatusCode()).body(error);
        }
        String accessToken = tokenResp.getBody();
        ResponseEntity<JSONObject> userInfoResp = getUserInfo(accessToken);
        if (!userInfoResp.getStatusCode().is2xxSuccessful()) {
            return userInfoResp;
        }
        return userInfoResp;
    }

    /**
     * 获取钉钉accessToken
     * @param authCode 授权码
     * @return accessToken或错误信息
     */
    public ResponseEntity<String> getAccessToken(String authCode) {
        Config config = new Config();
        config.protocol = "https";
        config.regionId = "central";
        try {
            com.aliyun.dingtalkoauth2_1_0.Client client = new com.aliyun.dingtalkoauth2_1_0.Client(config);
            GetUserTokenRequest getUserTokenRequest = new GetUserTokenRequest()
                .setClientId(clientId)
                .setClientSecret(clientSecret)
                .setCode(authCode)
                .setGrantType("authorization_code");
            GetUserTokenResponse getUserTokenResponse = client.getUserToken(getUserTokenRequest);
            return ResponseEntity.ok(getUserTokenResponse.getBody().getAccessToken());
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body("获取accessToken失败: " + e.getMessage());
        }
    }

    /**
     * 获取钉钉用户信息
     * @param accessToken accessToken
     * @return 用户信息或错误信息
     */
    public ResponseEntity<JSONObject> getUserInfo(String accessToken) {
        Config config = new Config();
        config.protocol = "https";
        config.regionId = "central";
        Client client;
        try {
            client = new Client(config);
        } catch (Exception e) {
            JSONObject error = new JSONObject();
            error.put("error", "初始化钉钉Client失败: " + e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(error);
        }
        GetUserHeaders getUserHeaders = new GetUserHeaders();
        getUserHeaders.xAcsDingtalkAccessToken = accessToken;
        try {
            GetUserResponse resp = client.getUserWithOptions("me", getUserHeaders, new RuntimeOptions());
            JSONObject user = new JSONObject();
            user.put("unionId", resp.getBody().getUnionId());
            user.put("phone", resp.getBody().getMobile());
            user.put("nick", resp.getBody().getNick());
            user.put("stateCode", resp.getBody().getStateCode());
            return ResponseEntity.ok(user);
        } catch (TeaException err) {
            JSONObject error = new JSONObject();
            error.put("error", "钉钉接口异常: " + err.getMessage());
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(error);
        } catch (Exception _err) {
            JSONObject error = new JSONObject();
            error.put("error", "未知异常: " + _err.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(error);
        }
    }
}
