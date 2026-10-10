-- Feature-owned schema; also applied to existing databases at application startup.
CREATE TABLE IF NOT EXISTS suggested_prompt_batch (
    batch_date DATE NOT NULL,
    product_type VARCHAR(32) NOT NULL,
    status VARCHAR(16) NOT NULL,
    prompts_json TEXT NULL,
    attempts INT NOT NULL DEFAULT 0,
    lease_owner VARCHAR(64) NULL,
    lease_until BIGINT NOT NULL DEFAULT 0,
    generated_at TIMESTAMP NULL,
    PRIMARY KEY (batch_date, product_type)
);
