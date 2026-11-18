package com.jobportal.backend;

import java.time.Instant;
import jakarta.persistence.*;

@Entity
@Table(name = "resumes")
public class Resume {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private String userId;

    @Column(name = "original_filename", nullable = false)
    private String originalFilename;

    @Column(name = "s3_object_key", nullable = false, unique = true)
    private String s3ObjectKey;

    @Column(name = "uploaded_at", nullable = false)
    private Instant uploadedAt;

    public Resume() {
    }

    public Resume(String userId, String originalFilename, String s3ObjectKey) {
        this.userId = userId;
        this.originalFilename = originalFilename;
        this.s3ObjectKey = s3ObjectKey;
        this.uploadedAt = Instant.now();
    }

    public Long getId() {
        return id;
    }

    public String getUserId() {
        return userId;
    }

    public String getOriginalFilename() {
        return originalFilename;
    }

    public String getS3ObjectKey() {
        return s3ObjectKey;
    }

    public Instant getUploadedAt() {
        return uploadedAt;
    }
}
