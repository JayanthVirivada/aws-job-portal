package com.jobportal.backend;

import java.io.IOException;
import java.io.ByteArrayInputStream;
import java.awt.image.BufferedImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;
import java.util.Iterator;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;

@Service
public class LogoStorageService {

    private static final String BUCKET =
            "jsolutions-resumes-2026-unique123";

    private static final long MAX_SIZE = 1024 * 1024;

    private final S3Client s3Client;

    public LogoStorageService(S3Client s3Client) {
        this.s3Client = s3Client;
    }

    public String uploadLogo(
            MultipartFile file,
            String employerId,
            Long jobId
    ) throws IOException {

        if (file == null || file.isEmpty()
                || file.getSize() > MAX_SIZE) {
            throw new IllegalArgumentException(
                    "Logo must be between 1 byte and 1 MB."
            );
        }

        byte[] bytes = file.getBytes();

        boolean png = bytes.length >= 8
                && (bytes[0] & 255) == 137
                && bytes[1] == 80
                && bytes[2] == 78
                && bytes[3] == 71
                && bytes[4] == 13
                && bytes[5] == 10
                && bytes[6] == 26
                && bytes[7] == 10;

        boolean jpeg = bytes.length >= 3
                && (bytes[0] & 255) == 255
                && (bytes[1] & 255) == 216
                && (bytes[2] & 255) == 255;

        String type = file.getContentType();

        if (!(png && "image/png".equals(type))
                && !(jpeg && "image/jpeg".equals(type))) {
            throw new IllegalArgumentException(
                    "Only PNG and JPEG logos are allowed."
            );
        }

        try (ImageInputStream stream = ImageIO.createImageInputStream(
                new ByteArrayInputStream(bytes))) {

            if (stream == null) {
                throw new IllegalArgumentException("Invalid image.");
            }

            Iterator<ImageReader> readers =
                    ImageIO.getImageReaders(stream);

            if (!readers.hasNext()) {
                throw new IllegalArgumentException("Invalid image.");
            }

            ImageReader reader = readers.next();

            try {
                reader.setInput(stream, true, true);

                int width = reader.getWidth(0);
                int height = reader.getHeight(0);

                if (width <= 0 || height <= 0
                        || width > 2048 || height > 2048) {
                    throw new IllegalArgumentException(
                            "Logo dimensions must not exceed 2048 x 2048."
                    );
                }

                BufferedImage image = reader.read(0);

                if (image == null) {
                    throw new IllegalArgumentException("Invalid image.");
                }

            } finally {
                reader.dispose();
            }

        } catch (IOException e) {
            throw new IllegalArgumentException(
                    "Invalid or corrupted image."
            );
        }

        String key = "logos/" + employerId
                + "/" + jobId
                + "/" + UUID.randomUUID()
                + (png ? ".png" : ".jpg");

        s3Client.putObject(
                PutObjectRequest.builder()
                        .bucket(BUCKET)
                        .key(key)
                        .contentType(type)
                        .build(),
                RequestBody.fromBytes(bytes)
        );

        return key;
    }

    private static final Logger log =
            LoggerFactory.getLogger(LogoStorageService.class);

    public void deleteLogo(
            String key, String employerId, Long jobId) {

        String prefix = "logos/" + employerId
                + "/" + jobId + "/";

        if (key == null || !key.startsWith(prefix)) {
            return;
        }

        try {
            s3Client.deleteObject(
                    DeleteObjectRequest.builder()
                            .bucket(BUCKET)
                            .key(key)
                            .build()
            );
        } catch (RuntimeException e) {
            log.warn("Logo cleanup failed for job {}", jobId, e);
        }
    }

    public byte[] readLogo(String key) {

        if (key == null || !key.startsWith("logos/")) {
            throw new IllegalArgumentException(
                    "Invalid logo reference."
            );
        }

        return s3Client.getObjectAsBytes(
                GetObjectRequest.builder()
                        .bucket(BUCKET)
                        .key(key)
                        .build()
        ).asByteArray();
    }
}