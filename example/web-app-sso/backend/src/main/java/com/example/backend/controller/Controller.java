package com.example.backend.controller;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.aliyun.dingtalkoauth2_1_0.models.GetTokenResponse;
import com.aliyun.tea.TeaException;
import com.dingtalk.api.DefaultDingTalkClient;
import com.dingtalk.api.DingTalkClient;
import com.dingtalk.api.request.OapiV2UserGetuserinfoRequest;
import com.dingtalk.api.response.OapiV2UserGetuserinfoResponse;
import com.taobao.api.ApiException;

@RestController
@RequestMapping("/api")
public class Controller {

    private static final Logger log = LoggerFactory.getLogger(Controller.class);

    @Value("${dingtalk.clientId}")
    private String clientId;
    @Value("${dingtalk.clientSecret}")
    private String clientSecret;

    @GetMapping("/getUserInfo")
    public ResponseEntity<?> getUserInfo(@RequestParam String code, @RequestParam String corpId) {
        DingTalkClient client = new DefaultDingTalkClient("https://oapi.dingtalk.com/topapi/v2/user/getuserinfo");
        OapiV2UserGetuserinfoRequest req = new OapiV2UserGetuserinfoRequest();
        if (code == null || code.trim().isEmpty()) {
            return ResponseEntity.badRequest().body("Code cannot be empty");
        }
        if (corpId == null || corpId.trim().isEmpty()) {
            return ResponseEntity.badRequest().body("CorpId cannot be empty");
        }
        req.setCode(code);

        try {
            String accessToken = getAccessToken(clientId, clientSecret,corpId);
            if (accessToken == null) {
                return ResponseEntity.internalServerError().body("Failed to get access token");
            }

            OapiV2UserGetuserinfoResponse rsp = client.execute(req, accessToken);
            if (!rsp.isSuccess()) {
                log.error("Failed to get user info: {}", rsp.getErrmsg());
                return ResponseEntity.internalServerError().body(rsp.getErrmsg());
            }

            log.info("Successfully got user info: {}", rsp.getBody());
            System.out.println(ResponseEntity.ok(rsp.getBody()));
            return ResponseEntity.ok(rsp.getBody());
        } catch (ApiException e) {
            log.error("Error getting user info: {}", e.getMessage(), e);
            return ResponseEntity.internalServerError().body("Failed to get user info: " + e.getMessage());
        }
    }

    private String getAccessToken(String clientId, String clientSecret, String corpId) {

        com.aliyun.teaopenapi.models.Config config = new com.aliyun.teaopenapi.models.Config();
        config.protocol = "https";
        config.regionId = "central";

        try {
            com.aliyun.dingtalkoauth2_1_0.Client client = new com.aliyun.dingtalkoauth2_1_0.Client(config);
            com.aliyun.dingtalkoauth2_1_0.models.GetTokenRequest getTokenRequest = new com.aliyun.dingtalkoauth2_1_0.models.GetTokenRequest()
                    .setClientId(clientId)
                    .setClientSecret(clientSecret)
                    .setGrantType("client_credentials");
             GetTokenResponse response = client.getToken(corpId, getTokenRequest);
             return response.getBody().accessToken;
        } catch (TeaException err) {
            if (!com.aliyun.teautil.Common.empty(err.code) && !com.aliyun.teautil.Common.empty(err.message)) {
                // err 中含有 code 和 message 属性，可帮助开发定位问题
                log.error("Error getting access token: {}", err.getMessage());
            }

        } catch (Exception _err) {
            TeaException err = new TeaException(_err.getMessage(), _err);
            if (!com.aliyun.teautil.Common.empty(err.code) && !com.aliyun.teautil.Common.empty(err.message)) {
                // err 中含有 code 和 message 属性，可帮助开发定位问题
                log.error("Error getting access token: {}", err.getMessage());
            }
        }
        return null;
    }
}
