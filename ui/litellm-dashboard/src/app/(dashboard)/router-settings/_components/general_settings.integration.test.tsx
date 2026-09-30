import { fireEvent, renderWithProviders, screen, within } from "../../../../../tests/test-utils";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import GeneralSettings from "./general_settings";
import { deleteConfigFieldSetting, getGeneralSettingsCall, updateConfigFieldSetting } from "@/components/networking";

vi.mock("@/components/networking", () => ({
  getGeneralSettingsCall: vi.fn(),
  updateConfigFieldSetting: vi.fn().mockResolvedValue({}),
  deleteConfigFieldSetting: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/components/router_settings", () => ({ default: () => null }));
vi.mock("@/components/Settings/RouterSettings/Fallbacks/Fallbacks", () => ({ default: () => null }));
vi.mock("@/components/routing_groups", () => ({ default: () => null }));
// Mirrors the /config/list ordering: the two prompt-caching rows sit between the
// General-tab rows in the unfiltered response but are filtered out of the General
// tab's table, so any index-based lookup into the unfiltered array reads the wrong
// row for every field rendered after them.
const SETTINGS_FIXTURE = [
  {
    field_name: "budget_exceeded_throttle_percentage",
    field_type: "Float",
    field_value: null,
    field_description: "throttle fraction",
    stored_in_db: null,
    field_default_value: null,
  },
  {
    field_name: "enable_anthropic_prompt_caching",
    field_type: "Boolean",
    field_value: true,
    field_description: "prompt caching toggle",
    stored_in_db: true,
    field_tab: "prompt_caching",
    field_default_value: false,
  },
  {
    field_name: "anthropic_prompt_caching_ttl",
    field_type: "Select",
    field_value: "5m",
    field_description: "prompt caching ttl",
    stored_in_db: true,
    field_options: ["5m", "1h"],
    field_tab: "prompt_caching",
    field_default_value: null,
  },
  {
    field_name: "openai_system_messages_first",
    field_type: "Boolean",
    field_value: false,
    field_description: "openai system first toggle",
    stored_in_db: null,
    field_tab: "prompt_caching",
    field_default_value: false,
  },
  {
    field_name: "max_ui_session_budget",
    field_type: "Dollar",
    field_value: 7.5,
    field_description: "dashboard session budget",
    stored_in_db: true,
    field_default_value: 1.0,
  },
  {
    field_name: "background_health_checks",
    field_type: "Boolean",
    field_value: false,
    field_description: "run availability checks in the background",
    stored_in_db: true,
    field_default_value: false,
  },
  {
    field_name: "health_check_interval",
    field_type: "Integer",
    field_value: 300,
    field_description: "background health check interval in seconds",
    stored_in_db: true,
    field_default_value: 300,
  },
  {
    field_name: "health_check_concurrency",
    field_type: "Integer",
    field_value: null,
    field_description: "maximum concurrent health checks",
    stored_in_db: null,
    field_default_value: null,
  },
  {
    field_name: "background_health_check_model_groups",
    field_type: "List",
    field_value: ["old-model"],
    field_description: "model_name groups to probe",
    stored_in_db: true,
    field_default_value: null,
  },
];

const settingsRow = async (fieldName: string) => {
  const cell = await screen.findByText(fieldName);
  const row = cell.closest("tr");
  expect(row).not.toBeNull();
  return row as HTMLElement;
};

const numericValueIn = (row: HTMLElement) => Number((within(row).getByRole("spinbutton") as HTMLInputElement).value);

describe("GeneralSettings General tab", () => {
  beforeEach(() => {
    vi.mocked(getGeneralSettingsCall).mockResolvedValue([...SETTINGS_FIXTURE.map((s) => ({ ...s }))]);
    vi.mocked(updateConfigFieldSetting).mockClear();
    vi.mocked(deleteConfigFieldSetting).mockClear();
  });

  it("updates max_ui_session_budget with its own value, not the value at its filtered index", async () => {
    const user = userEvent.setup();
    renderWithProviders(<GeneralSettings accessToken="token" userRole="Admin" userID="user" />);

    await user.click(screen.getByText("General"));
    const row = await settingsRow("max_ui_session_budget");

    await user.click(within(row).getByRole("button", { name: /update/i }));

    expect(updateConfigFieldSetting).toHaveBeenCalledWith("token", "max_ui_session_budget", 7.5);
  });

  it("reset shows the field's default value instead of an empty input", async () => {
    const user = userEvent.setup();
    renderWithProviders(<GeneralSettings accessToken="token" userRole="Admin" userID="user" />);

    await user.click(screen.getByText("General"));
    const row = await settingsRow("max_ui_session_budget");
    expect(numericValueIn(row)).toBe(7.5);

    const actionCell = row.querySelectorAll("td")[3];
    const resetIcon = actionCell.querySelector("svg");
    expect(resetIcon).not.toBeNull();
    await user.click(resetIcon as unknown as Element);

    expect(deleteConfigFieldSetting).toHaveBeenCalledWith("token", "max_ui_session_budget");
    expect(numericValueIn(row)).toBe(1);
  });
});

describe("GeneralSettings Prompt Caching tab", () => {
  beforeEach(() => {
    vi.mocked(getGeneralSettingsCall).mockResolvedValue([...SETTINGS_FIXTURE.map((s) => ({ ...s }))]);
    vi.mocked(updateConfigFieldSetting).mockClear();
    vi.mocked(deleteConfigFieldSetting).mockClear();
  });

  it("persists openai_system_messages_first when its switch is turned on", async () => {
    const user = userEvent.setup();
    renderWithProviders(<GeneralSettings accessToken="token" userRole="Admin" userID="user" />);

    await user.click(await screen.findByRole("tab", { name: "Prompt Caching" }));
    const toggle = await screen.findByRole("switch", { name: "System messages first for OpenAI" });
    expect(toggle).not.toBeChecked();

    await user.click(toggle);

    expect(toggle).toBeChecked();
    expect(updateConfigFieldSetting).toHaveBeenCalledWith("token", "openai_system_messages_first", true);
    expect(deleteConfigFieldSetting).not.toHaveBeenCalled();
  });

  it("keeps the prompt caching rows off the General tab table", async () => {
    const user = userEvent.setup();
    renderWithProviders(<GeneralSettings accessToken="token" userRole="Admin" userID="user" />);

    await user.click(screen.getByText("General"));
    await settingsRow("max_ui_session_budget");

    expect(screen.queryByText("openai_system_messages_first")).not.toBeInTheDocument();
  });
});

describe("GeneralSettings Health Checks tab", () => {
  beforeEach(() => {
    vi.mocked(getGeneralSettingsCall).mockResolvedValue([...SETTINGS_FIXTURE.map((s) => ({ ...s }))]);
    vi.mocked(updateConfigFieldSetting).mockClear();
    vi.mocked(deleteConfigFieldSetting).mockClear();
  });

  it("saves background health check scheduling and scoped model groups", async () => {
    const user = userEvent.setup();
    renderWithProviders(<GeneralSettings accessToken="token" userRole="Admin" userID="user" />);

    await user.click(await screen.findByRole("tab", { name: "Health Checks" }));
    await user.click(screen.getByRole("switch", { name: "Enable background health checks" }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "Health check interval (seconds)" }), {
      target: { value: "60" },
    });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Health check concurrency" }), { target: { value: "5" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Model groups to test" }), {
      target: { value: " monitored-model, fallback-model ,, " },
    });

    await user.click(screen.getByRole("button", { name: "Save Enable background health checks" }));
    await user.click(screen.getByRole("button", { name: "Save Health check interval (seconds)" }));
    await user.click(screen.getByRole("button", { name: "Save Health check concurrency" }));
    await user.click(screen.getByRole("button", { name: "Save Model groups to test" }));

    expect(vi.mocked(updateConfigFieldSetting).mock.calls).toEqual([
      ["token", "background_health_checks", true],
      ["token", "health_check_interval", 60],
      ["token", "health_check_concurrency", 5],
      ["token", "background_health_check_model_groups", ["monitored-model", "fallback-model"]],
    ]);
  });

  it("resets an empty model group list so all configured models are checked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<GeneralSettings accessToken="token" userRole="Admin" userID="user" />);

    await user.click(await screen.findByRole("tab", { name: "Health Checks" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Model groups to test" }), { target: { value: " " } });
    await user.click(screen.getByRole("button", { name: "Save Model groups to test" }));

    expect(deleteConfigFieldSetting).toHaveBeenCalledWith("token", "background_health_check_model_groups");
    expect(updateConfigFieldSetting).not.toHaveBeenCalled();
  });
});

// The five tabs here are proxy-wide settings. Auto-routers moved to Models + Endpoints.
describe("GeneralSettings tabs", () => {
  beforeEach(() => {
    vi.mocked(getGeneralSettingsCall).mockResolvedValue([]);
  });

  it("renders the proxy-wide tabs and no auto-router tab", async () => {
    renderWithProviders(<GeneralSettings accessToken="token" userRole="proxy_admin" userID="u" />);

    for (const name of ["Loadbalancing", "Routing Groups", "Fallbacks", "Prompt Caching", "Health Checks", "General"]) {
      expect(await screen.findByRole("tab", { name })).toBeInTheDocument();
    }
    expect(screen.queryByRole("tab", { name: /auto.?router/i })).not.toBeInTheDocument();
  });
});

it("persists a List setting typed as comma-separated text as a trimmed string array", async () => {
  vi.mocked(getGeneralSettingsCall).mockResolvedValue([
    {
      field_name: "transcribe_media_buckets",
      field_type: "List",
      field_value: ["old-bucket"],
      field_description: "buckets",
      stored_in_db: true,
    },
  ]);
  vi.mocked(updateConfigFieldSetting).mockClear();
  const user = userEvent.setup();
  renderWithProviders(<GeneralSettings accessToken="token" userRole="Admin" userID="user" />);
  await user.click(screen.getByRole("tab", { name: "General" }));
  const input = await screen.findByRole("textbox", { name: "transcribe_media_buckets" });
  expect(input).toHaveValue("old-bucket");
  fireEvent.change(input, { target: { value: " team-audio, shared.audio ,, " } });
  await user.click(
    within(screen.getByRole("row", { name: /transcribe_media_buckets/ })).getByRole("button", { name: "Update" }),
  );
  expect(vi.mocked(updateConfigFieldSetting).mock.calls).toEqual([
    ["token", "transcribe_media_buckets", ["team-audio", "shared.audio"]],
  ]);
});

it("clears a stored List setting when Update is clicked on an emptied input", async () => {
  vi.mocked(getGeneralSettingsCall).mockResolvedValue([
    {
      field_name: "transcribe_media_buckets",
      field_type: "List",
      field_value: ["old-bucket"],
      field_description: "buckets",
      stored_in_db: true,
    },
  ]);
  vi.mocked(updateConfigFieldSetting).mockClear();
  vi.mocked(deleteConfigFieldSetting).mockClear();
  const user = userEvent.setup();
  renderWithProviders(<GeneralSettings accessToken="token" userRole="Admin" userID="user" />);
  await user.click(screen.getByRole("tab", { name: "General" }));
  const input = await screen.findByRole("textbox", { name: "transcribe_media_buckets" });
  fireEvent.change(input, { target: { value: " , " } });
  await user.click(
    within(screen.getByRole("row", { name: /transcribe_media_buckets/ })).getByRole("button", { name: "Update" }),
  );
  expect(vi.mocked(deleteConfigFieldSetting).mock.calls).toEqual([["token", "transcribe_media_buckets"]]);
  expect(updateConfigFieldSetting).not.toHaveBeenCalled();
  expect(screen.getByRole("textbox", { name: "transcribe_media_buckets" })).toHaveValue("");
});

it("should delete only the Default setting and retain explicit false and zero", async () => {
  vi.mocked(getGeneralSettingsCall).mockResolvedValue([
    {
      field_name: "synthetic_choice",
      field_type: "Select",
      field_value: "enabled",
      field_options: ["enabled"],
      field_description: "choice",
      stored_in_db: true,
    },
    {
      field_name: "synthetic_flag",
      field_type: "Boolean",
      field_value: false,
      field_description: "flag",
      stored_in_db: true,
    },
    {
      field_name: "synthetic_count",
      field_type: "Integer",
      field_value: 0,
      field_description: "count",
      stored_in_db: true,
    },
  ]);
  vi.mocked(updateConfigFieldSetting).mockClear();
  vi.mocked(deleteConfigFieldSetting).mockClear();
  const user = userEvent.setup();
  renderWithProviders(<GeneralSettings accessToken="token" userRole="Admin" userID="user" />);
  await user.click(screen.getByRole("tab", { name: "General" }));
  const row = await screen.findByRole("row", { name: /synthetic_choice/ });
  await user.click(within(row).getByRole("combobox"));
  await user.click(await screen.findByRole("option", { name: "Default" }));
  await user.click(within(row).getByRole("button", { name: "Update" }));
  await user.click(within(screen.getByRole("row", { name: /synthetic_flag/ })).getByRole("button", { name: "Update" }));
  await user.click(
    within(screen.getByRole("row", { name: /synthetic_count/ })).getByRole("button", { name: "Update" }),
  );
  expect(vi.mocked(deleteConfigFieldSetting).mock.calls).toEqual([["token", "synthetic_choice"]]);
  expect(vi.mocked(updateConfigFieldSetting).mock.calls).toEqual([
    ["token", "synthetic_flag", false],
    ["token", "synthetic_count", 0],
  ]);
});
