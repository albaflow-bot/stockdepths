import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Text } from "react-native";
import { PersonaGate } from "../PersonaGate";
import { PersonaRepository } from "../../persona/repository";
import { buildPresetConfig } from "../../persona/config";
import { createMemoryStorage } from "../../data/storage";
import { personaLabel } from "../../persona/matching";

describe("PersonaGate (first-run no-skip gate)", () => {
  it("blocks the app with the setup screen until a persona is chosen", async () => {
    const repo = new PersonaRepository({ storage: createMemoryStorage(), now: () => "t" });
    render(<PersonaGate repository={repo}>{() => <Text>앱 본문</Text>}</PersonaGate>);

    // The gated app is NOT shown; the no-skip setup screen is.
    await waitFor(() => expect(screen.getByTestId("persona-setup-screen")).toBeInTheDocument());
    expect(screen.queryByText("앱 본문")).toBeNull();

    // Choose a persona → the gate opens.
    fireEvent.click(screen.getByTestId("persona-option-neutral"));
    fireEvent.click(screen.getByTestId("persona-save-button"));

    await waitFor(() => expect(screen.getByText("앱 본문")).toBeInTheDocument());
    expect(await repo.load()).toMatchObject({ profile: "neutral" }); // persisted locally
  });

  it("renders the app directly when a persona already exists", async () => {
    const repo = new PersonaRepository({ storage: createMemoryStorage(), now: () => "t" });
    await repo.save(buildPresetConfig("aggressive", "t"));

    render(
      <PersonaGate repository={repo}>
        {(persona) => <Text>성향: {personaLabel(persona)}</Text>}
      </PersonaGate>,
    );

    await waitFor(() => expect(screen.getByText("성향: 공격형")).toBeInTheDocument());
    expect(screen.queryByTestId("persona-setup-screen")).toBeNull();
  });
});
