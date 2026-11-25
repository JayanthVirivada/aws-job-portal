package com.jobportal.backend;

import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import software.amazon.awssdk.services.cognitoidentityprovider.CognitoIdentityProviderClient;

@RestController
@RequestMapping("/api/notifications")
public class NotificationController {

    private final JobNotificationService notifications;
    private final CognitoIdentityProviderClient cognito;

    public NotificationController(
            JobNotificationService notifications,
            CognitoIdentityProviderClient cognito) {

        this.notifications = notifications;
        this.cognito = cognito;
    }

    @PostMapping("/subscribe")
    public ResponseEntity<?> subscribe(
            @RequestBody Map<String, String> request,
            @AuthenticationPrincipal Jwt jwt) {

        try {
            var user = cognito.getUser(builder ->
                    builder.accessToken(jwt.getTokenValue())
            );

            String email = user.userAttributes().stream()
                    .filter(a -> "email".equals(a.name()))
                    .map(a -> a.value())
                    .findFirst().orElse("");

            boolean verified = user.userAttributes().stream()
                    .anyMatch(a ->
                            "email_verified".equals(a.name())
                            && "true".equalsIgnoreCase(a.value())
                    );

            if (!verified || email.isBlank()) {
                return ResponseEntity.status(HttpStatus.FORBIDDEN)
                        .body(Map.of(
                            "message", "Verified email required."
                        ));
            }

            notifications.subscribe(
                    request.get("location"), email
            );

            return ResponseEntity.accepted().body(Map.of(
                    "message",
                    "Subscription requested. Check your email to confirm."
            ));

        } catch (IllegalArgumentException e) {

            return ResponseEntity.badRequest().body(Map.of(
                    "message", "Unsupported location."
            ));

        } catch (RuntimeException e) {

            return ResponseEntity.status(
                    HttpStatus.SERVICE_UNAVAILABLE
            ).body(Map.of(
                    "message",
                    "Notification subscription unavailable."
            ));
        }
    }
}