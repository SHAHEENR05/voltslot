package com.chargeiq.entity;

import jakarta.persistence.*;
import com.chargeiq.entity.enums.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.Set;

/** Ledger line of a wallet (TOPUP / DEBIT / REFUND / PENALTY). */
@Entity
@Table(name = "wallet_transactions")
public class WalletTransaction {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "wallet_id", nullable = false) private Wallet wallet;
    @Enumerated(EnumType.STRING) @Column(nullable = false) private WalletTxnType txnType;
    @Column(nullable = false) private BigDecimal amount;
    @Column(nullable = false) private BigDecimal balanceAfter;
    @Column(length = 60) private String reference;
    @Column(nullable = false) private LocalDateTime createdAt;

    // ---- accessors ----
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Wallet getWallet() { return wallet; }
    public void setWallet(Wallet wallet) { this.wallet = wallet; }
    public WalletTxnType getTxnType() { return txnType; }
    public void setTxnType(WalletTxnType txnType) { this.txnType = txnType; }
    public BigDecimal getAmount() { return amount; }
    public void setAmount(BigDecimal amount) { this.amount = amount; }
    public BigDecimal getBalanceAfter() { return balanceAfter; }
    public void setBalanceAfter(BigDecimal balanceAfter) { this.balanceAfter = balanceAfter; }
    public String getReference() { return reference; }
    public void setReference(String reference) { this.reference = reference; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
