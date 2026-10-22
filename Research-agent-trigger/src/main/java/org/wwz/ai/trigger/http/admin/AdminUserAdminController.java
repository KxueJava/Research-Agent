package org.wwz.ai.trigger.http.admin;

import org.wwz.ai.api.IAdminUserAdminService;
import org.wwz.ai.api.dto.AdminAuthResponseDTO;
import org.wwz.ai.api.dto.AdminUserLoginRequestDTO;
import org.wwz.ai.api.dto.AdminUserPasswordChangeRequestDTO;
import org.wwz.ai.api.dto.AdminUserProfileUpdateRequestDTO;
import org.wwz.ai.api.dto.AdminUserRefreshTokenRequestDTO;
import org.wwz.ai.api.dto.AdminUserQueryRequestDTO;
import org.wwz.ai.api.dto.AdminUserRequestDTO;
import org.wwz.ai.api.dto.AdminUserResponseDTO;
import org.wwz.ai.api.response.Response;
import org.wwz.ai.infrastructure.dao.IAdminUserDao;
import org.wwz.ai.infrastructure.dao.po.AdminUser;
import org.wwz.ai.types.enums.ResponseCode;
import org.wwz.ai.trigger.auth.AdminAuthService;
import org.wwz.ai.types.auth.AdminAuthContext;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import javax.annotation.Resource;
import java.time.LocalDateTime;
import java.util.UUID;
import java.util.List;
import java.util.stream.Collectors;

/**
 * 管理员用户管理控制器
 *
 * <p>该类是管理员用户 HTTP 契约到基础设施 DAO 的适配层：负责接收管理端 DTO、
 * 转换为持久化对象、调用 DAO，并把执行结果统一包装成 {@link Response}。当前管理
 * 用户能力尚未经过独立应用服务编排，因此控制器保留了这段较薄的直接访问边界。</p>
 *
 * <p>所有端点都把异常转换为统一失败响应，避免数据库或转换异常直接泄漏到 HTTP
 * 层；查询类接口在“没有匹配数据”时仍返回成功码和空数据，这是调用方需要区分的
 * “查询成功但无结果”语义。</p>
 */
@Slf4j
@RestController
@RequestMapping("/api/v1/admin/admin-user")
@CrossOrigin(origins = "*", allowedHeaders = "*", methods = {RequestMethod.GET, RequestMethod.POST, RequestMethod.PUT, RequestMethod.DELETE, RequestMethod.OPTIONS})
public class AdminUserAdminController implements IAdminUserAdminService {

    @Resource
    private IAdminUserDao adminUserDao;

    @Resource
    private AdminAuthService adminAuthService;

    @PostMapping("/register")
    public Response<Boolean> register(@RequestBody AdminUserLoginRequestDTO credentials) {
        AdminUserRequestDTO request = new AdminUserRequestDTO();
        request.setUsername(credentials.getUsername());
        request.setPassword(credentials.getPassword());
        // No client-supplied ID, role or account status crosses this boundary.
        return createAdminUser(request);
    }

    @Override
    @PostMapping("/create")
    public Response<Boolean> createAdminUser(@RequestBody AdminUserRequestDTO request) {
        // 创建时同时补齐审计时间，DAO 只负责执行持久化，不承担请求 DTO 的生命周期语义。
        try {
            log.info("创建用户请求 username={}", request.getUsername());

            // DTO转PO
            AdminUser adminUser = convertToAdminUser(request);
            adminUser.setRole("USER");
            // user_id 是数据库必填的业务标识，注册时由服务端生成，避免客户端遗漏导致未知失败。
            if (!StringUtils.hasText(adminUser.getUserId())) {
                adminUser.setUserId(UUID.randomUUID().toString().replace("-", ""));
            }
            if (!StringUtils.hasText(adminUser.getUsername()) || !StringUtils.hasText(adminUser.getPassword())) {
                return Response.<Boolean>builder()
                        .code(ResponseCode.ILLEGAL_PARAMETER.getCode())
                        .info("用户名和密码不能为空")
                        .data(false)
                        .build();
            }
            if (adminUser.getStatus() == null) {
                adminUser.setStatus(1);
            }
            if (adminUser.getUsername().trim().length() > 255) {
                return Response.<Boolean>builder().code(ResponseCode.ILLEGAL_PARAMETER.getCode())
                        .info("用户名不能超过255个字符").data(false).build();
            }
            if (adminUserDao.queryByUsername(adminUser.getUsername().trim()) != null) {
                return Response.<Boolean>builder()
                        .code(ResponseCode.ILLEGAL_PARAMETER.getCode())
                        .info("用户名已存在")
                        .data(false)
                        .build();
            }
            adminUser.setUsername(adminUser.getUsername().trim());
            adminUser.setPassword(adminAuthService.encodePassword(adminUser.getPassword()));
            adminUser.setCreateTime(LocalDateTime.now());
            adminUser.setUpdateTime(LocalDateTime.now());

            int result = adminUserDao.insert(adminUser);

            return Response.<Boolean>builder()
                    .code(ResponseCode.SUCCESS.getCode())
                    .info(ResponseCode.SUCCESS.getInfo())
                    .data(result > 0)
                    .build();
        } catch (DuplicateKeyException e) {
            return Response.<Boolean>builder().code(ResponseCode.ILLEGAL_PARAMETER.getCode())
                    .info("用户名已存在").data(false).build();
        } catch (Exception e) {
            log.error("创建管理员用户失败", e);
            return Response.<Boolean>builder()
                    .code(ResponseCode.UN_ERROR.getCode())
                    .info(ResponseCode.UN_ERROR.getInfo())
                    .data(false)
                    .build();
        }
    }

    @Override
    @PutMapping("/update-by-id")
    public Response<Boolean> updateAdminUserById(@RequestBody AdminUserRequestDTO request) {
        try {
            log.info("根据ID更新管理员用户请求：{}", request);

            if (request.getId() == null) {
                return Response.<Boolean>builder()
                        .code(ResponseCode.ILLEGAL_PARAMETER.getCode())
                        .info("ID不能为空")
                        .data(false)
                        .build();
            }

            // DTO转PO
            AdminUser adminUser = convertToAdminUser(request);
            adminUser.setUpdateTime(LocalDateTime.now());

            int result = adminUserDao.updateById(adminUser);

            return Response.<Boolean>builder()
                    .code(ResponseCode.SUCCESS.getCode())
                    .info(ResponseCode.SUCCESS.getInfo())
                    .data(result > 0)
                    .build();
        } catch (DuplicateKeyException e) {
            return Response.<Boolean>builder().code(ResponseCode.ILLEGAL_PARAMETER.getCode())
                    .info("用户名已存在").data(false).build();
        } catch (Exception e) {
            log.error("根据ID更新管理员用户失败", e);
            return Response.<Boolean>builder()
                    .code(ResponseCode.UN_ERROR.getCode())
                    .info(ResponseCode.UN_ERROR.getInfo())
                    .data(false)
                    .build();
        }
    }

    @Override
    @PutMapping("/update-by-user-id")
    public Response<Boolean> updateAdminUserByUserId(@RequestBody AdminUserRequestDTO request) {
        try {
            log.info("根据用户ID更新管理员用户请求：{}", request);

            if (!StringUtils.hasText(request.getUserId())) {
                return Response.<Boolean>builder()
                        .code(ResponseCode.ILLEGAL_PARAMETER.getCode())
                        .info("用户ID不能为空")
                        .data(false)
                        .build();
            }

            // DTO转PO
            AdminUser adminUser = convertToAdminUser(request);
            adminUser.setUpdateTime(LocalDateTime.now());

            int result = adminUserDao.updateByUserId(adminUser);

            return Response.<Boolean>builder()
                    .code(ResponseCode.SUCCESS.getCode())
                    .info(ResponseCode.SUCCESS.getInfo())
                    .data(result > 0)
                    .build();
        } catch (DuplicateKeyException e) {
            return Response.<Boolean>builder().code(ResponseCode.ILLEGAL_PARAMETER.getCode())
                    .info("用户名已存在").data(false).build();
        } catch (Exception e) {
            log.error("根据用户ID更新管理员用户失败", e);
            return Response.<Boolean>builder()
                    .code(ResponseCode.UN_ERROR.getCode())
                    .info(ResponseCode.UN_ERROR.getInfo())
                    .data(false)
                    .build();
        }
    }

    @Override
    @DeleteMapping("/delete-by-id/{id}")
    public Response<Boolean> deleteAdminUserById(@PathVariable("id") Long id) {
        try {
            log.info("根据ID删除管理员用户请求：{}", id);

            int result = adminUserDao.deleteById(id);

            return Response.<Boolean>builder()
                    .code(ResponseCode.SUCCESS.getCode())
                    .info(ResponseCode.SUCCESS.getInfo())
                    .data(result > 0)
                    .build();
        } catch (Exception e) {
            log.error("根据ID删除管理员用户失败", e);
            return Response.<Boolean>builder()
                    .code(ResponseCode.UN_ERROR.getCode())
                    .info(ResponseCode.UN_ERROR.getInfo())
                    .data(false)
                    .build();
        }
    }

    @Override
    @DeleteMapping("/delete-by-user-id/{userId}")
    public Response<Boolean> deleteAdminUserByUserId(@PathVariable("userId") String userId) {
        try {
            log.info("根据用户ID删除管理员用户请求：{}", userId);

            int result = adminUserDao.deleteByUserId(userId);

            return Response.<Boolean>builder()
                    .code(ResponseCode.SUCCESS.getCode())
                    .info(ResponseCode.SUCCESS.getInfo())
                    .data(result > 0)
                    .build();
        } catch (Exception e) {
            log.error("根据用户ID删除管理员用户失败", e);
            return Response.<Boolean>builder()
                    .code(ResponseCode.UN_ERROR.getCode())
                    .info(ResponseCode.UN_ERROR.getInfo())
                    .data(false)
                    .build();
        }
    }

    @Override
    @GetMapping("/query-by-id/{id}")
    public Response<AdminUserResponseDTO> queryAdminUserById(@PathVariable("id") Long id) {
        try {
            log.info("根据ID查询管理员用户请求：{}", id);

            AdminUser adminUser = adminUserDao.queryById(id);
            if (adminUser == null) {
                return Response.<AdminUserResponseDTO>builder()
                        .code(ResponseCode.SUCCESS.getCode())
                        .info(ResponseCode.SUCCESS.getInfo())
                        .data(null)
                        .build();
            }

            AdminUserResponseDTO responseDTO = convertToAdminUserResponseDTO(adminUser);

            return Response.<AdminUserResponseDTO>builder()
                    .code(ResponseCode.SUCCESS.getCode())
                    .info(ResponseCode.SUCCESS.getInfo())
                    .data(responseDTO)
                    .build();
        } catch (Exception e) {
            log.error("根据ID查询管理员用户失败", e);
            return Response.<AdminUserResponseDTO>builder()
                    .code(ResponseCode.UN_ERROR.getCode())
                    .info(ResponseCode.UN_ERROR.getInfo())
                    .data(null)
                    .build();
        }
    }

    @Override
    @GetMapping("/query-by-user-id/{userId}")
    public Response<AdminUserResponseDTO> queryAdminUserByUserId(@PathVariable("userId") String userId) {
        try {
            log.info("根据用户ID查询管理员用户请求：{}", userId);

            AdminUser adminUser = adminUserDao.queryByUserId(userId);
            if (adminUser == null) {
                return Response.<AdminUserResponseDTO>builder()
                        .code(ResponseCode.SUCCESS.getCode())
                        .info(ResponseCode.SUCCESS.getInfo())
                        .data(null)
                        .build();
            }

            AdminUserResponseDTO responseDTO = convertToAdminUserResponseDTO(adminUser);

            return Response.<AdminUserResponseDTO>builder()
                    .code(ResponseCode.SUCCESS.getCode())
                    .info(ResponseCode.SUCCESS.getInfo())
                    .data(responseDTO)
                    .build();
        } catch (Exception e) {
            log.error("根据用户ID查询管理员用户失败", e);
            return Response.<AdminUserResponseDTO>builder()
                    .code(ResponseCode.UN_ERROR.getCode())
                    .info(ResponseCode.UN_ERROR.getInfo())
                    .data(null)
                    .build();
        }
    }

    @Override
    @GetMapping("/query-by-username/{username}")
    public Response<AdminUserResponseDTO> queryAdminUserByUsername(@PathVariable("username") String username) {
        try {
            log.info("根据用户名查询管理员用户请求：{}", username);

            AdminUser adminUser = adminUserDao.queryByUsername(username);
            if (adminUser == null) {
                return Response.<AdminUserResponseDTO>builder()
                        .code(ResponseCode.SUCCESS.getCode())
                        .info(ResponseCode.SUCCESS.getInfo())
                        .data(null)
                        .build();
            }

            AdminUserResponseDTO responseDTO = convertToAdminUserResponseDTO(adminUser);

            return Response.<AdminUserResponseDTO>builder()
                    .code(ResponseCode.SUCCESS.getCode())
                    .info(ResponseCode.SUCCESS.getInfo())
                    .data(responseDTO)
                    .build();
        } catch (Exception e) {
            log.error("根据用户名查询管理员用户失败", e);
            return Response.<AdminUserResponseDTO>builder()
                    .code(ResponseCode.UN_ERROR.getCode())
                    .info(ResponseCode.UN_ERROR.getInfo())
                    .data(null)
                    .build();
        }
    }

    @Override
    @GetMapping("/query-enabled")
    public Response<List<AdminUserResponseDTO>> queryEnabledAdminUsers() {
        try {
            log.info("查询启用状态的管理员用户列表");

            List<AdminUser> adminUsers = adminUserDao.queryEnabledUsers();
            List<AdminUserResponseDTO> responseDTOs = adminUsers.stream()
                    .map(this::convertToAdminUserResponseDTO)
                    .collect(Collectors.toList());

            return Response.<List<AdminUserResponseDTO>>builder()
                    .code(ResponseCode.SUCCESS.getCode())
                    .info(ResponseCode.SUCCESS.getInfo())
                    .data(responseDTOs)
                    .build();
        } catch (Exception e) {
            log.error("查询启用状态的管理员用户列表失败", e);
            return Response.<List<AdminUserResponseDTO>>builder()
                    .code(ResponseCode.UN_ERROR.getCode())
                    .info(ResponseCode.UN_ERROR.getInfo())
                    .data(null)
                    .build();
        }
    }

    @Override
    @GetMapping("/query-by-status/{status}")
    public Response<List<AdminUserResponseDTO>> queryAdminUsersByStatus(@PathVariable("status") Integer status) {
        try {
            log.info("根据状态查询管理员用户列表请求：{}", status);

            List<AdminUser> adminUsers = adminUserDao.queryByStatus(status);
            List<AdminUserResponseDTO> responseDTOs = adminUsers.stream()
                    .map(this::convertToAdminUserResponseDTO)
                    .collect(Collectors.toList());

            return Response.<List<AdminUserResponseDTO>>builder()
                    .code(ResponseCode.SUCCESS.getCode())
                    .info(ResponseCode.SUCCESS.getInfo())
                    .data(responseDTOs)
                    .build();
        } catch (Exception e) {
            log.error("根据状态查询管理员用户列表失败", e);
            return Response.<List<AdminUserResponseDTO>>builder()
                    .code(ResponseCode.UN_ERROR.getCode())
                    .info(ResponseCode.UN_ERROR.getInfo())
                    .data(null)
                    .build();
        }
    }

    @Override
    @PostMapping("/query-list")
    public Response<List<AdminUserResponseDTO>> queryAdminUserList(@RequestBody AdminUserQueryRequestDTO request) {
        // 该接口先读取全量数据，再在内存中完成筛选和分页；它是当前管理端兼容实现，
        // 因而分页参数只影响返回窗口，不会改变底层 DAO 的查询范围。
        try {
            log.info("根据条件查询管理员用户列表请求：{}", request);

            // 这里可以根据查询条件进行过滤，暂时先查询所有
            List<AdminUser> adminUsers = adminUserDao.queryAll();

            // 根据查询条件进行过滤
            List<AdminUser> filteredUsers = adminUsers.stream()
                    .filter(user -> {
                        boolean match = true;
                        if (StringUtils.hasText(request.getUserId())) {
                            match = match && user.getUserId().equals(request.getUserId());
                        }
                        if (StringUtils.hasText(request.getUsername())) {
                            match = match && user.getUsername().contains(request.getUsername());
                        }
                        if (request.getStatus() != null) {
                            match = match && user.getStatus().equals(request.getStatus());
                        }
                        return match;
                    })
                    .collect(Collectors.toList());

            // 分页处理
            int pageNum = request.getPageNum() != null ? request.getPageNum() : 1;
            int pageSize = request.getPageSize() != null ? request.getPageSize() : 10;
            int startIndex = (pageNum - 1) * pageSize;
            int endIndex = Math.min(startIndex + pageSize, filteredUsers.size());

            List<AdminUser> pagedUsers = filteredUsers.subList(startIndex, endIndex);
            List<AdminUserResponseDTO> responseDTOs = pagedUsers.stream()
                    .map(this::convertToAdminUserResponseDTO)
                    .collect(Collectors.toList());

            return Response.<List<AdminUserResponseDTO>>builder()
                    .code(ResponseCode.SUCCESS.getCode())
                    .info(ResponseCode.SUCCESS.getInfo())
                    .data(responseDTOs)
                    .build();
        } catch (Exception e) {
            log.error("根据条件查询管理员用户列表失败", e);
            return Response.<List<AdminUserResponseDTO>>builder()
                    .code(ResponseCode.UN_ERROR.getCode())
                    .info(ResponseCode.UN_ERROR.getInfo())
                    .data(null)
                    .build();
        }
    }

    @Override
    @GetMapping("/query-all")
    public Response<List<AdminUserResponseDTO>> queryAllAdminUsers() {
        try {
            log.info("查询所有管理员用户");

            List<AdminUser> adminUsers = adminUserDao.queryAll();
            List<AdminUserResponseDTO> responseDTOs = adminUsers.stream()
                    .map(this::convertToAdminUserResponseDTO)
                    .collect(Collectors.toList());

            return Response.<List<AdminUserResponseDTO>>builder()
                    .code(ResponseCode.SUCCESS.getCode())
                    .info(ResponseCode.SUCCESS.getInfo())
                    .data(responseDTOs)
                    .build();
        } catch (Exception e) {
            log.error("查询所有管理员用户失败", e);
            return Response.<List<AdminUserResponseDTO>>builder()
                    .code(ResponseCode.UN_ERROR.getCode())
                    .info(ResponseCode.UN_ERROR.getInfo())
                    .data(null)
                    .build();
        }
    }

    @Override
    @PostMapping("/login")
    public Response<AdminAuthResponseDTO> loginAdminUser(@RequestBody AdminUserLoginRequestDTO request) {
        // 登录先按用户名和密码查询，再单独检查状态；“凭证正确但账号不可用”不能视为登录成功。
        try {
            log.info("管理员用户登录请求：{}", request.getUsername());

            AdminUser adminUser = adminAuthService.authenticateCredentials(request.getUsername(), request.getPassword());
            if (adminUser == null) {
                return Response.<AdminAuthResponseDTO>builder()
                        .code(ResponseCode.ILLEGAL_PARAMETER.getCode())
                        .info("用户名或密码错误")
                        .data(null)
                        .build();
            }

            // 检查用户状态
            if (adminUser.getStatus() == 0) {
                return Response.<AdminAuthResponseDTO>builder()
                        .code(ResponseCode.ILLEGAL_PARAMETER.getCode())
                        .info("用户已被禁用")
                        .data(null)
                        .build();
            }

            if (adminUser.getStatus() == 2) {
                return Response.<AdminAuthResponseDTO>builder()
                        .code(ResponseCode.ILLEGAL_PARAMETER.getCode())
                        .info("用户已被锁定")
                        .data(null)
                        .build();
            }

            AdminAuthResponseDTO responseDTO = adminAuthService.issueLogin(
                    adminUser,
                    resolveClientIp(currentRequest()),
                    currentRequest().getHeader("User-Agent")
            );

            return Response.<AdminAuthResponseDTO>builder()
                    .code(ResponseCode.SUCCESS.getCode())
                    .info(ResponseCode.SUCCESS.getInfo())
                    .data(responseDTO)
                    .build();
        } catch (Exception e) {
            log.error("管理员用户登录失败", e);
            return Response.<AdminAuthResponseDTO>builder()
                    .code(ResponseCode.UN_ERROR.getCode())
                    .info(ResponseCode.UN_ERROR.getInfo())
                    .data(null)
                    .build();
        }
    }

    @Override
    @PostMapping("/validate-login")
    public Response<Boolean> validateAdminUserLogin(@RequestBody AdminUserLoginRequestDTO request) {
        // 校验接口只返回布尔结果，不建立会话；它与 login 的区别是成功时不暴露管理员详情。
        try {
            log.info("管理员用户登录校验请求：{}", request.getUsername());

            // 参数校验
            if (!StringUtils.hasText(request.getUsername()) || !StringUtils.hasText(request.getPassword())) {
                return Response.<Boolean>builder()
                        .code(ResponseCode.ILLEGAL_PARAMETER.getCode())
                        .info("用户名或密码不能为空")
                        .data(false)
                        .build();
            }

            // 查询用户
            AdminUser adminUser = adminAuthService.authenticateCredentials(request.getUsername(), request.getPassword());
            if (adminUser == null) {
                return Response.<Boolean>builder()
                        .code(ResponseCode.LOGIN_FAILED.getCode())
                        .info(ResponseCode.LOGIN_FAILED.getInfo())
                        .data(false)
                        .build();
            }

            // 检查用户状态
            if (adminUser.getStatus() == 0) {
                return Response.<Boolean>builder()
                        .code(ResponseCode.LOGIN_FAILED.getCode())
                        .info("用户已被禁用")
                        .data(false)
                        .build();
            }

            if (adminUser.getStatus() == 2) {
                return Response.<Boolean>builder()
                        .code(ResponseCode.LOGIN_FAILED.getCode())
                        .info("用户已被锁定")
                        .data(false)
                        .build();
            }

            // 登录校验成功
            return Response.<Boolean>builder()
                    .code(ResponseCode.SUCCESS.getCode())
                    .info(ResponseCode.SUCCESS.getInfo())
                    .data(true)
                    .build();
        } catch (Exception e) {
            log.error("管理员用户登录校验失败", e);
            return Response.<Boolean>builder()
                    .code(ResponseCode.UN_ERROR.getCode())
                    .info(ResponseCode.UN_ERROR.getInfo())
                    .data(false)
                    .build();
        }
    }

    @PostMapping("/refresh")
    public Response<AdminAuthResponseDTO> refresh(@RequestBody AdminUserRefreshTokenRequestDTO request) {
        try {
            return Response.<AdminAuthResponseDTO>builder()
                    .code(ResponseCode.SUCCESS.getCode())
                    .info(ResponseCode.SUCCESS.getInfo())
                    .data(adminAuthService.refresh(request == null ? null : request.getRefreshToken()))
                    .build();
        } catch (Exception e) {
            return Response.<AdminAuthResponseDTO>builder()
                    .code(ResponseCode.LOGIN_FAILED.getCode())
                    .info(e.getMessage() == null ? "Refresh Token 已失效" : e.getMessage())
                    .data(null)
                    .build();
        }
    }

    @PostMapping("/logout")
    public Response<Boolean> logout(HttpServletRequest request) {
        adminAuthService.logout(readBearerToken(request));
        return Response.<Boolean>builder()
                .code(ResponseCode.SUCCESS.getCode())
                .info(ResponseCode.SUCCESS.getInfo())
                .data(true)
                .build();
    }

    @GetMapping("/me")
    public Response<AdminUserResponseDTO> me() {
        try {
            AdminUser user = adminAuthService.activeUser(AdminAuthContext.currentUserId());
            return Response.<AdminUserResponseDTO>builder()
                    .code(ResponseCode.SUCCESS.getCode())
                    .info(ResponseCode.SUCCESS.getInfo())
                    .data(adminAuthService.toResponse(user))
                    .build();
        } catch (Exception e) {
            return Response.<AdminUserResponseDTO>builder()
                    .code(ResponseCode.LOGIN_FAILED.getCode())
                    .info("登录已失效")
                    .data(null)
                    .build();
        }
    }

    @PutMapping("/profile")
    public Response<AdminUserResponseDTO> updateProfile(@RequestBody AdminUserProfileUpdateRequestDTO request) {
        try {
            String userId = AdminAuthContext.currentUserId();
            AdminUser current = adminAuthService.activeUser(userId);
            String username = StringUtils.hasText(request == null ? null : request.getUsername())
                    ? request.getUsername().trim() : current.getUsername();
            if (username.length() > 255) {
                throw new IllegalArgumentException("用户名不能超过255个字符");
            }
            AdminUser sameName = adminUserDao.queryByUsername(username);
            if (sameName != null && !userId.equals(sameName.getUserId())) {
                throw new IllegalArgumentException("用户名已存在");
            }
            String avatarUrl = request == null ? current.getAvatarUrl() : request.getAvatarUrl();
            adminUserDao.updateProfileByUserId(userId, username, avatarUrl);
            AdminUser updated = adminAuthService.activeUser(userId);
            return Response.<AdminUserResponseDTO>builder()
                    .code(ResponseCode.SUCCESS.getCode())
                    .info(ResponseCode.SUCCESS.getInfo())
                    .data(adminAuthService.toResponse(updated))
                    .build();
        } catch (DuplicateKeyException e) {
            return Response.<AdminUserResponseDTO>builder().code(ResponseCode.ILLEGAL_PARAMETER.getCode())
                    .info("用户名已存在").data(null).build();
        } catch (Exception e) {
            return Response.<AdminUserResponseDTO>builder()
                    .code(ResponseCode.ILLEGAL_PARAMETER.getCode())
                    .info(e.getMessage() == null ? "资料更新失败" : e.getMessage())
                    .data(null)
                    .build();
        }
    }

    @PutMapping("/password")
    public Response<Boolean> changePassword(@RequestBody AdminUserPasswordChangeRequestDTO request) {
        try {
            AdminUser current = adminAuthService.activeUser(AdminAuthContext.currentUserId());
            if (request == null || !adminAuthService.matchesPassword(request.getCurrentPassword(), current.getPassword())) {
                throw new IllegalArgumentException("当前密码错误");
            }
            if (!StringUtils.hasText(request.getNewPassword()) || request.getNewPassword().length() < 8) {
                throw new IllegalArgumentException("新密码至少需要 8 个字符");
            }
            adminUserDao.updatePasswordByUserId(current.getUserId(), adminAuthService.encodePassword(request.getNewPassword()));
            adminAuthService.logoutAll(current.getUserId());
            return Response.<Boolean>builder()
                    .code(ResponseCode.SUCCESS.getCode())
                    .info("密码已更新，请重新登录")
                    .data(true)
                    .build();
        } catch (Exception e) {
            return Response.<Boolean>builder()
                    .code(ResponseCode.ILLEGAL_PARAMETER.getCode())
                    .info(e.getMessage() == null ? "密码更新失败" : e.getMessage())
                    .data(false)
                    .build();
        }
    }

    /**
     * 将 HTTP 请求对象转换为 DAO 使用的持久化对象。
     *
     * <p>转换方法只负责字段映射，创建时间、更新时间等由具体写入端点根据生命周期
     * 语义补齐，避免更新操作意外重置创建时间。</p>
     */
    private AdminUser convertToAdminUser(AdminUserRequestDTO requestDTO) {
        AdminUser adminUser = new AdminUser();
        BeanUtils.copyProperties(requestDTO, adminUser);
        return adminUser;
    }

    /**
     * 将持久化对象转换为对外响应对象，隔离数据库对象与 HTTP 返回模型。
     */
    private AdminUserResponseDTO convertToAdminUserResponseDTO(AdminUser adminUser) {
        AdminUserResponseDTO responseDTO = new AdminUserResponseDTO();
        BeanUtils.copyProperties(adminUser, responseDTO);
        return responseDTO;
    }

    private String readBearerToken(HttpServletRequest request) {
        String authorization = request.getHeader("Authorization");
        return authorization != null && authorization.startsWith("Bearer ")
                ? authorization.substring("Bearer ".length()).trim() : null;
    }

    private HttpServletRequest currentRequest() {
        ServletRequestAttributes attributes = (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
        if (attributes == null) {
            throw new IllegalStateException("当前请求上下文不存在");
        }
        return attributes.getRequest();
    }

    private String resolveClientIp(HttpServletRequest request) {
        String forwardedFor = request.getHeader("X-Forwarded-For");
        return StringUtils.hasText(forwardedFor) ? forwardedFor.split(",")[0].trim() : request.getRemoteAddr();
    }

}
