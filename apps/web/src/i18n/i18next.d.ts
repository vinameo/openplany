import type { EnCatalog } from "@repo/contracts";

declare module "i18next" {
  interface CustomTypeOptions {
    resources: EnCatalog;
    keySeparator: false;
    nsSeparator: ":";
  }
}
