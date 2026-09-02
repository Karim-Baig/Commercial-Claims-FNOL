"""
Tenant and organisational scope resolution.

Implements F-CC-07 and BR-001: a Client User's organisational scope is the assigned
node plus all descendant nodes. Peer and parent nodes are excluded.

This is the single enforcement point for scope in the entire service.
See docs/adr/ADR-POC-002 and ADR-POC-005. Three rules keep it defensible:

  1. Scope is derived only from the validated token. Never from a query parameter,
     header or request body, because those are client-controllable.
  2. There is exactly one place that computes it. A second one would be a bypass.
  3. Every data query filters on client_id AND the org_node list - two independent
     predicates, not one.

Why two predicates
------------------
Path-prefix isolation alone is sufficient in theory: /CORP-HOSP/ and /CORP-ACME/ do
not overlap. But it is a single point of failure protecting Confidential data across
roughly 100 tenants (Scale and Rollout Assumptions, p. 11). One malformed path, one
node re-parented incorrectly by an MDM sync, and the failure mode is cross-client
disclosure - the worst outcome this system has.

Carrying client_id explicitly means a hierarchy fault degrades to "wrong nodes within
the right tenant", which is recoverable, rather than "another client's claims", which
is not.
"""
from fastapi import Depends, HTTPException, status

from ..db import query, query_one
from .tokens import Principal, current_principal


class ScopeResolution:
    """The resolved answer to 'what may this caller see'."""

    def __init__(self, client_id: str, nodes: list[str]):
        self.client_id = client_id
        self.nodes = nodes


def resolve_authorized_scope(
    org_node: str | None, asserted_client_id: str | None = None
) -> ScopeResolution:
    """
    Returns the caller's tenant and their node list, or raises 403.

    The database is authoritative for which tenant a node belongs to. The token may
    also assert a client_id; if it does and the two disagree, the request is refused
    rather than silently resolved in favour of either. A mismatch means the token and
    the hierarchy have diverged, and continuing would be guessing.
    """
    if not org_node:
        # BR-005: a user with no valid organisational node has no claims access.
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No valid organisational node")

    row = query_one(
        "SELECT path, client_id FROM org_nodes WHERE org_node = :n", {"n": org_node}
    )
    if not row:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Unknown organisational node")

    client_id = row["client_id"]
    if not client_id:
        # A node with no tenant cannot be scoped safely, so it is refused rather than
        # treated as belonging to everyone.
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "Organisational node is not assigned to a client"
        )

    if asserted_client_id and asserted_client_id != client_id:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "Token client does not match organisational node"
        )

    # The tenant predicate is applied here as well as on every downstream query, so a
    # descendant that somehow carried a different client_id is dropped at source.
    # Trailing separators on the path stop a prefix match from catching a sibling
    # whose name merely begins with the same characters.
    descendants = query(
        """SELECT org_node FROM org_nodes
           WHERE client_id = :c AND path LIKE :p
           ORDER BY path""",
        {"c": client_id, "p": f"{row['path']}%"},
    )
    return ScopeResolution(client_id, [r["org_node"] for r in descendants])


class ScopedPrincipal:
    def __init__(self, principal: Principal, resolution: ScopeResolution):
        self.principal = principal
        self.scope = resolution.nodes
        self.client_id = resolution.client_id

    @property
    def sub(self) -> str:
        return self.principal.sub

    def has(self, privilege: str) -> bool:
        return self.principal.has(privilege)

    def tenant_clause(self, alias: str = "") -> tuple[str, dict]:
        """
        The tenant predicate alone, for queries that do not filter by node.

        Returned as SQL plus params so callers cannot interpolate a value into the
        statement text.
        """
        col = f"{alias}.client_id" if alias else "client_id"
        return f"{col} = :tenant_client_id", {"tenant_client_id": self.client_id}

    def scope_clause(self, alias: str = "") -> tuple[str, dict]:
        """
        Both predicates together: tenant AND organisational node.

        Deliberately a single call. The previous shape returned only the node list,
        which left it possible to apply one predicate and forget the other - and the
        one you would forget is the tenant, because the node filter is the visible
        part of the requirement. Returning them joined removes that failure mode:
        there is no partial form of this helper to reach for.
        """
        from ..db import expand_in  # local import avoids a cycle at module load

        prefix = f"{alias}." if alias else ""
        in_clause, node_params = expand_in("s", self.scope)
        tenant_sql, tenant_params = self.tenant_clause(alias)
        return (
            f"{tenant_sql} AND {prefix}org_node IN {in_clause}",
            {**tenant_params, **node_params},
        )


    def narrow(self, org_node: str) -> "ScopedPrincipal":
        """
        Returns a new ScopedPrincipal whose scope is limited to `org_node` and its
        descendants, validated against this caller's existing authorized scope.

        This is the only permitted way to accept an org_node from a request. It is
        safe because the resulting scope is a strict subset of the JWT-derived scope:
        a caller cannot use it to see nodes they were not already authorized for.

        Raises 403 if the requested node is not within this principal's scope.
        """
        if org_node not in set(self.scope):
            raise HTTPException(403, "Requested node is outside your authorised scope")
        sub = resolve_authorized_scope(org_node, self.client_id)
        authorized = set(self.scope)
        return ScopedPrincipal(
            self.principal,
            ScopeResolution(self.client_id, [n for n in sub.nodes if n in authorized]),
        )


def current_scope(
    principal: Principal = Depends(current_principal),
) -> ScopedPrincipal:
    """FastAPI dependency applied to every data route. No route may skip it."""
    return ScopedPrincipal(
        principal,
        resolve_authorized_scope(principal.org_node, principal.client_id),
    )
