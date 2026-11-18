
package com.jobportal.backend;

import java.util.List;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

@Configuration
public class SecurityConfig {

    @Bean
    public SecurityFilterChain securityFilterChain(
            HttpSecurity http) throws Exception {

        http
            .csrf(csrf -> csrf.disable())
            .cors(cors -> cors.configurationSource(
                corsConfigurationSource()
            ))
            .authorizeHttpRequests(auth -> auth

                // =====================================
                // PHASE 8: EMPLOYER RESUME ACCESS
                // =====================================
                // Must be before the public job routes.
                .requestMatchers(
                    HttpMethod.GET,
                    "/api/jobs/*/applicants/*/resume-url"
                ).authenticated()

                // =====================================
                // PUBLIC JOB LISTINGS
                // =====================================
                .requestMatchers(
                    HttpMethod.GET,
                    "/api/jobs",
                    "/api/jobs/*"
                ).permitAll()

                // =====================================
                // HEALTH CHECK
                // =====================================
                .requestMatchers(
                    "/actuator/health"
                ).permitAll()

                // =====================================
                // RESUME UPLOAD
                // =====================================
                .requestMatchers(
                    HttpMethod.POST,
                    "/api/resumes/upload"
                ).authenticated()

                // =====================================
                // ALL OTHER ENDPOINTS
                // =====================================
                .anyRequest().authenticated()
            )
            .oauth2ResourceServer(oauth2 ->
                oauth2.jwt(jwt -> {})
            );

        return http.build();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {

        CorsConfiguration configuration =
            new CorsConfiguration();

        // Allow both local Vite frontend ports
        configuration.setAllowedOrigins(List.of(
            "http://localhost:5173",
            "http://localhost:5174"
        ));

        configuration.setAllowedMethods(List.of(
            "GET",
            "POST",
            "PUT",
            "DELETE",
            "OPTIONS"
        ));

        configuration.setAllowedHeaders(List.of(
            "Authorization",
            "Content-Type",
            "Accept"
        ));

        configuration.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source =
            new UrlBasedCorsConfigurationSource();

        source.registerCorsConfiguration(
            "/**",
            configuration
        );

        return source;
    }
}
