package org.wwz.ai.infrastructure.adapter.repository;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Profile;
import org.springframework.core.io.ClassPathResource;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.stereotype.Repository;
import org.wwz.ai.domain.agent.suggestion.*;

import javax.sql.DataSource;
import java.time.*;
import java.util.List;

@Repository
@Profile("!test")
public class SuggestedPromptRepository implements ISuggestedPromptRepository {
    private final DataSource dataSource;
    private final JdbcTemplate jdbc;
    private final ObjectMapper json = new ObjectMapper();

    public SuggestedPromptRepository(@Qualifier("mysqlDataSource") DataSource dataSource) {
        this.dataSource = dataSource;
        this.jdbc = new JdbcTemplate(dataSource);
    }

    @jakarta.annotation.PostConstruct
    public void initialize() {
        new ResourceDatabasePopulator(new ClassPathResource("db/suggested_prompt_batch.sql")).execute(dataSource);
    }

    @Override
    public SuggestedPromptBatch latest(LocalDate date) {
        var batches = jdbc.query("SELECT batch_date, prompts_json FROM suggested_prompt_batch WHERE product_type='task' AND status='ready' AND batch_date<=? ORDER BY batch_date DESC LIMIT 1",
                (rs, row) -> SuggestedPromptBatch.parse(rs.getDate("batch_date").toLocalDate(), rs.getString("prompts_json"), List.of()), date);
        return batches.isEmpty() ? null : batches.get(0);
    }

    @Override
    public List<SuggestedPrompt> history(LocalDate fromInclusive, LocalDate toExclusive) {
        return jdbc.query("SELECT batch_date, prompts_json FROM suggested_prompt_batch WHERE product_type='task' AND status='ready' AND batch_date>=? AND batch_date<? ORDER BY batch_date",
                        (rs, row) -> SuggestedPromptBatch.parse(rs.getDate("batch_date").toLocalDate(), rs.getString("prompts_json"), List.of()), fromInclusive, toExclusive)
                .stream().flatMap(batch -> batch.items().stream()).toList();
    }

    @Override
    public boolean claim(LocalDate date, String owner, Instant now, int maxAttempts, Duration lease) {
        long nowMs = now.toEpochMilli();
        long leaseUntil = now.plus(lease).toEpochMilli();
        try {
            jdbc.update("INSERT INTO suggested_prompt_batch (batch_date,product_type,status,attempts,lease_owner,lease_until) VALUES (?,'task','generating',1,?,?)", date, owner, leaseUntil);
            return true;
        } catch (DuplicateKeyException existing) {
            return jdbc.update("UPDATE suggested_prompt_batch SET status='generating', attempts=attempts+1, lease_owner=?, lease_until=? WHERE batch_date=? AND product_type='task' AND status<>'ready' AND attempts<? AND lease_until<=?",
                    owner, leaseUntil, date, maxAttempts, nowMs) == 1;
        }
    }

    @Override
    public boolean publish(SuggestedPromptBatch batch, String owner) {
        try {
            return jdbc.update("UPDATE suggested_prompt_batch SET status='ready',prompts_json=?,generated_at=CURRENT_TIMESTAMP,lease_owner=NULL,lease_until=0 WHERE batch_date=? AND product_type='task' AND status='generating' AND lease_owner=?",
                    json.writeValueAsString(batch.items()), batch.date(), owner) == 1;
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("Cannot serialize suggested prompts", e);
        }
    }

    @Override
    public void fail(LocalDate date, String owner) {
        jdbc.update("UPDATE suggested_prompt_batch SET status='failed',lease_owner=NULL,lease_until=0 WHERE batch_date=? AND product_type='task' AND status='generating' AND lease_owner=?", date, owner);
    }
}
