package com.chargeiq.repository;

import com.chargeiq.entity.*;
import com.chargeiq.entity.enums.*;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

/** Spring Data JPA repository: CRUD + derived and JPQL queries for users. */
public interface UserRepository extends JpaRepository<User, Long> {
    Optional<User> findByEmailIgnoreCase(String email);

    boolean existsByEmailIgnoreCase(String email);

    @Query("select u from User u where (lower(u.fullName) like :q or lower(u.email) like :q) "
            + "and u.role in :roles and u.status in :statuses")
    Page<User> search(@Param("q") String q, @Param("roles") Collection<Role> roles,
                      @Param("statuses") Collection<UserStatus> statuses, Pageable pageable);

    long countByRole(Role role);

    List<User> findByRole(Role role);
}
