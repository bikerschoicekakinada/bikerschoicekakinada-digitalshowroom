import { createFileRoute, redirect } from "@tanstack/react-router";

// Old /design/$id URLs now redirect to /search
// The new design flow is: /model/$modelId (configurator)
export const Route = createFileRoute("/design/$id")({
  loader: () => {
    throw redirect({ to: "/search", search: { q: "" } });
  },
  component: () => null,
});
