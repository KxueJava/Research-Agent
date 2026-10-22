package org.wwz.ai.test.domain;

import org.junit.*;
import org.mockito.*;
import org.springframework.beans.BeanWrapperImpl;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.wwz.ai.infrastructure.dao.IAdminUserDao;
import org.wwz.ai.infrastructure.dao.po.AdminUser;
import org.wwz.ai.trigger.auth.AdminAuthService;
import org.wwz.ai.trigger.http.admin.AdminUserAdminController;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

public class PublicRegistrationBoundaryTest {
    @Test public void registrationIgnoresClientIdentityRoleAndStatus() throws Exception {
        var dao = Mockito.mock(IAdminUserDao.class);
        var auth = Mockito.mock(AdminAuthService.class);
        Mockito.when(auth.encodePassword("password123")).thenReturn("hashed");
        Mockito.when(dao.insert(Mockito.any())).thenReturn(1);
        var controller = new AdminUserAdminController();
        ReflectionTestUtils.setField(controller, "adminUserDao", dao);
        ReflectionTestUtils.setField(controller, "adminAuthService", auth);
        var response = MockMvcBuilders.standaloneSetup(controller).build().perform(
                post("/api/v1/admin/admin-user/register").contentType("application/json")
                        .content("{\"username\":\"ordinary\",\"password\":\"password123\",\"userId\":\"victim\",\"role\":\"ADMIN\",\"status\":0}"))
                .andExpect(status().isOk()).andReturn().getResponse();
        Assert.assertTrue(response.getContentAsString().contains("\"data\":true"));
        var user = ArgumentCaptor.forClass(AdminUser.class);
        Mockito.verify(dao).insert(user.capture());
        Assert.assertNotEquals("victim", user.getValue().getUserId());
        Assert.assertEquals(Integer.valueOf(1), user.getValue().getStatus());
        Assert.assertEquals("USER", new BeanWrapperImpl(user.getValue()).getPropertyValue("role"));
        Assert.assertEquals("hashed", user.getValue().getPassword());
    }
}
