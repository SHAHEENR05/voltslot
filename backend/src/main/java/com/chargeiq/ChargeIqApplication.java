package com.chargeiq;

import java.util.TimeZone;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

/** Entry point of the VoltSlot back-end. */
@SpringBootApplication
@EnableScheduling
public class ChargeIqApplication {

    public static void main(String[] args) {
        // All timestamps in the database are naive Asia/Kolkata local times.
        TimeZone.setDefault(TimeZone.getTimeZone("Asia/Kolkata"));
        SpringApplication.run(ChargeIqApplication.class, args);
    }
}
