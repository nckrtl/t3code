import type { CredentialField } from "@t3tools/contracts";
import { CheckIcon, KeyRoundIcon, LockIcon } from "lucide-react";
import { useState, useSyncExternalStore, type ReactNode } from "react";

import {
  AlertDialog,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { useThreadShell } from "~/state/entities";

import {
  CREDENTIAL_FIELD_LABELS,
  type PendingCredentialApproval,
  readCurrentCredentialApproval,
  respondToCredentialApproval,
  subscribeCredentialApprovals,
} from "./credentialApproval";

function DetailRow(props: { label: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex min-h-11 items-center gap-3 px-3.5 py-2.5">
      <span className="w-14 shrink-0 text-muted-foreground">{props.label}</span>
      <span className="flex min-w-0 flex-1 items-center gap-1.5">{props.children}</span>
      {props.aside ? (
        <span className="flex shrink-0 items-center gap-1 text-muted-foreground text-xs">
          {props.aside}
        </span>
      ) : null}
    </div>
  );
}

function SiteRow({ origin }: { origin: string }) {
  return (
    <DetailRow
      label="Site"
      aside={
        <>
          <CheckIcon className="size-3.5 text-success" aria-hidden />
          <span className="text-success-foreground">Saved site</span>
        </>
      }
    >
      <LockIcon className="size-3 shrink-0 text-muted-foreground" aria-hidden />
      <span className="truncate font-mono text-xs">{origin}</span>
    </DetailRow>
  );
}

/** The field the agent asked for, with the page's own name when it differs. */
function fieldDescription(approval: PendingCredentialApproval): string {
  const ours = CREDENTIAL_FIELD_LABELS[approval.field];
  const page = approval.pageFieldLabel;
  return page && page.toLowerCase() !== ours.toLowerCase() ? `“${page}”` : ours;
}

function ApprovalBody({ approval }: { approval: PendingCredentialApproval }) {
  const thread = useThreadShell(approval.threadRef);
  const signInFields = approval.signInFields ?? null;
  // Keyed by approval id, so each prompt starts with every field allowed.
  const [allowed, setAllowed] = useState<ReadonlyArray<CredentialField>>(signInFields ?? []);
  const fieldLabel = CREDENTIAL_FIELD_LABELS[approval.field];
  const host = approval.origin.replace(/^https?:\/\//, "");
  const threadName = thread?.title ? `“${thread.title}”` : "this thread";
  const timeoutSeconds = approval.timeoutSeconds ?? 90;

  const toggle = (field: CredentialField, checked: boolean) =>
    setAllowed((current) =>
      checked ? [...new Set([...current, field])] : current.filter((entry) => entry !== field),
    );

  return (
    <>
      <AlertDialogHeader>
        <div className="flex items-start gap-3.5">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary">
            <KeyRoundIcon className="size-5" aria-hidden />
          </span>
          <div className="flex min-w-0 flex-col gap-1.5">
            <AlertDialogTitle>
              {signInFields ? `Sign in to ${host}?` : `Fill your ${fieldLabel}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {signInFields
                ? `The agent in ${threadName} may fill these fields of “${approval.itemTitle}” in this tab for the next ${approval.signInSeconds ?? 60} seconds. It won't see the values.`
                : `The agent in ${threadName} wants to fill a saved ${fieldLabel}. It won't see the value.`}
            </AlertDialogDescription>
          </div>
        </div>
      </AlertDialogHeader>

      <div className="mx-6 mb-5 divide-y rounded-lg border bg-muted/40 text-sm">
        <DetailRow
          label="Login"
          aside={<Badge variant="secondary">{approval.providerLabel}</Badge>}
        >
          <span className="truncate font-medium">{approval.itemTitle}</span>
        </DetailRow>
        <SiteRow origin={approval.origin} />
        {signInFields ? (
          signInFields.map((field) => {
            const required = field === approval.field;
            return (
              <label key={field} className="flex min-h-11 items-center gap-3 px-3.5 py-2.5">
                <Checkbox
                  checked={required || allowed.includes(field)}
                  disabled={required}
                  onCheckedChange={(checked) => toggle(field, checked === true)}
                />
                <span className="flex-1">{CREDENTIAL_FIELD_LABELS[field]}</span>
                {required ? (
                  <span className="text-muted-foreground text-xs">
                    {approval.highlighted ? "Now, highlighted in the page" : "Now"}
                  </span>
                ) : null}
              </label>
            );
          })
        ) : approval.field === "username" ? null : (
          <DetailRow
            label="Field"
            aside={approval.highlighted ? "Highlighted in the page" : undefined}
          >
            <span className="truncate">{fieldDescription(approval)}</span>
          </DetailRow>
        )}
      </div>

      <AlertDialogFooter>
        <span className="mr-auto self-center text-muted-foreground text-xs max-sm:hidden">
          Denies by itself in {timeoutSeconds} s
        </span>
        <Button variant="outline" onClick={() => respondToCredentialApproval(approval.id, false)}>
          Deny
        </Button>
        <Button
          onClick={() =>
            respondToCredentialApproval(
              approval.id,
              true,
              signInFields ? [...new Set([approval.field, ...allowed])] : undefined,
            )
          }
        >
          {signInFields ? "Allow sign-in" : `Fill ${fieldLabel}`}
        </Button>
      </AlertDialogFooter>
    </>
  );
}

/** Asks the user before an agent fills a saved login into a browser tab. */
export function CredentialApprovalHost() {
  const approval = useSyncExternalStore(
    subscribeCredentialApprovals,
    readCurrentCredentialApproval,
    readCurrentCredentialApproval,
  );

  return (
    <AlertDialog
      open={approval !== null}
      onOpenChange={(open) => {
        if (!open && approval) respondToCredentialApproval(approval.id, false);
      }}
    >
      <AlertDialogPopup>
        {approval ? <ApprovalBody key={approval.id} approval={approval} /> : null}
      </AlertDialogPopup>
    </AlertDialog>
  );
}
