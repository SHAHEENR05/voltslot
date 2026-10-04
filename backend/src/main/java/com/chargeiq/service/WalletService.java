package com.chargeiq.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.chargeiq.clock.AppClock;
import com.chargeiq.dto.CommonDtos.PageResponse;
import com.chargeiq.dto.WalletDtos.WalletDto;
import com.chargeiq.dto.WalletDtos.WalletTxnDto;
import com.chargeiq.entity.User;
import com.chargeiq.entity.Wallet;
import com.chargeiq.entity.WalletTransaction;
import com.chargeiq.entity.enums.WalletTxnType;
import com.chargeiq.exception.BadRequestException;
import com.chargeiq.exception.InsufficientBalanceException;
import com.chargeiq.exception.ResourceNotFoundException;
import com.chargeiq.repository.UserRepository;
import com.chargeiq.repository.WalletRepository;
import com.chargeiq.repository.WalletTransactionRepository;

/**
 * Prepaid wallet of a user (one-to-one with {@link User}).
 * <p>
 * Every balance change is written as a {@link WalletTransaction} (an immutable ledger line), so the balance can
 * always be explained. Debits take a <b>pessimistic row lock</b> on the wallet so that two parallel payments can
 * never spend the same money twice.
 */
@Service
@Transactional
public class WalletService {

    private static final BigDecimal MIN_TOPUP = new BigDecimal("100");
    private static final BigDecimal MAX_TOPUP = new BigDecimal("50000");

    private final WalletRepository wallets;
    private final WalletTransactionRepository txns;
    private final UserRepository users;
    private final AppClock clock;

    public WalletService(WalletRepository wallets, WalletTransactionRepository txns, UserRepository users, AppClock clock) {
        this.wallets = wallets;
        this.txns = txns;
        this.users = users;
        this.clock = clock;
    }

    /** Balance plus the last five ledger lines. */
    public WalletDto get(Long userId) {
        Wallet w = walletOf(userId);
        List<WalletTxnDto> recent = txns.findTop5ByWalletIdOrderByCreatedAtDesc(w.getId()).stream()
                .map(WalletService::toDto).toList();
        return new WalletDto(w.getBalance(), recent);
    }

    /** Paged ledger, newest first. */
    @Transactional(readOnly = true)
    public PageResponse<WalletTxnDto> transactions(Long userId, int page, int size) {
        Wallet w = walletOf(userId);
        Page<WalletTransaction> p = txns.findByWalletIdOrderByCreatedAtDesc(w.getId(),
                PageRequest.of(Math.max(0, page), Math.min(Math.max(1, size), 100)));
        return PageResponse.of(p.map(WalletService::toDto));
    }

    /** Adds money (simulated payment gateway). Allowed range 100 .. 50,000 per top-up. */
    public WalletDto topup(Long userId, BigDecimal amount, String method) {
        if (amount == null || amount.compareTo(MIN_TOPUP) < 0 || amount.compareTo(MAX_TOPUP) > 0) {
            throw new BadRequestException("Top-up amount must be between 100 and 50,000");
        }
        String m = (method == null || method.isBlank()) ? "UPI" : method.trim().toUpperCase();
        if (m.length() > 20) {
            m = m.substring(0, 20);
        }
        credit(userId, amount, WalletTxnType.TOPUP, "TOPUP-" + m);
        return get(userId);
    }

    /** Returns the wallet of the user, creating an empty one if it does not exist yet. */
    public Wallet ensureWallet(User user) {
        return wallets.findByUserId(user.getId()).orElseGet(() -> {
            Wallet w = new Wallet();
            w.setUser(user);
            w.setBalance(BigDecimal.ZERO.setScale(2));
            w.setUpdatedAt(clock.now());
            return wallets.save(w);
        });
    }

    /**
     * Takes money out of the wallet.
     *
     * @return the new balance
     * @throws InsufficientBalanceException (HTTP 402) when the balance is too low
     */
    public BigDecimal debit(Long userId, BigDecimal amount, String reference) {
        BigDecimal amt = scale(amount);
        // SELECT ... FOR UPDATE : concurrent payments of the same user queue up here.
        Wallet w = lockWallet(userId);
        if (w.getBalance().compareTo(amt) < 0) {
            throw new InsufficientBalanceException("Insufficient wallet balance: need " + amt
                    + " but only " + w.getBalance() + " available. Please top up your wallet.");
        }
        BigDecimal after = w.getBalance().subtract(amt);
        w.setBalance(after);
        w.setUpdatedAt(clock.now());
        wallets.save(w);
        record(w, WalletTxnType.DEBIT, amt, after, reference);
        return after;
    }

    /**
     * Puts money into the wallet (refund or top-up).
     *
     * @return the new balance
     */
    public BigDecimal credit(Long userId, BigDecimal amount, WalletTxnType type, String reference) {
        BigDecimal amt = scale(amount);
        Wallet w = lockWallet(userId);
        BigDecimal after = w.getBalance().add(amt);
        w.setBalance(after);
        w.setUpdatedAt(clock.now());
        wallets.save(w);
        record(w, type, amt, after, reference);
        return after;
    }

    // ------------------------------------------------------------------ helpers

    private Wallet walletOf(Long userId) {
        return wallets.findByUserId(userId).orElseGet(() -> ensureWallet(
                users.findById(userId).orElseThrow(() -> new ResourceNotFoundException("User", userId))));
    }

    /**
     * Locks the wallet row. The locking query must be the FIRST thing that loads the wallet in this persistence
     * context: if the entity were already cached (e.g. by findByUserId) Hibernate would keep the stale balance
     * and a parallel payment could be lost. Only when no wallet exists yet do we create one and lock again.
     */
    private Wallet lockWallet(Long userId) {
        Optional<Wallet> locked = wallets.lockByUserId(userId);
        if (locked.isPresent()) {
            return locked.get();
        }
        ensureWallet(users.findById(userId).orElseThrow(() -> new ResourceNotFoundException("User", userId)));
        return wallets.lockByUserId(userId).orElseThrow(() -> new ResourceNotFoundException("Wallet", userId));
    }

    private void record(Wallet w, WalletTxnType type, BigDecimal amount, BigDecimal balanceAfter, String reference) {
        WalletTransaction t = new WalletTransaction();
        t.setWallet(w);
        t.setTxnType(type);
        t.setAmount(amount);            // always stored positive; the type tells the direction
        t.setBalanceAfter(balanceAfter);
        t.setReference(reference != null && reference.length() > 60 ? reference.substring(0, 60) : reference);
        t.setCreatedAt(clock.now());
        txns.save(t);
    }

    private static BigDecimal scale(BigDecimal v) {
        if (v == null || v.signum() < 0) {
            throw new BadRequestException("Amount must not be negative");
        }
        return v.setScale(2, RoundingMode.HALF_UP);
    }

    static WalletTxnDto toDto(WalletTransaction t) {
        return new WalletTxnDto(t.getId(), t.getTxnType(), t.getAmount(), t.getBalanceAfter(), t.getReference(),
                t.getCreatedAt());
    }
}
