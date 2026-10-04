package com.chargeiq.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

import com.chargeiq.entity.enums.WalletTxnType;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;

public final class WalletDtos {
    private WalletDtos() { }

    public record WalletTxnDto(Long id, WalletTxnType type, BigDecimal amount, BigDecimal balanceAfter, String reference,
                               LocalDateTime createdAt) { }

    public record WalletDto(BigDecimal balance, List<WalletTxnDto> recent) { }

    public record TopupRequest(
            @NotNull(message = "Amount is required")
            @DecimalMin(value = "100.00", message = "Minimum top-up is 100") @DecimalMax(value = "50000.00", message = "Maximum top-up is 50,000")
            BigDecimal amount,
            String method) { }
}
