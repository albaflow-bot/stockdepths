import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { setAnalyticsTransport, type AnalyticsProps } from "../analytics";
import { PersonaGate } from "../../navigation/PersonaGate";
import { PersonaRepository } from "../../persona/repository";
import { TodaysPicksScreen } from "../../screens/TodaysPicksScreen";
import { NotificationInboxScreen } from "../../screens/NotificationInboxScreen";
import { NotificationPrefsRepository } from "../../notifications/prefs";
import { createMemoryStorage } from "../../data/storage";
import { SAMPLE_ARTIFACT } from "../../data/sampleArtifact";
import { Text } from "react-native";

type Captured = { event: string; props: AnalyticsProps };

function spyEvents(): Captured[] {
  const events: Captured[] = [];
  setAnalyticsTransport((event, props) => void events.push({ event, props }));
  return events;
}

afterEach(() => setAnalyticsTransport(null));

describe("analytics funnel wiring", () => {
  it("fires persona_set (first_run) when the gate's persona is set", async () => {
    const events = spyEvents();
    const repo = new PersonaRepository({ storage: createMemoryStorage(), now: () => "t" });
    render(<PersonaGate repository={repo}>{() => <Text>앱</Text>}</PersonaGate>);

    await waitFor(() => expect(screen.getByTestId("persona-setup-screen")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("persona-option-neutral"));
    fireEvent.click(screen.getByTestId("persona-save-button"));

    await waitFor(() => expect(events.some((e) => e.event === "persona_set")).toBe(true));
    const ev = events.find((e) => e.event === "persona_set")!;
    expect(ev.props).toMatchObject({ mode: "preset", first_run: true });
  });

  it("fires pick_view when today's picks are shown", async () => {
    const events = spyEvents();
    render(<TodaysPicksScreen loader={async () => SAMPLE_ARTIFACT} />);
    await waitFor(() => expect(events.some((e) => e.event === "pick_view")).toBe(true));
    expect(events.find((e) => e.event === "pick_view")!.props).toEqual({ count: SAMPLE_ARTIFACT.picks.length });
  });

  it("fires alert_opt_in when the user enables alerts from the inbox", async () => {
    const events = spyEvents();
    const prefs = new NotificationPrefsRepository({ storage: createMemoryStorage() });
    render(
      <NotificationInboxScreen
        repository={undefined}
        prefsRepository={prefs}
        nowMs={Date.parse("2026-06-21T12:00:00Z")}
      />,
    );
    // Opt-in banner appears (not yet opted in).
    await waitFor(() => expect(screen.getByTestId("alert-optin-banner")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("alert-optin-button"));
    await waitFor(() => expect(events.some((e) => e.event === "alert_opt_in")).toBe(true));
    // Banner hides after opting in, and the choice persists.
    await waitFor(() => expect(screen.queryByTestId("alert-optin-banner")).toBeNull());
    expect(await prefs.isOptedIn()).toBe(true);
  });
});
