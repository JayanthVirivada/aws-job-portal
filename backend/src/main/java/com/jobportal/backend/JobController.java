
package com.jobportal.backend;

import java.util.List;
import java.util.Objects;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/jobs")
public class JobController {

    private final JobRepository jobRepository;

    public JobController(JobRepository jobRepository) {
        this.jobRepository = jobRepository;
    }

    // ============================================
    // PUBLIC: VIEW ALL JOBS
    // ============================================

    @GetMapping
    public List<Job> getAllJobs() {
        return jobRepository.findAll();
    }

    // ============================================
    // PUBLIC: VIEW JOB BY ID
    // ============================================

    @GetMapping("/{id}")
    public ResponseEntity<Job> getJobById(
            @PathVariable Long id) {

        return jobRepository.findById(id)
                .map(ResponseEntity::ok)
                .orElseGet(() ->
                        ResponseEntity.notFound().build()
                );
    }

    // ============================================
    // EMPLOYER: CREATE A NEW JOB
    // ============================================

    @PostMapping
    public ResponseEntity<Job> createJob(
            @RequestBody Job request,
            @AuthenticationPrincipal Jwt jwt) {

        // Always create a new Job object.
        // Never trust a job ID supplied by the frontend.

        Job newJob = new Job();

        newJob.setTitle(request.getTitle());
        newJob.setCompany(request.getCompany());
        newJob.setLocation(request.getLocation());

        // Get the employer ID from the verified
        // Amazon Cognito access token.

        newJob.setEmployerId(jwt.getSubject());

        // PostgreSQL generates the new job ID.

        Job savedJob = jobRepository.save(newJob);

        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(savedJob);
    }

    // ============================================
    // EMPLOYER: UPDATE ONLY THEIR OWN JOB
    // ============================================

    @PutMapping("/{id}")
    public ResponseEntity<Job> updateJob(
            @PathVariable Long id,
            @RequestBody Job updatedJob,
            @AuthenticationPrincipal Jwt jwt) {

        return jobRepository.findById(id)
                .map(job -> {

                    // Verify job ownership.

                    if (!Objects.equals(
                            job.getEmployerId(),
                            jwt.getSubject())) {

                        return ResponseEntity
                                .status(HttpStatus.FORBIDDEN)
                                .<Job>build();
                    }

                    // Update permitted fields only.

                    job.setTitle(updatedJob.getTitle());
                    job.setCompany(updatedJob.getCompany());
                    job.setLocation(updatedJob.getLocation());

                    Job savedJob =
                            jobRepository.save(job);

                    return ResponseEntity.ok(savedJob);
                })
                .orElseGet(() ->
                        ResponseEntity.notFound().build()
                );
    }

    // ============================================
    // EMPLOYER: DELETE ONLY THEIR OWN JOB
    // ============================================

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteJob(
            @PathVariable Long id,
            @AuthenticationPrincipal Jwt jwt) {

        return jobRepository.findById(id)
                .map(job -> {

                    // Verify job ownership.

                    if (!Objects.equals(
                            job.getEmployerId(),
                            jwt.getSubject())) {

                        return ResponseEntity
                                .status(HttpStatus.FORBIDDEN)
                                .<Void>build();
                    }

                    // Delete the employer-owned job.

                    jobRepository.delete(job);

                    return ResponseEntity
                            .noContent()
                            .<Void>build();
                })
                .orElseGet(() ->
                        ResponseEntity.notFound().build()
                );
    }
}
