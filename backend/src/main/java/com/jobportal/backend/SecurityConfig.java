package com.jobportal.backend;

import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.SupplierJwtDecoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.authentication.JwtGrantedAuthoritiesConverter;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

@Configuration
public class SecurityConfig {

    @Value("${spring.security.oauth2.resourceserver.jwt.issuer-uri}")
    private String issuerUri;

    @Value("${app.cognito.client-id:20k87u0u89k966g8309iu7o35g}")
    private String clientId;

    @Bean
    public SecurityFilterChain securityFilterChain(
            HttpSecurity http) throws Exception {

        http
            .csrf(csrf -> csrf.disable())

            .cors(cors -> cors.configurationSource(
                corsConfigurationSource()
            ))

            .sessionManagement(session ->
                session.sessionCreationPolicy(
                    SessionCreationPolicy.STATELESS
                )
            )

            .authorizeHttpRequests(auth -> auth

                // Employer resume access
                .requestMatchers(
                    HttpMethod.GET,
                    "/api/jobs/*/applicants/*/resume-url"
                ).hasRole("EMPLOYER")

                // Public job listings
                .requestMatchers(
                    HttpMethod.GET,
                    "/api/jobs",
                    "/api/jobs/*"
                ).permitAll()

                // Employer job management
                .requestMatchers(
                    HttpMethod.POST,
                    "/api/jobs"
                ).hasRole("EMPLOYER")

                .requestMatchers(
                    HttpMethod.PUT,
                    "/api/jobs/*"
                ).hasRole("EMPLOYER")

                .requestMatchers(
                    HttpMethod.DELETE,
                    "/api/jobs/*"
                ).hasRole("EMPLOYER")

                // Job seeker applications
                .requestMatchers(
                    HttpMethod.POST,
                    "/api/applications"
                ).hasRole("JOB_SEEKER")

                .requestMatchers(
                    HttpMethod.GET,
                    "/api/applications/my"
                ).hasRole("JOB_SEEKER")

                // Employer applicant access
                .requestMatchers(
                    HttpMethod.GET,
                    "/api/applications/job/*"
                ).hasRole("EMPLOYER")

                // Job seeker resume management
                .requestMatchers(
                    "/api/resumes/**"
                ).hasRole("JOB_SEEKER")

                // Health checks
                .requestMatchers(
                    HttpMethod.GET,
                    "/actuator/health",
                    "/actuator/health/liveness",
                    "/actuator/health/readiness"
                ).permitAll()

                // Authenticated user information
                .requestMatchers(
                    HttpMethod.GET,
                    "/api/me"
                ).authenticated()

                // Reject undefined endpoints
                .anyRequest().denyAll()
            )

            .oauth2ResourceServer(oauth2 ->
                oauth2.jwt(jwt ->
                    jwt.jwtAuthenticationConverter(
                        jwtAuthenticationConverter()
                    )
                )
            );

        return http.build();
    }

    @Bean
    public JwtDecoder jwtDecoder() {

        return new SupplierJwtDecoder(() -> {

            NimbusJwtDecoder decoder =
                NimbusJwtDecoder
                    .withIssuerLocation(issuerUri)
                    .build();

            OAuth2TokenValidator<Jwt> issuerValidator =
                JwtValidators.createDefaultWithIssuer(
                    issuerUri
                );

            OAuth2TokenValidator<Jwt> accessTokenValidator =
                token -> {

                    if ("access".equals(
                            token.getClaimAsString("token_use"))
                        && clientId.equals(
                            token.getClaimAsString("client_id"))
                        && token.getSubject() != null
                        && !token.getSubject().isBlank()) {

                        return OAuth2TokenValidatorResult.success();
                    }

                    return OAuth2TokenValidatorResult.failure(
                        new OAuth2Error(
                            "invalid_token",
                            "Invalid Cognito access token",
                            null
                        )
                    );
                };

            decoder.setJwtValidator(
                new DelegatingOAuth2TokenValidator<>(
                    issuerValidator,
                    accessTokenValidator
                )
            );

            return decoder;
        });
    }

    @Bean
    public JwtAuthenticationConverter
            jwtAuthenticationConverter() {

        JwtGrantedAuthoritiesConverter groupsConverter =
            new JwtGrantedAuthoritiesConverter();

        groupsConverter.setAuthoritiesClaimName(
            "cognito:groups"
        );

        groupsConverter.setAuthorityPrefix("ROLE_");

        JwtAuthenticationConverter converter =
            new JwtAuthenticationConverter();

        converter.setJwtGrantedAuthoritiesConverter(
            groupsConverter
        );

        return converter;
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {

        CorsConfiguration configuration =
            new CorsConfiguration();

        configuration.setAllowedOrigins(List.of(
            "http://localhost:5173",
            "http://localhost:5174",
            "https://main.d1jpdadv3bbcfe.amplifyapp.com"
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

        configuration.setAllowCredentials(false);
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
