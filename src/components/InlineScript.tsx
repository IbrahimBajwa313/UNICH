"use client";

/**
 * Renders a synchronous inline script that runs during HTML parsing, before
 * first paint — needed for e.g. setting data-theme before hydration.
 *
 * Must be a Client Component: `type` needs to actually flip from
 * "text/javascript" (server) to "text/plain" (client) when this function
 * re-runs during hydration in the browser, or React always sees the server
 * value and warns about a live <script> tag. See:
 * node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md
 */
export function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
