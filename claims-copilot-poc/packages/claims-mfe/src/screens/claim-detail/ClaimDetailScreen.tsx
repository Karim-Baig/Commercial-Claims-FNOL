import * as React from "react";
import type { ClaimDetail, ClaimDocument } from "@poc/contracts";
import {
  tokens as t, Button, Card, Breadcrumb, Timeline, LocationMap,
  Spinner, ErrorState, EmptyState, Banner, FileUpload, ReadOnlyField,
  useI18n, translateValue,
} from "@poc/uui-stub";
import { useApi, useResource } from "../../api/ApiContext";
import { useEntitlements } from "../../entitlements/useEntitlements";
import { date, fileSize, money } from "../../format";
import { MessageThread } from "./MessageThread";
import type { ClaimsNav } from "../../ClaimsApp";

export interface ClaimDetailScreenProps {
  nav: ClaimsNav;
  claimId: string;
}

const cardStyle: React.CSSProperties = {
  background: t.color.white,
  border: `1px solid ${t.color.grey200}`,
  borderRadius: t.radius.lg,
  overflow: "hidden",
  boxShadow: t.shadow.sm,
};

const cardHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: t.space(3),
  padding: `${t.space(3)} ${t.space(5)}`,
  borderBottom: `1px solid ${t.color.grey200}`,
  font: `${t.font.weight.semibold} ${t.font.size.md} ${t.font.family}`,
  color: t.color.navy900,
};

/**
 * Claim detail - Figure 4 / Epic 3.
 *
 * The documents panel is the visible outcome of Pillar 1: the API returns only
 * client-visible documents. Internal and carrier-only files are filtered in the S-DMS
 * proxy before the response is built (BR-007, BR-008, F-CC-09), never hidden in the UI.
 */
export function ClaimDetailScreen({ nav, claimId }: ClaimDetailScreenProps) {
  const { locale, baseUrl: apiBaseUrl } = useApi();
  const { t: tr } = useI18n();
  const ent = useEntitlements();
  const [docQuery, setDocQuery] = React.useState("");
  const [showAllDocs, setShowAllDocs] = React.useState(false);

  const claim = useResource<ClaimDetail>((api) => api.get(`/claims/${claimId}`), [claimId]);
  const docs = useResource<{ items: ClaimDocument[]; withheld: number }>(
    (api) => api.get(`/claims/${claimId}/documents`),
    [claimId]
  );

  // Map policy is resolved server-side per country so residency rules are applied
  // before the client learns whether a tile service is available (NFR-12).
  const mapPolicy = useResource<{
    provider: string; mode: "schematic" | "tile"; zoom: number;
    attribution: string | null; tile_url: string | null;
    downgrade_reason: string | null;
  }>((api) => api.get("/map/config", { country: claim.data?.loss_country ?? undefined }),
     [claim.data?.loss_country]);

  if (claim.loading) {
    return (
      <div style={{ padding: t.space(10), display: "grid", placeItems: "center" }}>
        <Spinner label={tr("detail.loading")} />
      </div>
    );
  }

  // BR-001: an out-of-scope claim returns 403 - deliberately not 404, and audit-logged.
  if (claim.error?.status === 403) {
    return (
      <Card>
        <EmptyState
          title={tr("detail.denied_title")}
          description={tr("detail.denied_body", { id: claimId })}
          action={<Button onClick={() => nav.toList()}>{tr("detail.back_to_claims")}</Button>}
        />
      </Card>
    );
  }

  if (claim.error || !claim.data) {
    return (
      <ErrorState
        message={claim.error?.message ?? tr("detail.load_error")}
        detail={claim.error?.detail}
        onRetry={claim.reload}
      />
    );
  }

  const c = claim.data;

  const financials = [
    { label: tr("field.gross_incurred"), value: money(c.gross_incurred, c.currency_code, locale) },
    { label: tr("field.total_paid"), value: money(c.total_paid, c.currency_code, locale) },
    { label: tr("field.total_outstanding"), value: money(c.total_outstanding, c.currency_code, locale) },
    {
      label: tr("field.deductible"),
      value: c.applicable_deductible != null
        ? money(c.applicable_deductible, c.currency_code, locale)
        : tr("common.dash"),
    },
    {
      label: tr("field.sir"),
      value: c.sir_amount != null ? money(c.sir_amount, c.currency_code, locale) : tr("common.dash"),
    },
  ];

  const keyFacts = [
    { label: tr("detail.your_reference"), value: c.client_claim_ref ?? tr("common.dash") },
    { label: tr("detail.reported_to_aon"), value: date(c.date_reported_to_aon, locale) },
    { label: tr("detail.type"), value: translateValue(tr, "claim_type", c.claim_type) },
    { label: tr("field.product_line"), value: translateValue(tr, "product", c.global_product) },
    { label: tr("field.policy_number"), value: c.carrier_policy_number ?? tr("common.dash") },
  ];

  const allDocs = docs.data?.items ?? [];
  const filteredDocs = docQuery.trim()
    ? allDocs.filter((d) => d.doc_name.toLowerCase().includes(docQuery.trim().toLowerCase()))
    : allDocs;
  const shownDocs = showAllDocs ? filteredDocs : filteredDocs.slice(0, 5);

  const locationLine = [c.loss_address, c.loss_city, c.loss_country]
    .filter(Boolean)
    .join(", ");

  return (
    <div>
      <Breadcrumb
        items={[
          { label: tr("nav.home"), onClick: nav.toLanding },
          { label: tr("list.title"), onClick: () => nav.toList() },
          { label: c.aon_claim_id },
        ]}
      />

      {/* Heading row: claim id + status pill */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "flex-start",
        flexWrap: "wrap", gap: t.space(3),
        margin: `${t.space(3)} 0 ${t.space(4)}`,
      }}>
        <div>
          <h1 dir="ltr" style={{
            margin: 0,
            font: `${t.font.weight.bold} ${t.font.size.xxl} ${t.font.mono}`,
            color: t.color.navy900, letterSpacing: "-0.5px",
          }}>
            {c.aon_claim_id}
          </h1>
          {c.named_insured && (
            <p style={{
              margin: `${t.space(1)} 0 0`,
              font: `${t.font.size.md} ${t.font.family}`, color: t.color.grey500,
            }}>
              {c.named_insured}
            </p>
          )}
        </div>
        <span style={{
          display: "inline-flex", alignItems: "center",
          background: t.color.teal050, color: t.color.teal700,
          borderRadius: t.radius.pill,
          padding: `${t.space(1.5)} ${t.space(3)}`,
          font: `${t.font.weight.semibold} ${t.font.size.sm} ${t.font.family}`,
          whiteSpace: "nowrap",
        }}>
          {translateValue(tr, "status", c.status)}
          {c.sub_status ? ` · ${c.sub_status}` : ""}
        </span>
      </div>

      {/* Key facts band */}
      <div style={{
        ...cardStyle,
        display: "grid",
        gridTemplateColumns: `repeat(${keyFacts.length}, minmax(0, 1fr))`,
        marginBottom: t.space(4),
      }}>
        {keyFacts.map((f, i) => (
          <div key={f.label} style={{
            padding: `${t.space(3)} ${t.space(4)}`,
            borderInlineStart: i > 0 ? `1px solid ${t.color.grey200}` : "none",
            minWidth: 0,
          }}>
            <div style={{
              font: `${t.font.size.xs} ${t.font.family}`, color: t.color.grey500,
              textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: t.space(1),
            }}>
              {f.label}
            </div>
            <div style={{
              font: `${t.font.weight.semibold} ${t.font.size.sm} ${t.font.family}`,
              color: t.color.grey900, overflowWrap: "anywhere",
            }}>
              {f.value}
            </div>
          </div>
        ))}
      </div>

      {/* Financials band */}
      <div style={{ ...cardStyle, marginBottom: t.space(4) }}>
        <div style={cardHeaderStyle}>
          <span>{tr("detail.financials")}</span>
          <span style={{
            font: `${t.font.size.xs} ${t.font.mono}`, color: t.color.grey500,
            fontWeight: t.font.weight.regular,
          }} dir="ltr">
            {c.currency_code}
          </span>
        </div>
        <div style={{
          display: "grid",
          gridTemplateColumns: `repeat(${financials.length}, minmax(0, 1fr))`,
        }}>
          {financials.map((f, i) => (
            <div key={f.label} style={{
              padding: `${t.space(4)} ${t.space(5)}`,
              borderInlineStart: i > 0 ? `1px solid ${t.color.grey200}` : "none",
              minWidth: 0,
            }}>
              <div style={{
                font: `${t.font.size.sm} ${t.font.family}`, color: t.color.grey500,
                marginBottom: t.space(1),
              }}>
                {f.label}
              </div>
              <div style={{
                font: `${t.font.weight.bold} ${t.font.size.xl} ${t.font.family}`,
                color: t.color.navy900, overflowWrap: "anywhere",
              }}>
                {f.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Split layout: claim details (left) + documents (right) */}
      <div style={{
        display: "grid", gap: t.space(4),
        gridTemplateColumns: "minmax(0, 2fr) minmax(300px, 1fr)",
        alignItems: "start",
      }}>
        {/* LEFT: details */}
        <div style={{ display: "grid", gap: t.space(4) }}>
          <div style={cardStyle}>
            <div style={cardHeaderStyle}>
              <span>{tr("detail.tab_details")}</span>
            </div>
            <div style={{ padding: t.space(5) }}>
              {/* Loss description spans full width */}
              <div style={{ marginBottom: t.space(5) }}>
                <div style={{
                  font: `${t.font.size.xs} ${t.font.family}`, color: t.color.grey500,
                  textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: t.space(1.5),
                }}>
                  {tr("field.loss_description")}
                </div>
                <p style={{
                  margin: 0, font: `${t.font.size.md} ${t.font.family}`,
                  color: t.color.grey900, lineHeight: 1.6,
                }}>
                  {c.loss_description ?? tr("common.dash")}
                </p>
              </div>

              {/* Two-column field grid */}
              <div style={{
                display: "grid", gap: `${t.space(4)} ${t.space(6)}`,
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              }}>
                <ReadOnlyField label={tr("field.cause_of_loss")} value={c.cause_of_loss} />
                <ReadOnlyField label={tr("field.consequence_of_loss")} value={c.consequence_of_loss} />
                <ReadOnlyField label={tr("field.carrier")} value={c.carrier} />
                <ReadOnlyField label={tr("field.date_of_loss")} value={date(c.date_of_loss, locale)} />
                <ReadOnlyField
                  label={tr("field.date_reported_to_carrier")}
                  value={date(c.date_reported_to_carrier, locale)}
                />
                <ReadOnlyField label={tr("field.named_insured")} value={c.named_insured} />
                <ReadOnlyField label={tr("field.aon_claim_lead")} value={c.aon_claim_lead} />
                <ReadOnlyField
                  label={tr("field.aon_claim_lead_email")}
                  value={c.aon_claim_lead_email
                    ? <a dir="ltr" href={`mailto:${c.aon_claim_lead_email}`} style={{ color: t.color.teal700 }}>
                        {c.aon_claim_lead_email}
                      </a>
                    : tr("common.dash")}
                />
              </div>
            </div>
          </div>

          {/* Loss location + map */}
          <div style={cardStyle}>
            <div style={cardHeaderStyle}>
              <span>{tr("detail.loss_location_title")}</span>
            </div>
            <div style={{ padding: t.space(5) }}>
              <div style={{
                display: "grid", gap: `${t.space(4)} ${t.space(6)}`,
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                marginBottom: t.space(4),
              }}>
                <ReadOnlyField label={tr("field.loss_address")} value={c.loss_address} />
                <ReadOnlyField label={tr("field.loss_city")} value={c.loss_city} />
                <ReadOnlyField label={tr("field.loss_country")} value={c.loss_country} />
              </div>

              {/* Figure 4 location mapping.
                  Provider comes from config/maps.json, resolved server-side so that
                  per-country data-residency policy is applied before the client is
                  told whether tiles are available (NFR-12). Tiles are proxied by the
                  API - the browser never contacts a map vendor. */}
              <LocationMap
                latitude={c.loss_latitude}
                longitude={c.loss_longitude}
                label={locationLine}
                mode={mapPolicy.data?.mode ?? "schematic"}
                tileUrl={
                  mapPolicy.data?.tile_url
                    // country is passed so the proxy re-checks residency per tile
                    ? `${apiBaseUrl}${mapPolicy.data.tile_url}?country=${encodeURIComponent(c.loss_country ?? "")}`
                    : null
                }
                attribution={mapPolicy.data?.attribution ?? null}
                zoom={mapPolicy.data?.zoom ?? 15}
                downgradeReason={mapPolicy.data?.downgrade_reason ?? null}
              />
            </div>
          </div>

          {/* Timeline */}
          <div style={cardStyle}>
            <div style={cardHeaderStyle}>
              <span>{tr("detail.timeline_title")}</span>
            </div>
            <div style={{ padding: t.space(5) }}>
              <Timeline
                steps={c.timeline.map((s) => ({
                  ...s,
                  milestone: translateValue(tr, "timeline", s.milestone),
                  occurred_on: s.occurred_on ? date(s.occurred_on, locale) : null,
                }))}
              />
            </div>
          </div>

          {/* In-context adjuster messaging (F9 / Epic 3) */}
          <MessageThread claimId={claimId} claimLeadName={c.aon_claim_lead} />
        </div>

        {/* RIGHT: documents panel */}
        <div style={cardStyle}>
          <div style={cardHeaderStyle}>
            <span>{tr("detail.tab_documents")}</span>
            {ent.canViewDocuments && allDocs.length > 0 && (
              <span style={{
                font: `${t.font.size.xs} ${t.font.family}`, color: t.color.grey500,
                fontWeight: t.font.weight.regular,
              }}>
                {allDocs.length}
              </span>
            )}
          </div>

          {!ent.canViewDocuments ? (
            <div style={{ padding: t.space(4) }}>
              <EmptyState
                title={tr("detail.docs_denied_title")}
                description={tr("detail.docs_denied_body")}
              />
            </div>
          ) : (
            <>
              <div style={{ padding: `${t.space(3)} ${t.space(4)}`, borderBottom: `1px solid ${t.color.grey100}` }}>
                <label className="sr-only" htmlFor="doc-search">{tr("detail.search_documents")}</label>
                <input
                  id="doc-search"
                  value={docQuery}
                  onChange={(e) => setDocQuery(e.target.value)}
                  placeholder={tr("detail.search_documents")}
                  style={{
                    width: "100%", padding: `${t.space(2)} ${t.space(3)}`,
                    border: `1px solid ${t.color.grey300}`, borderRadius: t.radius.sm,
                    font: `${t.font.size.sm} ${t.font.family}`, color: t.color.grey900,
                    boxSizing: "border-box",
                  }}
                />
              </div>

              {typeof docs.data?.withheld === "number" && docs.data.withheld > 0 && (
                <div style={{ padding: `${t.space(3)} ${t.space(4)} 0` }}>
                  <Banner tone="warning" title={tr("detail.pillar1_label")}>
                    {tr("detail.pillar1_body", { count: docs.data.withheld })}
                  </Banner>
                </div>
              )}

              {docs.loading ? (
                <div style={{ padding: t.space(6), display: "grid", placeItems: "center" }}>
                  <Spinner label={tr("common.loading")} />
                </div>
              ) : shownDocs.length === 0 ? (
                <p style={{
                  margin: 0, padding: t.space(5), textAlign: "center",
                  font: `${t.font.size.sm} ${t.font.family}`, color: t.color.grey500,
                }}>
                  {docQuery ? tr("common.no_results") : tr("detail.docs_empty")}
                </p>
              ) : (
                <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {shownDocs.map((d) => (
                    <li key={d.doc_id} style={{
                      display: "flex", alignItems: "flex-start", gap: t.space(3),
                      padding: `${t.space(3)} ${t.space(4)}`,
                      borderBottom: `1px solid ${t.color.grey100}`,
                    }}>
                      <span aria-hidden="true" style={{
                        flex: "0 0 auto", fontSize: 16, lineHeight: 1.2,
                      }}>
                        &#128196;
                      </span>
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <span style={{
                          display: "block",
                          font: `${t.font.weight.medium} ${t.font.size.sm} ${t.font.family}`,
                          color: t.color.grey900, overflowWrap: "anywhere",
                        }}>
                          {d.doc_name}
                        </span>
                        <span style={{
                          display: "block", marginTop: 2,
                          font: `${t.font.size.xs} ${t.font.family}`, color: t.color.grey500,
                        }}>
                          {d.doc_type} · {fileSize(d.size_bytes)} · {date(d.uploaded_at, locale)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {filteredDocs.length > 5 && (
                <div style={{ padding: `${t.space(3)} ${t.space(4)}`, borderBottom: `1px solid ${t.color.grey100}` }}>
                  <Button
                    fullWidth size="sm" variant="ghost"
                    onClick={() => setShowAllDocs((v) => !v)}
                  >
                    {showAllDocs
                      ? tr("detail.show_fewer")
                      : tr("detail.view_all_documents", { count: filteredDocs.length })}
                  </Button>
                </div>
              )}

              {ent.canUploadDocuments && (
                <div style={{ padding: t.space(4) }}>
                  <FileUpload label={tr("detail.add_document")} maxSizeMb={100} allowCamera />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
