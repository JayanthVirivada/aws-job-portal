
package com.jsolutions.lambda;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;

import software.amazon.awssdk.services.cognitoidentityprovider.CognitoIdentityProviderClient;
import software.amazon.awssdk.services.cognitoidentityprovider.model.AdminAddUserToGroupRequest;

import java.util.Map;

public class PostConfirmationHandler
        implements RequestHandler<Map<String, Object>, Map<String, Object>> {

    @Override
    @SuppressWarnings("unchecked")
    public Map<String, Object> handleRequest(
            Map<String, Object> event,
            Context context) {

        String triggerSource = (String) event.get("triggerSource");

        if (!"PostConfirmation_ConfirmSignUp".equals(triggerSource)) {
            return event;
        }

        Map<String, Object> request =
                (Map<String, Object>) event.get("request");

        Map<String, String> attributes =
                (Map<String, String>) request.get("userAttributes");

        String requestedRole =
                attributes.get("custom:requested_role");

        if ("JOB_SEEKER".equals(requestedRole)) {

            String userPoolId = (String) event.get("userPoolId");
            String username = (String) event.get("userName");

            try (CognitoIdentityProviderClient cognito =
                         CognitoIdentityProviderClient.create()) {

                AdminAddUserToGroupRequest groupRequest =
                        AdminAddUserToGroupRequest.builder()
                                .userPoolId(userPoolId)
                                .username(username)
                                .groupName("JOB_SEEKER")
                                .build();

                cognito.adminAddUserToGroup(groupRequest);
            }

            context.getLogger().log(
                    "Job seeker assigned to JOB_SEEKER group."
            );

        } else {
            context.getLogger().log(
                    "No automatic group assignment for this account."
            );
        }

        return event;
    }
}
