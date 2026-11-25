package com.jobportal.backend;

import java.io.IOException;
import java.util.Map;
import java.util.Objects;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/jobs")
public class LogoController {

    private final JobRepository jobRepository;
    private final LogoStorageService logoStorageService;

    public LogoController(
            JobRepository jobRepository,
            LogoStorageService logoStorageService) {

        this.jobRepository = jobRepository;
        this.logoStorageService = logoStorageService;
    }

    @PostMapping(
        value = "/{id}/logo",
        consumes = MediaType.MULTIPART_FORM_DATA_VALUE
    )
    public ResponseEntity<?> uploadLogo(
            @PathVariable Long id,
            @RequestParam("file") MultipartFile file,
            @AuthenticationPrincipal Jwt jwt
    ) throws IOException {

        Job job = jobRepository.findById(id).orElse(null);

        if (job == null) {
            return ResponseEntity.notFound().build();
        }

        if (!Objects.equals(
                job.getEmployerId(), jwt.getSubject())) {

            return ResponseEntity
                    .status(HttpStatus.FORBIDDEN)
                    .build();
        }

        try {
            String key = logoStorageService.uploadLogo(
                    file, jwt.getSubject(), id
            );

            String oldKey = job.getLogoKey();

            job.setLogoKey(key);
            jobRepository.save(job);

            logoStorageService.deleteLogo(
                    oldKey, jwt.getSubject(), id
            );

            return ResponseEntity.ok(
                    Map.of("message", "Logo uploaded successfully")
            );

        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("message", e.getMessage()));
        }
    }

    @GetMapping("/{id}/logo")
    public ResponseEntity<byte[]> getLogo(
            @PathVariable Long id) {

        Job job = jobRepository.findById(id).orElse(null);

        if (job == null || job.getLogoKey() == null) {
            return ResponseEntity.notFound().build();
        }

        String key = job.getLogoKey();

        String expectedPrefix = "logos/"
                + job.getEmployerId() + "/" + id + "/";

        if (!key.startsWith(expectedPrefix)) {
            return ResponseEntity.notFound().build();
        }

        MediaType type = key.endsWith(".png")
                ? MediaType.IMAGE_PNG
                : MediaType.IMAGE_JPEG;

        return ResponseEntity.ok()
                .contentType(type)
                .header("X-Content-Type-Options", "nosniff")
                .body(logoStorageService.readLogo(key));
    }
}