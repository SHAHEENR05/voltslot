package com.chargeiq.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;

/** Swagger UI: http://localhost:8080/swagger-ui.html  (use the Authorize button and paste the JWT). */
@Configuration
public class OpenApiConfig {

    @Bean
    public OpenAPI chargeIqOpenApi() {
        return new OpenAPI()
                .info(new Info().title("VoltSlot API").version("1.0.0")
                        .description("Smart EV charging station locator, conflict-free slot booking, demand-aware "
                                + "recommendations, smart recharge reminders and analytics."))
                .addSecurityItem(new SecurityRequirement().addList("bearerAuth"))
                .components(new Components().addSecuritySchemes("bearerAuth",
                        new SecurityScheme().type(SecurityScheme.Type.HTTP).scheme("bearer").bearerFormat("JWT")));
    }
}
