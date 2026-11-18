package com.jobportal.backend;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ResumeRepository extends JpaRepository<Resume, Long> {

    Optional<Resume> findFirstByUserIdOrderByUploadedAtDesc(String userId);

}
