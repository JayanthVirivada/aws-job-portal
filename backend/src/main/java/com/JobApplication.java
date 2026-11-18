
package com.jobportal.backend;

import java.time.Instant;

import jakarta.persistence.*;

@Entity
@Table(
    name = "job_applications",
    uniqueConstraints = @UniqueConstraint(
        name = "uk_job_applicant",
        columnNames = {"job_id", "applicant_id"}
    )
)
public class JobApplication {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "job_id", nullable = false)
    private Long jobId;

    @Column(name = "applicant_id", nullable = false)
    private String applicantId;

    @Column(nullable = false)
    private String status = "APPLIED";

    @Column(name = "applied_at", nullable = false)
    private Instant appliedAt = Instant.now();

    public JobApplication() {
    }

    public Long getId() {
        return id;
    }

    public Long getJobId() {
        return jobId;
    }

    public void setJobId(Long jobId) {
        this.jobId = jobId;
    }

    public String getApplicantId() {
        return applicantId;
    }

    public void setApplicantId(String applicantId) {
        this.applicantId = applicantId;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public Instant getAppliedAt() {
        return appliedAt;
    }

    public void setAppliedAt(Instant appliedAt) {
        this.appliedAt = appliedAt;
    }
}
