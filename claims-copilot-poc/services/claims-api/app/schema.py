"""DDL. Written to be portable between SQLite (POC) and MySQL (production target)."""

SCHEMA = [
    # ── Phase 1: explicit tenancy ────────────────────────────────────────────
    # The RFP targets ~100 clients in 2026 scaling to the wider Commercial Risk book
    # in 2027 (Scale and Rollout Assumptions, p. 11). Isolation by hierarchy path
    # alone would be a single point of failure protecting Confidential data across
    # every tenant, so client_id is carried explicitly and checked alongside the path.
    """
    CREATE TABLE IF NOT EXISTS clients (
        client_id     TEXT PRIMARY KEY,
        legal_name    TEXT NOT NULL,
        display_name  TEXT NOT NULL,
        status        TEXT NOT NULL DEFAULT 'active',
        home_country  TEXT,
        onboarded_at  TEXT
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS org_nodes (
        org_node      TEXT PRIMARY KEY,
        parent_node   TEXT,
        path          TEXT NOT NULL,
        level         TEXT NOT NULL,
        display_name  TEXT NOT NULL,
        country_code  TEXT
    )
    """,
    "CREATE INDEX IF NOT EXISTS ix_org_path ON org_nodes(path)",
    """
    CREATE TABLE IF NOT EXISTS personas (
        persona_id    INTEGER PRIMARY KEY,
        name          TEXT NOT NULL,
        example_role  TEXT NOT NULL,
        level         TEXT NOT NULL,
        org_node      TEXT,
        groups_csv    TEXT NOT NULL DEFAULT '',
        locale        TEXT NOT NULL DEFAULT 'en-US'
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS field_registry (
        field_key                TEXT PRIMARY KEY,
        label_token              TEXT NOT NULL,
        available_in_meridian    INTEGER NOT NULL DEFAULT 1,
        dynamic_category         TEXT,
        is_pii                   INTEGER NOT NULL DEFAULT 0,
        in_analytics_model       INTEGER NOT NULL DEFAULT 1,
        show_on_claim_list       INTEGER NOT NULL DEFAULT 0,
        show_on_claim_record     INTEGER NOT NULL DEFAULT 1,
        show_on_client_analytics INTEGER NOT NULL DEFAULT 0,
        c2s_order                INTEGER NOT NULL DEFAULT 99,
        default_visibility       TEXT NOT NULL DEFAULT 'show',
        value_type               TEXT NOT NULL DEFAULT 'text'
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS policies (
        policy_id             TEXT PRIMARY KEY,
        org_node              TEXT NOT NULL,
        carrier_name          TEXT,
        carrier_policy_number TEXT,
        cover_number          TEXT,
        agreement_version     TEXT,
        product_line          TEXT NOT NULL,
        effective_date        TEXT,
        expiration_date       TEXT,
        active_for_fnol       INTEGER NOT NULL DEFAULT 1,
        aon_contact_name      TEXT,
        aon_contact_email     TEXT
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS claims (
        aon_claim_id             TEXT PRIMARY KEY,
        org_node                 TEXT NOT NULL,
        client_claim_ref         TEXT,
        status                   TEXT NOT NULL,
        sub_status               TEXT,
        claim_type               TEXT NOT NULL DEFAULT 'Claim',
        is_draft                 INTEGER NOT NULL DEFAULT 0,
        global_product           TEXT NOT NULL,
        global_product_category  TEXT,
        carrier                  TEXT,
        carrier_policy_number    TEXT,
        named_insured            TEXT,
        date_of_loss             TEXT NOT NULL,
        date_reported_to_aon     TEXT,
        date_reported_to_carrier TEXT,
        gross_incurred           REAL NOT NULL DEFAULT 0,
        total_paid               REAL NOT NULL DEFAULT 0,
        total_outstanding        REAL NOT NULL DEFAULT 0,
        applicable_deductible    REAL,
        sir_amount               REAL,
        loss_description         TEXT,
        cause_of_loss            TEXT,
        consequence_of_loss      TEXT,
        loss_country             TEXT,
        loss_city                TEXT,
        loss_address             TEXT,
        loss_latitude            REAL,
        loss_longitude           REAL,
        aon_claim_lead           TEXT,
        aon_claim_lead_email     TEXT,
        restricted_access        INTEGER NOT NULL DEFAULT 0,
        submitted_by             TEXT,
        submitted_at             TEXT,
        currency_code            TEXT NOT NULL DEFAULT 'USD'
    )
    """,
    "CREATE INDEX IF NOT EXISTS ix_claims_org ON claims(org_node)",
    """
    CREATE TABLE IF NOT EXISTS documents (
        doc_id        TEXT PRIMARY KEY,
        claim_id      TEXT NOT NULL,
        doc_name      TEXT NOT NULL,
        doc_type      TEXT,
        audience      TEXT NOT NULL,
        provenance    TEXT,
        security_attr TEXT NOT NULL DEFAULT 'default',
        ecm_reference TEXT NOT NULL,
        size_bytes    INTEGER NOT NULL DEFAULT 0,
        uploaded_at   TEXT
    )
    """,
    "CREATE INDEX IF NOT EXISTS ix_docs_claim ON documents(claim_id)",
    """
    CREATE TABLE IF NOT EXISTS fnol_outbox (
        submission_id   TEXT PRIMARY KEY,
        idempotency_key TEXT UNIQUE NOT NULL,
        org_node        TEXT NOT NULL,
        payload_json    TEXT NOT NULL,
        state           TEXT NOT NULL DEFAULT 'queued',
        attempts        INTEGER NOT NULL DEFAULT 0,
        last_error      TEXT,
        aon_claim_id    TEXT,
        created_at      TEXT,
        sent_at         TEXT
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS saved_views (
        view_id      TEXT PRIMARY KEY,
        owner_sub    TEXT NOT NULL,
        owner_name   TEXT,
        org_node     TEXT NOT NULL,
        name         TEXT NOT NULL,
        filters_json TEXT NOT NULL,
        is_shared    INTEGER NOT NULL DEFAULT 0,
        created_at   TEXT NOT NULL,
        updated_at   TEXT
    )
    """,
    "CREATE INDEX IF NOT EXISTS ix_views_owner ON saved_views(owner_sub)",
    "CREATE INDEX IF NOT EXISTS ix_views_shared ON saved_views(is_shared, org_node)",
    """
    CREATE TABLE IF NOT EXISTS audit_log (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        actor_sub     TEXT,
        action        TEXT NOT NULL,
        resource_type TEXT,
        resource_id   TEXT,
        org_node      TEXT,
        outcome       TEXT NOT NULL DEFAULT 'allowed',
        ts            TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS notifications (
        notification_id TEXT PRIMARY KEY,
        recipient_sub   TEXT NOT NULL,
        org_node        TEXT,
        event_type      TEXT NOT NULL,
        claim_id        TEXT,
        title           TEXT NOT NULL,
        body            TEXT,
        is_read         INTEGER NOT NULL DEFAULT 0,
        created_at      TEXT NOT NULL
    )
    """,
    "CREATE INDEX IF NOT EXISTS ix_notif_recipient ON notifications(recipient_sub)",
    # ── F9: dashboard personalisation ────────────────────────────────────────
    # Preferences are keyed on the token subject rather than a device, which is what
    # makes them follow the user between browsers and devices for free.
    """
    CREATE TABLE IF NOT EXISTS user_preferences (
        user_sub    TEXT PRIMARY KEY,
        prefs_json  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
    )
    """,
    # ── F9: in-context adjuster messaging ────────────────────────────────────
    # `audience` mirrors the document model: an internal Aon note lives on the same
    # thread as client correspondence and is filtered server-side, never in the UI.
    """
    CREATE TABLE IF NOT EXISTS claim_messages (
        message_id   TEXT PRIMARY KEY,
        claim_id     TEXT NOT NULL,
        org_node     TEXT NOT NULL,
        author_sub   TEXT NOT NULL,
        author_name  TEXT NOT NULL,
        author_role  TEXT NOT NULL DEFAULT 'client',
        body         TEXT NOT NULL,
        audience     TEXT NOT NULL DEFAULT 'client_visible',
        created_at   TEXT NOT NULL
    )
    """,
    "CREATE INDEX IF NOT EXISTS ix_msg_claim ON claim_messages(claim_id)",
    # ── F9: cross-device draft continuity ────────────────────────────────────
    # The wizard state is held as JSON so the draft shape stays decoupled from the
    # form config: adding a field to config/fnol-forms never migrates this table.
    """
    CREATE TABLE IF NOT EXISTS fnol_drafts (
        draft_id      TEXT PRIMARY KEY,
        owner_sub     TEXT NOT NULL,
        org_node      TEXT NOT NULL,
        site_org_node TEXT,
        label         TEXT,
        payload_json  TEXT NOT NULL,
        current_step  INTEGER NOT NULL DEFAULT 1,
        last_device   TEXT,
        created_at    TEXT NOT NULL,
        updated_at    TEXT NOT NULL
    )
    """,
    "CREATE INDEX IF NOT EXISTS ix_drafts_owner ON fnol_drafts(owner_sub)",
    # ── Epic 1: claim pinning ────────────────────────────────────────────────
    # A pin is per-user, not per-claim: two people watching the same claim must not
    # see each other's pins, and un-pinning must never mutate the claim itself.
    # The org_node is denormalised from the claim so a pin can be filtered by the
    # caller's scope without joining, and so a pin left behind by a scope change
    # cannot resurface a claim the user has since lost access to.
    """
    CREATE TABLE IF NOT EXISTS claim_pins (
        user_sub   TEXT NOT NULL,
        claim_id   TEXT NOT NULL,
        org_node   TEXT NOT NULL,
        note       TEXT,
        created_at TEXT NOT NULL,
        PRIMARY KEY (user_sub, claim_id)
    )
    """,
    "CREATE INDEX IF NOT EXISTS ix_pins_user ON claim_pins(user_sub, created_at)",
    # ── Epic 8: notification delivery attempts ───────────────────────────────
    # Email and SMS cannot be sent from the POC - there is no provider, sender domain
    # or consent record. Rather than pretend, every channel the rules engine selects
    # is recorded here with its outcome, so the routing decision is auditable and the
    # only thing production adds is a transport that drains this table.
    """
    CREATE TABLE IF NOT EXISTS notification_deliveries (
        delivery_id     TEXT PRIMARY KEY,
        notification_id TEXT NOT NULL,
        recipient_sub   TEXT NOT NULL,
        channel         TEXT NOT NULL,
        state           TEXT NOT NULL,
        detail          TEXT,
        created_at      TEXT NOT NULL
    )
    """,
    "CREATE INDEX IF NOT EXISTS ix_delivery_notif ON notification_deliveries(notification_id)",
]


# Composite indexes for the two-predicate lookup. Created after migrate() has added
# the columns, which is why they are not in SCHEMA above.
TENANT_INDEXES = [
    "CREATE INDEX IF NOT EXISTS ix_claims_tenant ON claims(client_id, org_node)",
    "CREATE INDEX IF NOT EXISTS ix_org_tenant ON org_nodes(client_id, path)",
    "CREATE INDEX IF NOT EXISTS ix_docs_tenant ON documents(client_id, claim_id)",
    "CREATE INDEX IF NOT EXISTS ix_policies_tenant ON policies(client_id, org_node)",
    "CREATE INDEX IF NOT EXISTS ix_views_tenant ON saved_views(client_id, is_shared)",
    "CREATE INDEX IF NOT EXISTS ix_notif_tenant ON notifications(client_id, recipient_sub)",
    "CREATE INDEX IF NOT EXISTS ix_msg_tenant ON claim_messages(client_id, claim_id)",
    "CREATE INDEX IF NOT EXISTS ix_pins_tenant ON claim_pins(client_id, user_sub)",
]


def create_all(conn) -> None:
    """
    Creates the base schema, then applies the additive column list.

    The additive columns are deliberately not duplicated into the CREATE TABLE
    statements. Holding them in one place (ADDITIVE_COLUMNS, below) means a fresh
    database and an already-seeded one converge on the same shape, and there is no
    second list to drift out of step.
    """
    for stmt in SCHEMA:
        conn.execute(stmt)
    conn.commit()
    migrate(conn)
    for stmt in TENANT_INDEXES:
        conn.execute(stmt)
    conn.commit()


# Columns added after the initial schema shipped. `CREATE TABLE IF NOT EXISTS` does
# not alter an existing table, so an already-seeded local database would otherwise be
# missing them. Additive only - nothing here drops or rewrites data.
ADDITIVE_COLUMNS: list[tuple[str, str, str]] = [
    # ── Phase 1 tenancy key ──────────────────────────────────────────────
    # Every table holding tenant data carries the client explicitly. Queries
    # filter on client_id AND the org_node scope list, so a hierarchy fault
    # degrades to the wrong nodes within the right client rather than leaking
    # across tenants.
    ("org_nodes", "client_id", "TEXT"),
    ("claims", "client_id", "TEXT"),
    ("policies", "client_id", "TEXT"),
    ("documents", "client_id", "TEXT"),
    ("fnol_outbox", "client_id", "TEXT"),
    ("fnol_drafts", "client_id", "TEXT"),
    ("saved_views", "client_id", "TEXT"),
    ("notifications", "client_id", "TEXT"),
    ("claim_messages", "client_id", "TEXT"),
    ("claim_pins", "client_id", "TEXT"),
    ("user_preferences", "client_id", "TEXT"),
    ("personas", "client_id", "TEXT"),
    ("audit_log", "client_id", "TEXT"),

    ("claims", "loss_latitude", "REAL"),
    ("claims", "loss_longitude", "REAL"),

    # Exhibit 5 core claim field model, p. 68
    ("claims", "claim_profile", "TEXT"),
    ("claims", "escalated", "INTEGER"),
    ("claims", "disputed_claim", "INTEGER"),
    ("claims", "disputed_category", "TEXT"),
    ("claims", "client_name", "TEXT"),
    ("claims", "entity_group", "TEXT"),
    ("claims", "reporting_line", "TEXT"),
    ("claims", "global_industry", "TEXT"),
    ("claims", "global_sub_industry", "TEXT"),
    ("claims", "client_text_1", "TEXT"),
    ("claims", "client_text_2", "TEXT"),
    ("claims", "client_text_3", "TEXT"),
    ("claims", "client_text_4", "TEXT"),
    ("claims", "client_list_1", "TEXT"),
    ("claims", "client_list_2", "TEXT"),
    ("claims", "client_list_3", "TEXT"),
    ("claims", "client_list_4", "TEXT"),
    ("claims", "assigned_team", "TEXT"),
    ("claims", "aon_office", "TEXT"),
    ("claims", "aon_ack_to_client_date", "TEXT"),
    ("claims", "aon_claims_prep_engagement", "TEXT"),
    ("claims", "routing_type", "TEXT"),
    ("claims", "name_of_loss", "TEXT"),
    ("claims", "catastrophe", "TEXT"),
    ("claims", "claims_made_date", "TEXT"),
    ("claims", "date_insured_first_awareness", "TEXT"),
    ("claims", "prescription_date", "TEXT"),
    ("claims", "claim_closure_date", "TEXT"),
    ("claims", "date_last_updated", "TEXT"),
    ("claims", "region", "TEXT"),
    ("claims", "alternative_aon_region", "TEXT"),
    ("claims", "country", "TEXT"),
    ("claims", "loss_region", "TEXT"),
    ("claims", "client_specific_1", "TEXT"),
    ("claims", "client_specific_2", "TEXT"),
    ("claims", "client_specific_3", "TEXT"),
    ("claims", "client_specific_4", "TEXT"),
    ("claims", "client_specific_5", "TEXT"),
    ("claims", "client_specific_6", "TEXT"),
    ("claims", "client_specific_7", "TEXT"),
    ("claims", "client_specific_8", "TEXT"),
    ("claims", "client_specific_9", "TEXT"),
    ("claims", "client_specific_10", "TEXT"),
    ("claims", "client_specific_11", "TEXT"),
    ("claims", "client_specific_12", "TEXT"),
    ("claims", "client_specific_13", "TEXT"),
    ("claims", "client_specific_14", "TEXT"),

    # Epic 8: the event is always recorded; `in_app` says whether the bell shows it.
    # Suppressing a channel must not erase the fact that the event happened, otherwise
    # turning a preference off would quietly rewrite history.
    ("notifications", "in_app", "INTEGER NOT NULL DEFAULT 1"),

    # Epic 2: FNOL delegation. A draft stays owned by its author - delegation grants a
    # second person edit and submit rights rather than transferring the draft, so the
    # audit trail still shows who started the intake.
    ("fnol_drafts", "delegate_sub", "TEXT"),
    ("fnol_drafts", "delegate_name", "TEXT"),
    ("fnol_drafts", "delegated_by_name", "TEXT"),
    ("fnol_drafts", "delegated_at", "TEXT"),
]


def migrate(conn) -> list[str]:
    """Adds any missing additive columns. Returns what it changed."""
    applied: list[str] = []
    for table, column, coltype in ADDITIVE_COLUMNS:
        existing = {r[1] for r in conn.execute(f"PRAGMA table_info({table})").fetchall()}
        if not existing:
            continue  # table not created yet; create_all will handle it
        if column not in existing:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {coltype}")
            applied.append(f"{table}.{column}")
    if applied:
        conn.commit()
    return applied
