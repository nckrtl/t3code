import {
  CREDENTIAL_APPROVAL_TIMEOUT_SECONDS,
  type CredentialAutofillSettings,
  type CredentialProviderStatus,
} from "@t3tools/contracts";
import { KeyRoundIcon, ShieldIcon, TriangleAlertIcon } from "lucide-react";

import { credentialsEnvironment } from "~/state/credentials";
import { useEnvironmentQuery } from "~/state/query";

import { Alert, AlertDescription } from "../ui/alert";
import { Button } from "../ui/button";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { SettingsPageContainer, SettingsRow, SettingsSection } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";
import { useSettingsScope } from "./SettingsScopeContext";
import { useScopedSettings, useUpdateScopedSettings } from "./useScopedSettings";

const STATUS_COPY: Record<CredentialProviderStatus["state"], string> = {
  ready: "Connected through the op CLI",
  not_installed: "The op CLI is not installed on this server",
  no_account:
    "The op CLI has no account. Turn on CLI integration in 1Password's Developer settings.",
  unavailable: "The op CLI did not answer",
};

function StatusDot({ state }: { state: CredentialProviderStatus["state"] | null }) {
  const tone =
    state === "ready" ? "bg-success" : state === null ? "bg-muted-foreground/40" : "bg-warning";
  return <span className={`size-1.5 shrink-0 rounded-full ${tone}`} aria-hidden />;
}

function ProviderTile({ muted, children }: { muted?: boolean; children: React.ReactNode }) {
  return (
    <span
      className={`grid size-9 shrink-0 place-items-center rounded-lg ${
        muted ? "bg-muted/60 text-muted-foreground/70" : "bg-muted text-foreground"
      }`}
      aria-hidden
    >
      {children}
    </span>
  );
}

function PasswordManagerSection() {
  const { environment } = useSettingsScope();
  const environmentId =
    environment?.connection.phase === "connected" ? environment.environmentId : null;
  const status = useEnvironmentQuery(
    environmentId === null ? null : credentialsEnvironment.status({ environmentId, input: {} }),
  );
  const state = status.data?.state ?? null;
  const description =
    environmentId === null
      ? "Connect an environment to check its password manager."
      : state === null
        ? status.isPending
          ? "Checking…"
          : (status.error ?? "Not checked yet")
        : `${STATUS_COPY[state]}${state === "ready" && status.data?.version ? ` ${status.data.version}` : ""}`;

  return (
    <SettingsSection id={searchableSetting("password-manager").id} title="Password manager">
      <SettingsRow
        title={
          <span className="flex items-center gap-3">
            <ProviderTile>
              <KeyRoundIcon className="size-4" />
            </ProviderTile>
            1Password
          </span>
        }
        description={
          // Indented past the provider tile, so the status sits under the name.
          <span className="flex items-center gap-1.5 pl-12">
            <StatusDot state={state} />
            {description}
          </span>
        }
        control={
          <Button
            size="xs"
            variant="outline"
            disabled={environmentId === null || status.isPending}
            onClick={() => status.refresh()}
          >
            Check connection
          </Button>
        }
      />
      <SettingsRow
        title={
          <span className="flex items-center gap-3 text-muted-foreground">
            <ProviderTile muted>
              <ShieldIcon className="size-4" />
            </ProviderTile>
            Bitwarden
          </span>
        }
        description={<span className="pl-12">Not available yet</span>}
      />
    </SettingsSection>
  );
}

export function PasswordsSettingsPanel() {
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  const autofill = settings.credentialAutofill;
  const update = (patch: Partial<CredentialAutofillSettings>) =>
    updateSettings({ credentialAutofill: patch });

  return (
    <SettingsPageContainer>
      <PasswordManagerSection />

      <SettingsSection title="Approvals">
        <SettingsRow
          title="Ask before every fill"
          description="Always on. Each prompt names the login, the site and the field."
          control={<Switch aria-label="Ask before every fill" checked disabled />}
        />
        <SettingsRow
          serverScoped
          settingKeys={["credentialAutofill"]}
          id={searchableSetting("credential-sign-in-approval").id}
          title="One approval per sign-in"
          description="One prompt covers the username, password and one-time code of the same login, on the same site and tab, for 1 minute."
          control={
            <Switch
              aria-label="One approval per sign-in"
              checked={autofill.oneApprovalPerSignIn}
              onCheckedChange={(enabled) => update({ oneApprovalPerSignIn: enabled })}
            />
          }
        />
        <SettingsRow
          serverScoped
          settingKeys={["credentialAutofill"]}
          id={searchableSetting("credential-approval-timeout").id}
          title="Deny unanswered prompts after"
          description='The agent gets "denied" and nothing is filled.'
          control={
            <Select
              value={String(autofill.approvalTimeoutSeconds)}
              onValueChange={(next) => {
                const seconds = CREDENTIAL_APPROVAL_TIMEOUT_SECONDS.find(
                  (option) => String(option) === next,
                );
                if (seconds !== undefined) update({ approvalTimeoutSeconds: seconds });
              }}
            >
              <SelectTrigger size="sm" aria-label="Deny unanswered prompts after">
                <SelectValue>{`${autofill.approvalTimeoutSeconds} seconds`}</SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                {CREDENTIAL_APPROVAL_TIMEOUT_SECONDS.map((seconds) => (
                  <SelectItem key={seconds} value={String(seconds)}>
                    {`${seconds} seconds`}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          }
        />
      </SettingsSection>

      <SettingsSection title="Protection">
        <SettingsRow
          title="Hide passwords from page reads"
          description="Always on. Page text and script results the agent reads show [redacted] in place of password and code values."
          control={<Switch aria-label="Hide passwords from page reads" checked disabled />}
        />
        <SettingsRow
          serverScoped
          settingKeys={["credentialAutofill"]}
          id={searchableSetting("credential-block-scripts").id}
          title="Block agent scripts after a fill"
          description="After a password or code fills, the agent can't run JavaScript in that tab until the page's address changes. Stops a script from copying the value out."
          control={
            <Switch
              aria-label="Block agent scripts after a fill"
              checked={autofill.blockScriptsAfterFill}
              onCheckedChange={(enabled) => update({ blockScriptsAfterFill: enabled })}
            />
          }
        />
        <SettingsRow
          serverScoped
          settingKeys={["credentialAutofill"]}
          id={searchableSetting("credential-subdomains").id}
          title="Fill on subdomains of a saved site"
          description="A login saved for example.com also fills login.example.com. Off: only the exact saved site."
          control={
            <Switch
              aria-label="Fill on subdomains of a saved site"
              checked={autofill.allowSubdomains}
              onCheckedChange={(enabled) => update({ allowSubdomains: enabled })}
            />
          }
        />
      </SettingsSection>

      <Alert variant="warning">
        <TriangleAlertIcon />
        <AlertDescription>
          An agent's own terminal can also run op while 1Password's CLI integration is on. 1Password
          asks you to authorize it, so read that prompt before you approve.
        </AlertDescription>
      </Alert>
    </SettingsPageContainer>
  );
}
