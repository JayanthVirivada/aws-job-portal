
package com.jobportal.backend;

import java.io.IOException;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

@Service
public class ResumeStorageService {

    private static final String BUCKET_NAME =
            "jsolutions-resumes-2026-unique123";

    private static final long MAX_FILE_SIZE = 5 * 1024 * 1024;

    private final S3Client s3Client;

    public ResumeStorageService(S3Client s3Client) {
        this.s3Client = s3Client;
    }

    public String uploadResume(
            MultipartFile file,
            String userId
    ) throws IOException {

        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException(
                    "Please select a PDF resume."
            );
        }

        if (file.getSize() > MAX_FILE_SIZE) {
            throw new IllegalArgumentException(
                    "Resume must be smaller than 5 MB."
            );
        }

        if (!"application/pdf".equalsIgnoreCase(
                file.getContentType())) {
            throw new IllegalArgumentException(
                    "Only PDF resumes are allowed."
            );
        }

        byte[] bytes = file.getBytes();

        if (bytes.length < 5
                || bytes[0] != '%'
                || bytes[1] != 'P'
                || bytes[2] != 'D'
                || bytes[3] != 'F'
                || bytes[4] != '-') {
            throw new IllegalArgumentException(
                    "Invalid PDF file."
            );
        }

        String objectKey = "resumes/"
                + userId
                + "/"
                + UUID.randomUUID()
                + ".pdf";

        PutObjectRequest request = PutObjectRequest.builder()
                .bucket(BUCKET_NAME)
                .key(objectKey)
                .contentType("application/pdf")
                .build();

        s3Client.putObject(
                request,
                RequestBody.fromBytes(bytes)
        );

        return objectKey;
    }
}
