package org.wwz.ai.api.dto;

import lombok.Data;

import java.io.Serializable;

@Data
public class AdminUserPasswordChangeRequestDTO implements Serializable {
    private static final long serialVersionUID = 1L;
    private String currentPassword;
    private String newPassword;
}
