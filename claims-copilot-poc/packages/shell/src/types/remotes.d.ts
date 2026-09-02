// Module Federation remotes are resolved at runtime, so TypeScript needs a stub.
declare module "claimsMfe/ClaimsApp" {
  import type { ClaimsAppProps } from "@poc/contracts";
  const ClaimsApp: React.ComponentType<ClaimsAppProps>;
  export default ClaimsApp;
}
