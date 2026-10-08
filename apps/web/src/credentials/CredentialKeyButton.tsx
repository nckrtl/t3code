import type { CredentialField, PreviewTabId, ScopedThreadRef } from "@t3tools/contracts";
import { KeyRoundIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "~/components/ui/button";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuTrigger,
} from "~/components/ui/menu";
import { toastManager } from "~/components/ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { readPreviewAutomationClientId } from "~/components/preview/previewAutomationClientId";
import { credentialsEnvironment } from "~/state/credentials";
import { useEnvironmentQuery } from "~/state/query";
import { useAtomCommand } from "~/state/use-atom-command";

import { hostOf, originOf } from "./credentialApproval";
import {
  EMPTY_PAGE_FIELDS,
  type CredentialPageFields,
  detectCredentialPageFields,
} from "./credentialPageFields";

const FILL_FAILURES: Record<string, string> = {
  origin_mismatch: "The page is not on this login's saved site.",
  tab_unavailable: "The tab has no page loaded.",
  field_not_found: "No matching field is visible on the page.",
  not_editable: "The field cannot take this value.",
  insert_failed: "The page did not accept the value.",
  no_value: "This login has no value for that field.",
  provider_unavailable: "1Password is unavailable. Unlock it and try again.",
  item_not_found: "1Password no longer has this login.",
};

/** The fields one click fills, from what the page shows. */
function fieldsToFill(page: CredentialPageFields): ReadonlyArray<CredentialField> {
  if (page.password) return page.username ? ["username", "password"] : ["password"];
  if (page.otp) return ["otp"];
  if (page.username) return ["username"];
  return [];
}

/**
 * The key in the browser's address bar. Lights up on a sign-in page that has
 * saved logins and fills the one the user picks, without an approval prompt.
 */
export function CredentialKeyButton(props: {
  readonly threadRef: ScopedThreadRef;
  readonly tabId: PreviewTabId;
  readonly runtimeTabId: string;
  readonly pageUrl: string | null;
  readonly loading: boolean;
}) {
  const { threadRef, tabId, runtimeTabId, pageUrl, loading } = props;
  const origin = originOf(pageUrl);
  // Detection result for one URL; a different or loading page reads as none.
  const [detected, setDetected] = useState<{
    readonly url: string;
    readonly fields: CredentialPageFields;
  } | null>(null);
  const sites = useEnvironmentQuery(
    origin === null
      ? null
      : credentialsEnvironment.listForSite({
          environmentId: threadRef.environmentId,
          input: { url: origin },
        }),
  );
  const fill = useAtomCommand(credentialsEnvironment.fillForSite, { reportFailure: false });
  const items = sites.data?.items ?? [];

  const page = !loading && detected?.url === pageUrl ? detected.fields : EMPTY_PAGE_FIELDS;

  const detect = useCallback(
    (url: string) =>
      detectCredentialPageFields(runtimeTabId).then((fields) => setDetected({ url, fields })),
    [runtimeTabId],
  );

  // Check after each load, and once more shortly after: many sign-in forms
  // render after the load event.
  useEffect(() => {
    if (loading || pageUrl === null) return;
    void detect(pageUrl);
    const later = window.setTimeout(() => void detect(pageUrl), 1200);
    return () => window.clearTimeout(later);
  }, [detect, loading, pageUrl]);

  if (origin === null || (!page.any && items.length === 0)) return null;

  const fields = fieldsToFill(page);
  const ready = page.any && items.length > 0;
  const label = ready ? "Fill a saved login" : "Saved logins";

  const fillLogin = async (itemId: string, title: string) => {
    const hostClientId = readPreviewAutomationClientId(threadRef.environmentId);
    if (!hostClientId || fields.length === 0) return;
    const result = await fill({
      environmentId: threadRef.environmentId,
      input: {
        environmentId: threadRef.environmentId,
        threadId: threadRef.threadId,
        tabId,
        hostClientId,
        itemId,
        fields: [...fields],
      },
    });
    if (result._tag === "Failure") {
      toastManager.add({ type: "error", title: `Could not fill “${title}”` });
      return;
    }
    const failed = result.value.results.find(
      (entry) =>
        entry.status !== "filled" &&
        // A form without a username input is still a full sign-in.
        !(entry.field === "username" && entry.status === "field_not_found"),
    );
    if (failed) {
      toastManager.add({
        type: "warning",
        title: `Could not fill “${title}”`,
        description: FILL_FAILURES[failed.status] ?? "The fill did not finish.",
      });
    }
  };

  return (
    <Menu onOpenChange={(open) => (open && pageUrl ? void detect(pageUrl) : undefined)}>
      <Tooltip>
        <TooltipTrigger
          render={
            <MenuTrigger
              render={<Button variant="ghost" size="icon-xs" type="button" aria-label={label} />}
            />
          }
        >
          <KeyRoundIcon className={ready ? "text-primary" : undefined} />
        </TooltipTrigger>
        <TooltipPopup>{label}</TooltipPopup>
      </Tooltip>
      <MenuPopup align="end" sideOffset={6}>
        <MenuGroup>
          <MenuGroupLabel className="max-w-72">
            <span className="block truncate">1Password · {hostOf(origin)}</span>
          </MenuGroupLabel>
          {sites.data?.unavailable ? (
            <MenuItem disabled>1Password is unavailable</MenuItem>
          ) : items.length === 0 ? (
            <MenuItem disabled>
              {sites.isPending ? "Checking…" : "No saved logins for this site"}
            </MenuItem>
          ) : (
            items.map((item) => (
              <MenuItem
                key={item.id}
                disabled={fields.length === 0}
                onClick={() => void fillLogin(item.id, item.title)}
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{item.title}</span>
                  {item.username ? (
                    <span className="truncate text-muted-foreground text-xs">{item.username}</span>
                  ) : null}
                </span>
              </MenuItem>
            ))
          )}
        </MenuGroup>
        {items.length > 0 && fields.length === 0 ? (
          <MenuGroupLabel>No sign-in field on this page</MenuGroupLabel>
        ) : null}
        {items.length > 0 && fields.length > 0 && fields[0] === "otp" ? (
          <MenuGroupLabel>Fills the one-time code</MenuGroupLabel>
        ) : null}
      </MenuPopup>
    </Menu>
  );
}
