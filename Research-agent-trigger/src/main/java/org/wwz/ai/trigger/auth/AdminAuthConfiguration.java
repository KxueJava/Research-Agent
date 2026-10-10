package org.wwz.ai.trigger.auth;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

@Configuration
@EnableConfigurationProperties(AdminAuthProperties.class)
public class AdminAuthConfiguration {
    @Bean
    public PasswordEncoder adminPasswordEncoder() {
        return new BCryptPasswordEncoder(12);
    }
}
