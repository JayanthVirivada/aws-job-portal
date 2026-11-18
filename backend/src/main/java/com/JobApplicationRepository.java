
package com.jobportal.backend;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

public interface JobApplicationRepository
        extends JpaRepository<JobApplication, Long> {

    // Find all applications submitted by a Job Seeker
    List<JobApplication> findByApplicantId(String applicantId);

    // Find all applications for a particular job
    List<JobApplication> findByJobId(Long jobId);

    // Check whether a Job Seeker already applied
    boolean existsByJobIdAndApplicantId(
            Long jobId,
            String applicantId
    );

    // Retrieve a specific application belonging to a Job Seeker
    Optional<JobApplication> findByJobIdAndApplicantId(
            Long jobId,
            String applicantId
    );
}

