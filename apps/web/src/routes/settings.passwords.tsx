import { createFileRoute } from "@tanstack/react-router";
import { PasswordsSettingsPanel } from "../components/settings/PasswordsSettings";

export const Route = createFileRoute("/settings/passwords")({ component: PasswordsSettingsPanel });
