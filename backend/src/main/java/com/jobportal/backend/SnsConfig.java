package com.jobportal.backend;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.sns.SnsClient;
import software.amazon.awssdk.services.cognitoidentityprovider.CognitoIdentityProviderClient;

@Configuration
public class SnsConfig {

    @Bean
    public SnsClient snsClient() {
        return SnsClient.builder()
                .region(Region.US_EAST_2)
                .credentialsProvider(
                    DefaultCredentialsProvider.create()
                )
                .build();
    }

    @Bean
    public CognitoIdentityProviderClient alertCognitoClient() {
        return CognitoIdentityProviderClient.builder()
                .region(Region.US_EAST_2)
                .build();
    }
}