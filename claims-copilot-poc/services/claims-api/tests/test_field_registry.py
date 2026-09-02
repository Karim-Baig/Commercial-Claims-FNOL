"""
Field registry behaviour.

Traceability: Exhibit 5 field attribute model, NFR-45.

The point of these tests is that field visibility is data, not code. If someone
reintroduces a hard-coded column list these assertions become meaningless, so they
also serve as a guard on the architecture.
"""
from conftest import P1_CSUITE, auth


def test_registry_is_served_and_ordered(client, tokens):
    r = client.get("/api/v1/config/field-registry", headers=auth(tokens[P1_CSUITE]))
    assert r.status_code == 200
    fields = r.json()["fields"]
    assert len(fields) >= 20
    orders = [f["c2s_order"] for f in fields]
    assert orders == sorted(orders), "registry must be returned in C2S order"


def test_registry_carries_every_exhibit5_attribute(client, tokens):
    required = {
        "field_key", "label_token", "available_in_meridian", "dynamic_category",
        "is_pii", "in_analytics_model", "show_on_claim_list", "show_on_claim_record",
        "show_on_client_analytics", "c2s_order", "default_visibility",
    }
    fields = client.get("/api/v1/config/field-registry",
                        headers=auth(tokens[P1_CSUITE])).json()["fields"]
    assert required <= set(fields[0])


def test_pii_fields_are_flagged(client, tokens):
    fields = client.get("/api/v1/config/field-registry",
                        headers=auth(tokens[P1_CSUITE])).json()["fields"]
    pii = {f["field_key"] for f in fields if f["is_pii"]}
    assert "named_insured" in pii
    assert "loss_address" in pii


def test_labels_are_tokens_not_literals(client, tokens):
    """NFR-43: user-facing text is externalised, so the registry stores keys."""
    fields = client.get("/api/v1/config/field-registry",
                        headers=auth(tokens[P1_CSUITE])).json()["fields"]
    assert all(f["label_token"].startswith("field.") for f in fields)


def test_registry_change_takes_effect_without_restart(client, tokens):
    """NFR-45: a configuration change is visible on the next request."""
    from app.db import execute

    before = client.get("/api/v1/config/field-registry",
                        headers=auth(tokens[P1_CSUITE])).json()["fields"]
    hidden = [f for f in before if not f["show_on_claim_list"]][0]["field_key"]

    execute("UPDATE field_registry SET show_on_claim_list = 1 WHERE field_key = :k",
            {"k": hidden})
    after = client.get("/api/v1/config/field-registry",
                       headers=auth(tokens[P1_CSUITE])).json()["fields"]
    assert next(f for f in after if f["field_key"] == hidden)["show_on_claim_list"]

    execute("UPDATE field_registry SET show_on_claim_list = 0 WHERE field_key = :k",
            {"k": hidden})
