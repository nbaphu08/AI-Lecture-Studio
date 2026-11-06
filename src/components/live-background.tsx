import { Component as GradientBackground } from "@/components/ui/gradient-background-4";

/** Fixed light gradient backdrop behind the studio, matching the landing page. */
export function LiveBackground() {
  return (
    <div className="live-bg" aria-hidden>
      <GradientBackground />
    </div>
  );
}
