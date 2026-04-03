package com.project.joom.Config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;

import java.util.Arrays;
import java.util.Collections;

@Configuration
@EnableWebSecurity // 1. 이 어노테이션이 반드시 있어야 합니다!
public class SecurityConfig {

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                .cors(cors -> cors.configurationSource(request -> {
                    CorsConfiguration config = new CorsConfiguration();
                    // 2. 패턴으로 모든 로컬 호스트 허용
                    config.setAllowedOriginPatterns(Collections.singletonList("*"));
                    config.setAllowedMethods(Arrays.asList("GET", "POST", "PUT", "DELETE", "OPTIONS"));
                    config.setAllowedHeaders(Arrays.asList("*"));
                    config.setAllowCredentials(true);
                    return config;
                }))
                .csrf(csrf -> csrf.disable()) // 3. POST 요청을 위해 반드시 disable
                .headers(headers -> headers.frameOptions(options -> options.disable())) // H2 콘솔 등을 쓸 경우 대비
                .authorizeHttpRequests(auth -> auth
                        // 4. 경로 허용 확인 (제일 중요)
                        .requestMatchers("/api/rooms/**").permitAll()
                        .anyRequest().permitAll() // 테스트 중에는 일단 모든 문을 열어서 403을 없애보세요!
                );

        return http.build();
    }
}
