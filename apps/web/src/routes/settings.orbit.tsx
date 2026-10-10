import { createFileRoute } from "@tanstack/react-router";

import { OrbitSettingsPanel } from "../components/settings/OrbitSettings";

export const Route = createFileRoute("/settings/orbit")({ component: OrbitSettingsPanel });
