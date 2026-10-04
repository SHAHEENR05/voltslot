package com.chargeiq.controller;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.chargeiq.dto.CommonDtos.PageResponse;
import com.chargeiq.dto.WalletDtos.TopupRequest;
import com.chargeiq.dto.WalletDtos.WalletDto;
import com.chargeiq.dto.WalletDtos.WalletTxnDto;
import com.chargeiq.security.AuthUser;
import com.chargeiq.service.WalletService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

/** REST layer of the prepaid wallet. */
@RestController
@RequestMapping("/api/wallet")
@Tag(name = "Wallet", description = "Prepaid wallet: balance, ledger and top-up")
public class WalletController {

    private final WalletService walletService;

    public WalletController(WalletService walletService) {
        this.walletService = walletService;
    }

    @GetMapping
    @Operation(summary = "Wallet balance and the five most recent transactions")
    public WalletDto wallet(@AuthenticationPrincipal AuthUser actor) {
        return walletService.get(actor.getId());
    }

    @GetMapping("/transactions")
    @Operation(summary = "Paged wallet ledger, newest first")
    public PageResponse<WalletTxnDto> transactions(@AuthenticationPrincipal AuthUser actor,
                                                   @RequestParam(name = "page", defaultValue = "0") int page,
                                                   @RequestParam(name = "size", defaultValue = "20") int size) {
        return walletService.transactions(actor.getId(), page, size);
    }

    @PostMapping("/topup")
    @Operation(summary = "Add money to the wallet (100 to 50,000, simulated payment)")
    public WalletDto topup(@AuthenticationPrincipal AuthUser actor, @Valid @RequestBody TopupRequest req) {
        return walletService.topup(actor.getId(), req.amount(), req.method());
    }
}
