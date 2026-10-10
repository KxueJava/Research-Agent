package org.wwz.ai.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;

/** 登录成功后返回的用户资料和令牌。 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AdminAuthResponseDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private AdminUserResponseDTO user;
    private String accessToken;
    private String refreshToken;
    private long accessTokenExpiresIn;
}
