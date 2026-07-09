import { createFileRoute, redirect } from "@tanstack/react-router";

// Category pages are replaced by the model-based configurator.
// Redirect to search for graceful handling of old URLs.
export const Route = createFileRoute("/category/$slug")({
  loader: () => {
    throw redirect({ to: "/search", search: { q: "" } });
  },
  component: () => null,
});
