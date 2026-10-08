import { useSyncExternalStore } from "react";

import {
  AlertDialog,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import { Button } from "~/components/ui/button";

import {
  CREDENTIAL_FIELD_LABELS,
  readCurrentCredentialApproval,
  respondToCredentialApproval,
  subscribeCredentialApprovals,
} from "./credentialApproval";

/** Asks the user before an agent fills a saved login into a browser tab. */
export function CredentialApprovalHost() {
  const approval = useSyncExternalStore(
    subscribeCredentialApprovals,
    readCurrentCredentialApproval,
    readCurrentCredentialApproval,
  );
  const fieldLabel = approval ? CREDENTIAL_FIELD_LABELS[approval.field] : "";

  return (
    <AlertDialog
      open={approval !== null}
      onOpenChange={(open) => {
        if (!open && approval) respondToCredentialApproval(approval.id, false);
      }}
    >
      <AlertDialogPopup>
        {approval ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Fill your {fieldLabel}?</AlertDialogTitle>
              <AlertDialogDescription>
                An agent wants to fill the {fieldLabel} of “{approval.itemTitle}” from{" "}
                {approval.providerLabel} into <span className="font-medium">{approval.origin}</span>
                . The agent does not see the value.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <Button
                variant="outline"
                onClick={() => respondToCredentialApproval(approval.id, false)}
              >
                Deny
              </Button>
              <Button onClick={() => respondToCredentialApproval(approval.id, true)}>
                Fill {fieldLabel}
              </Button>
            </AlertDialogFooter>
          </>
        ) : null}
      </AlertDialogPopup>
    </AlertDialog>
  );
}
