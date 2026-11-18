
package com.jobportal.backend;

import java.util.List;
import java.util.Map;
import java.util.Objects;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/applications")
public class JobApplicationController {

    private final JobApplicationRepository applicationRepository;
    private final JobRepository jobRepository;

    public JobApplicationController(
            JobApplicationRepository applicationRepository,
            JobRepository jobRepository) {

        this.applicationRepository = applicationRepository;
        this.jobRepository = jobRepository;
    }

    private boolean hasRole(Jwt jwt, String role) {
        if (jwt == null) {
            return false;
        }

        List<String> groups =
            jwt.getClaimAsStringList("cognito:groups");

        return groups != null && groups.contains(role);
    }

    // JOB SEEKER: APPLY FOR JOB

    @PostMapping
    public ResponseEntity<?> applyForJob(
            @RequestBody Map<String, Long> request,
            @AuthenticationPrincipal Jwt jwt) {

        if (!hasRole(jwt, "JOB_SEEKER")) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body("Only job seekers can apply.");
        }

        Long jobId = request.get("jobId");

        if (jobId == null) {
            return ResponseEntity.badRequest()
                .body("Job ID is required.");
        }

        if (!jobRepository.existsById(jobId)) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body("Job not found.");
        }

        String applicantId = jwt.getSubject();

        if (applicationRepository
                .existsByJobIdAndApplicantId(jobId, applicantId)) {

            return ResponseEntity.status(HttpStatus.CONFLICT)
                .body("You have already applied for this job.");
        }

        JobApplication application = new JobApplication();

        application.setJobId(jobId);
        application.setApplicantId(applicantId);
        application.setStatus("APPLIED");

        JobApplication saved =
            applicationRepository.save(application);

        return ResponseEntity.status(HttpStatus.CREATED)
            .body(saved);
    }

    // JOB SEEKER: MY APPLICATIONS

    @GetMapping("/my")
    public ResponseEntity<?> getMyApplications(
            @AuthenticationPrincipal Jwt jwt) {

        if (!hasRole(jwt, "JOB_SEEKER")) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body("Only job seekers can view applications.");
        }

        return ResponseEntity.ok(
            applicationRepository.findByApplicantId(
                jwt.getSubject()
            )
        );
    }

    // EMPLOYER: VIEW APPLICANTS

    @GetMapping("/job/{jobId}")
    public ResponseEntity<?> getApplicationsForJob(
            @PathVariable Long jobId,
            @AuthenticationPrincipal Jwt jwt) {

        if (!hasRole(jwt, "EMPLOYER")) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body("Only employers can view applicants.");
        }

        var optionalJob = jobRepository.findById(jobId);

        if (optionalJob.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body("Job not found.");
        }

        Job job = optionalJob.get();

        String employerId = jwt.getSubject();
        String ownerId = job.getEmployerId();

        if (!Objects.equals(ownerId, employerId)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body("You do not own this job.");
        }

        List<JobApplication> applications =
            applicationRepository.findByJobId(jobId);

        return ResponseEntity.ok(applications);
    }
}
