package com.jobportal.backend;

import java.util.Locale;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.services.sns.SnsClient;
import software.amazon.awssdk.services.sns.model.PublishRequest;
import software.amazon.awssdk.services.sns.model.SubscribeRequest;

@Service
public class JobNotificationService {

    private static final Logger log =
            LoggerFactory.getLogger(JobNotificationService.class);

    private static final String TOPIC_PREFIX =
            "arn:aws:sns:us-east-2:838174962681:jsolutions-jobs-";

    private static final Set<String> LOCATIONS = Set.of(
            "toronto", "mississauga",
            "vancouver", "quebec-city"
    );

    @org.springframework.beans.factory.annotation.Value("${app.notifications.sns.enabled:false}")
    private boolean snsEnabled;

    private final SnsClient snsClient;

    public JobNotificationService(SnsClient snsClient) {
        this.snsClient = snsClient;
    }

    private String normalize(String location) {
        if (location == null) {
            return "";
        }

        return location.trim()
                .toLowerCase(Locale.ROOT)
                .replaceAll("\\s+", "-");
    }

    public void subscribe(String location, String email) {
        if (!snsEnabled) {
            throw new IllegalStateException(
                "SNS notifications are disabled."
            );
        }

        String city = normalize(location);

        if (!LOCATIONS.contains(city)) {
            throw new IllegalArgumentException(
                    "Unsupported notification location."
            );
        }

        snsClient.subscribe(
                SubscribeRequest.builder()
                        .topicArn(TOPIC_PREFIX + city)
                        .protocol("email")
                        .endpoint(email)
                        .build()
        );
    }

    public void notifyNewJob(Job job) {
        if (!snsEnabled) {
            return;
        }

        String city = normalize(job.getLocation());

        if (!LOCATIONS.contains(city)) {
            return;
        }

        String message = """
                A new job is available on JSolutions!

                Job ID: %s
                Job Title: %s
                Company: %s
                Location: %s

                Sign in to JSolutions to view and apply.

                You are receiving this notification because
                you subscribed to alerts for this location.
                """.formatted(
                    job.getId(),
                    job.getTitle(),
                    job.getCompany(),
                    job.getLocation()
                );

        try {
            snsClient.publish(
                    PublishRequest.builder()
                            .topicArn(TOPIC_PREFIX + city)
                            .subject("JSolutions - New Job Alert")
                            .message(message)
                            .build()
            );

            log.info("Job alert published for job {}", job.getId());

        } catch (RuntimeException e) {

            log.warn(
                    "Job alert publication failed for job {}",
                    job.getId(), e
            );
        }
    }
}