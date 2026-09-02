-- MySQL 8.0 schema for Claims Copilot POC (production target).
-- SQLite is used in dev (DB_KIND=sqlite). Set DB_KIND=mysql to activate this path.
-- InnoDB Cluster HA satisfies NFR-13 to NFR-18.

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ── Org hierarchy ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS org_nodes (
    org_node     VARCHAR(128) PRIMARY KEY,
    parent_node  VARCHAR(128),
    path         VARCHAR(1024) NOT NULL,
    level        VARCHAR(32)   NOT NULL,
    display_name VARCHAR(255)  NOT NULL,
    country_code CHAR(2),
    INDEX ix_org_path (path(255))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Personas (demo/dev only — production uses Okta) ────────────────────────────
CREATE TABLE IF NOT EXISTS personas (
    persona_id  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(128) NOT NULL,
    example_role VARCHAR(128) NOT NULL,
    level       VARCHAR(32)  NOT NULL,
    org_node    VARCHAR(128),
    groups_csv  TEXT         NOT NULL DEFAULT '',
    locale      VARCHAR(16)  NOT NULL DEFAULT 'en-US'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Field registry (Exhibit 5 attribute model — NFR-45) ────────────────────────
CREATE TABLE IF NOT EXISTS field_registry (
    field_key                VARCHAR(64)  PRIMARY KEY,
    label_token              VARCHAR(128) NOT NULL,
    available_in_meridian    TINYINT(1)   NOT NULL DEFAULT 1,
    dynamic_category         VARCHAR(64),
    is_pii                   TINYINT(1)   NOT NULL DEFAULT 0,
    in_analytics_model       TINYINT(1)   NOT NULL DEFAULT 1,
    show_on_claim_list       TINYINT(1)   NOT NULL DEFAULT 0,
    show_on_claim_record     TINYINT(1)   NOT NULL DEFAULT 1,
    show_on_client_analytics TINYINT(1)   NOT NULL DEFAULT 0,
    c2s_order                SMALLINT     NOT NULL DEFAULT 99,
    default_visibility       VARCHAR(16)  NOT NULL DEFAULT 'show',
    value_type               VARCHAR(32)  NOT NULL DEFAULT 'text'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Policies (ODS-sourced; FNOL Step 2) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS policies (
    policy_id             VARCHAR(64)  PRIMARY KEY,
    org_node              VARCHAR(128) NOT NULL,
    carrier_name          VARCHAR(128),
    carrier_policy_number VARCHAR(64),
    cover_number          VARCHAR(32),
    agreement_version     VARCHAR(16),
    product_line          VARCHAR(64)  NOT NULL,
    effective_date        DATE,
    expiration_date       DATE,
    active_for_fnol       TINYINT(1)   NOT NULL DEFAULT 1,
    aon_contact_name      VARCHAR(128),
    aon_contact_email     VARCHAR(255),
    INDEX ix_policies_org (org_node)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Claims ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS claims (
    aon_claim_id             VARCHAR(32)  PRIMARY KEY,
    org_node                 VARCHAR(128) NOT NULL,
    client_claim_ref         VARCHAR(64),
    status                   VARCHAR(32)  NOT NULL,
    sub_status               VARCHAR(64),
    claim_type               VARCHAR(16)  NOT NULL DEFAULT 'Claim',
    is_draft                 TINYINT(1)   NOT NULL DEFAULT 0,
    global_product           VARCHAR(64)  NOT NULL,
    global_product_category  VARCHAR(64),
    carrier                  VARCHAR(128),
    carrier_policy_number    VARCHAR(64),
    named_insured            VARCHAR(255),
    date_of_loss             DATE         NOT NULL,
    date_reported_to_aon     DATE,
    date_reported_to_carrier DATE,
    gross_incurred           DECIMAL(15,2) NOT NULL DEFAULT 0,
    total_paid               DECIMAL(15,2) NOT NULL DEFAULT 0,
    total_outstanding        DECIMAL(15,2) NOT NULL DEFAULT 0,
    applicable_deductible    DECIMAL(15,2),
    sir_amount               DECIMAL(15,2),
    loss_description         TEXT,
    cause_of_loss            VARCHAR(128),
    consequence_of_loss      VARCHAR(128),
    loss_country             VARCHAR(64),
    loss_city                VARCHAR(128),
    loss_address             VARCHAR(255),
    aon_claim_lead           VARCHAR(128),
    aon_claim_lead_email     VARCHAR(255),
    restricted_access        TINYINT(1)   NOT NULL DEFAULT 0,
    submitted_by             VARCHAR(128),
    submitted_at             DATETIME,
    currency_code            CHAR(3)      NOT NULL DEFAULT 'USD',
    INDEX ix_claims_org (org_node),
    INDEX ix_claims_status (status),
    INDEX ix_claims_date_of_loss (date_of_loss)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Documents (Pillar 1 — audience + security gating) ─────────────────────────
CREATE TABLE IF NOT EXISTS documents (
    doc_id        VARCHAR(64)  PRIMARY KEY,
    claim_id      VARCHAR(32)  NOT NULL,
    doc_name      VARCHAR(255) NOT NULL,
    doc_type      VARCHAR(64),
    audience      VARCHAR(32)  NOT NULL,           -- client_visible | internal | carrier_only
    provenance    VARCHAR(64),                      -- BR-008
    security_attr VARCHAR(32)  NOT NULL DEFAULT 'default',
    ecm_reference VARCHAR(512) NOT NULL,            -- NEVER returned to client
    size_bytes    BIGINT       NOT NULL DEFAULT 0,
    uploaded_at   DATETIME,
    INDEX ix_docs_claim (claim_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── FNOL outbox (resilient submission path — NFR-37) ──────────────────────────
CREATE TABLE IF NOT EXISTS fnol_outbox (
    submission_id   VARCHAR(64)  PRIMARY KEY,
    idempotency_key VARCHAR(64)  UNIQUE NOT NULL,
    org_node        VARCHAR(128) NOT NULL,
    payload_json    MEDIUMTEXT   NOT NULL,
    state           VARCHAR(16)  NOT NULL DEFAULT 'queued',  -- queued | sent | failed
    attempts        SMALLINT     NOT NULL DEFAULT 0,
    last_error      TEXT,
    aon_claim_id    VARCHAR(32),
    created_at      DATETIME     NOT NULL,
    sent_at         DATETIME,
    INDEX ix_outbox_state (state)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Audit log (NFR-04 / BR-001 denied-access evidence) ────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
    id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    actor_sub     VARCHAR(128),
    action        VARCHAR(64)  NOT NULL,
    resource_type VARCHAR(32),
    resource_id   VARCHAR(64),
    org_node      VARCHAR(128),
    outcome       VARCHAR(16)  NOT NULL DEFAULT 'allowed',
    ts            DATETIME     NOT NULL,
    INDEX ix_audit_actor (actor_sub),
    INDEX ix_audit_resource (resource_type, resource_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Notifications ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
    notification_id VARCHAR(64)  PRIMARY KEY,
    recipient_sub   VARCHAR(128) NOT NULL,
    org_node        VARCHAR(128),
    event_type      VARCHAR(64)  NOT NULL,
    claim_id        VARCHAR(32),
    title           TEXT         NOT NULL,
    body            TEXT,
    is_read         TINYINT(1)   NOT NULL DEFAULT 0,
    created_at      DATETIME     NOT NULL,
    INDEX ix_notif_recipient (recipient_sub),
    INDEX ix_notif_claim (claim_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS = 1;
