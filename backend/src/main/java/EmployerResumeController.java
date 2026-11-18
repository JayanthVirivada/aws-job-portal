
package com.jobportal.backend;

import java.time.Duration;
import java.util.Collection;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import software.amazon.awssdk.core.exception.SdkException;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest;

@RestController
@RequestMapping("/api/jobs")
public class EmployerResumeController {

    private static final String BUCKET_NAME =
            "jsolutions-resumes-2026-unique123";

    private final JobRepository jobRepository;
    private final JobApplicationRepository applicationRepository;
    private final ResumeRepository resumeRepository;
    private final S3Presigner s3Presigner;

    public EmployerResumeController(
            JobRepository jobRepository,
            JobApplicationRepository applicationRepository,
            ResumeRepository resumeRepository,
            S3Presigner s3Presigner
    ) {
        this.jobRepository = jobRepository;
        this.applicationRepository = applicationRepository;
        this.resumeRepository = resumeRepository;
        this.s3Presigner = s3Presigner;
    }

    private boolean isEmployer(Jwt jwt) {
        if (jwt == null) {
            return false;
        }

        Object claim = jwt.getClaim("cognito:groups");

        return claim instanceof Collection<?> groups
                && groups.contains("EMPLOYER");
    }

    @GetMapping("/{jobId}/applicants/{applicantId}/resume-url")
    public ResponseEntity<?> getApplicantResumeUrl(
            @PathVariable Long jobId,
            @PathVariable String applicantId,
            @AuthenticationPrincipal Jwt jwt
    ) {

        // 1. Authentication
        if (jwt == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Authentication required"));
        }

        // 2. Employer role
        if (!isEmployer(jwt)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Employer access required"));
        }

        // 3. Verify job ownership
        var jobOptional = jobRepository.findById(jobId);

        if (jobOptional.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("error", "Job not found"));
        }

        Job job = jobOptional.get();

        if (!jwt.getSubject().equals(job.getEmployerId())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "You do not own this job"));
        }

        // 4. Verify applicant actually applied
        if (!applicationRepository.existsByJobIdAndApplicantId(
                jobId, applicantId)) {

            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("error", "Application not found"));
        }

        // 5. Retrieve applicant's latest resume
        var resumeOptional =
                resumeRepository.findFirstByUserIdOrderByUploadedAtDesc(
                        applicantId
                );

        if (resumeOptional.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("error", "Applicant has no resume"));
        }

        Resume resume = resumeOptional.get();
        String objectKey = resume.getS3ObjectKey();

        // 6. Validate S3 object ownership
        String expectedPrefix = "resumes/" + applicantId + "/";

        if (objectKey == null ||
                !objectKey.startsWith(expectedPrefix)) {

            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Invalid resume ownership"));
        }

        // 7. Generate temporary S3 URL
        try {
            GetObjectRequest getRequest =
                    GetObjectRequest.builder()
                            .bucket(BUCKET_NAME)
                            .key(objectKey)
                            .responseContentType("application/pdf")
                            .responseContentDisposition("inline")
                            .build();

            GetObjectPresignRequest presignRequest =
                    GetObjectPresignRequest.builder()
                            .signatureDuration(Duration.ofMinutes(5))
                            .getObjectRequest(getRequest)
                            .build();

            String url = s3Presigner
                    .presignGetObject(presignRequest)
                    .url()
                    .toString();

            return ResponseEntity.ok(Map.of(
                    "url", url,
                    "expiresInSeconds", 300
            ));

        } catch (SdkException e) {
            return ResponseEntity.status(
                    HttpStatus.INTERNAL_SERVER_ERROR
            ).body(Map.of(
                    "error", "Unable to generate resume URL"
            ));
        }
    }
}
