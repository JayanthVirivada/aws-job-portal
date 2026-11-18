
package com.jobportal.backend;

import java.io.IOException;
import java.time.Duration;
import java.util.Collection;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest;
import software.amazon.awssdk.services.s3.presigner.model.PresignedGetObjectRequest;
import software.amazon.awssdk.core.exception.SdkException;

@RestController
@RequestMapping("/api/resumes")
public class ResumeController {

    private static final String BUCKET_NAME =
            "jsolutions-resumes-2026-unique123";

    private final ResumeStorageService resumeStorageService;
    private final ResumeRepository resumeRepository;
    private final S3Presigner s3Presigner;

    public ResumeController(
            ResumeStorageService resumeStorageService,
            ResumeRepository resumeRepository,
            S3Presigner s3Presigner
    ) {
        this.resumeStorageService = resumeStorageService;
        this.resumeRepository = resumeRepository;
        this.s3Presigner = s3Presigner;
    }

    private boolean isJobSeeker(Jwt jwt) {
        if (jwt == null) {
            return false;
        }

        Object groupsClaim = jwt.getClaim("cognito:groups");

        return groupsClaim instanceof Collection<?> groups
                && groups.contains("JOB_SEEKER");
    }

    // Phase 5: Upload PDF to S3 and save metadata
    @PostMapping(
            value = "/upload",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE
    )
    public ResponseEntity<?> uploadResume(
            @RequestParam("file") MultipartFile file,
            @AuthenticationPrincipal Jwt jwt
    ) {
        if (jwt == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Authentication required"));
        }

        if (!isJobSeeker(jwt)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of(
                            "error", "Only job seekers can upload resumes"
                    ));
        }

        try {
            String userId = jwt.getSubject();

            String objectKey = resumeStorageService.uploadResume(
                    file,
                    userId
            );

            String originalFilename = file.getOriginalFilename();

            if (originalFilename == null || originalFilename.isBlank()) {
                originalFilename = "resume.pdf";
            }

            Resume resume = new Resume(
                    userId,
                    originalFilename,
                    objectKey
            );

            Resume savedResume = resumeRepository.save(resume);

            return ResponseEntity.ok(Map.of(
                    "message", "Resume uploaded successfully",
                    "resumeId", savedResume.getId(),
                    "objectKey", objectKey
            ));

        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", e.getMessage()));

        } catch (IOException e) {
            return ResponseEntity.status(
                    HttpStatus.INTERNAL_SERVER_ERROR
            ).body(Map.of(
                    "error", "Could not read the uploaded file"
            ));
        }
    }

    // Phase 6: Retrieve latest resume metadata
    @GetMapping("/my")
    public ResponseEntity<?> getMyResume(
            @AuthenticationPrincipal Jwt jwt
    ) {
        if (jwt == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Authentication required"));
        }

        if (!isJobSeeker(jwt)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of(
                            "error", "Only job seekers can view their resumes"
                    ));
        }

        return resumeRepository
                .findFirstByUserIdOrderByUploadedAtDesc(jwt.getSubject())
                .<ResponseEntity<?>>map(resume -> ResponseEntity.ok(
                        Map.of(
                                "resumeId", resume.getId(),
                                "originalFilename",
                                resume.getOriginalFilename(),
                                "uploadedAt",
                                resume.getUploadedAt().toString()
                        )
                ))
                .orElseGet(() -> ResponseEntity
                        .status(HttpStatus.NOT_FOUND)
                        .body(Map.of(
                                "error", "No resume uploaded yet"
                        )));
    }

    // Phase 7: Generate secure temporary PDF viewing URL
    @GetMapping("/my/download-url")
    public ResponseEntity<?> getMyResumeDownloadUrl(
            @AuthenticationPrincipal Jwt jwt
    ) {
        if (jwt == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Authentication required"));
        }

        if (!isJobSeeker(jwt)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of(
                            "error", "Only job seekers can view their resumes"
                    ));
        }

        return resumeRepository
                .findFirstByUserIdOrderByUploadedAtDesc(jwt.getSubject())
                .<ResponseEntity<?>>map(resume -> {

                    String objectKey = resume.getS3ObjectKey();

                    // Verify the S3 key belongs to this user
                    String expectedPrefix =
                            "resumes/" + jwt.getSubject() + "/";

                    if (objectKey == null
                            || !objectKey.startsWith(expectedPrefix)) {
                        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                                .body(Map.of(
                                        "error", "Resume access denied"
                                ));
                    }

                    try {
                        GetObjectRequest getObjectRequest =
                                GetObjectRequest.builder()
                                        .bucket(BUCKET_NAME)
                                        .key(objectKey)
                                        .responseContentType("application/pdf")
                                        .responseContentDisposition("inline")
                                        .build();

                        GetObjectPresignRequest presignRequest =
                                GetObjectPresignRequest.builder()
                                        .signatureDuration(
                                                Duration.ofMinutes(5)
                                        )
                                        .getObjectRequest(getObjectRequest)
                                        .build();

                        PresignedGetObjectRequest presignedRequest =
                                s3Presigner.presignGetObject(presignRequest);

                        return ResponseEntity.ok(Map.of(
                                "url",
                                presignedRequest.url().toString(),
                                "expiresInSeconds",
                                300
                        ));

                    } catch (SdkException e) {
                        return ResponseEntity.status(
                                HttpStatus.INTERNAL_SERVER_ERROR
                        ).body(Map.of(
                                "error",
                                "Unable to generate resume viewing URL"
                        ));
                    }
                })
                .orElseGet(() -> ResponseEntity
                        .status(HttpStatus.NOT_FOUND)
                        .body(Map.of(
                                "error", "No resume uploaded yet"
                        )));
    }
}
