import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getGeneralSettingsCall, updateConfigFieldSetting, deleteConfigFieldSetting } from "@/components/networking";
import { Trash2 } from "lucide-react";
import { StatusBadge } from "@/components/shared/table_cells";

import RouterSettings from "@/components/router_settings";
import Fallbacks from "@/components/Settings/RouterSettings/Fallbacks/Fallbacks";
import RoutingGroups from "@/components/routing_groups";

const PROMPT_CACHING_TAB = "prompt_caching";
const ENABLE_ANTHROPIC_PROMPT_CACHING = "enable_anthropic_prompt_caching";
const ANTHROPIC_PROMPT_CACHING_TTL = "anthropic_prompt_caching_ttl";
const OPENAI_SYSTEM_MESSAGES_FIRST = "openai_system_messages_first";
const BACKGROUND_HEALTH_CHECKS = "background_health_checks";
const HEALTH_CHECK_INTERVAL = "health_check_interval";
const HEALTH_CHECK_CONCURRENCY = "health_check_concurrency";
const BACKGROUND_HEALTH_CHECK_MODEL_GROUPS = "background_health_check_model_groups";
const HEALTH_CHECK_FIELD_NAMES = new Set([
  BACKGROUND_HEALTH_CHECKS,
  HEALTH_CHECK_INTERVAL,
  HEALTH_CHECK_CONCURRENCY,
  BACKGROUND_HEALTH_CHECK_MODEL_GROUPS,
]);

const isOn = (value: unknown) => value === true || value === "true";

interface GeneralSettingsPageProps {
  accessToken: string | null;
  userRole: string | null;
  userID: string | null;
}

export interface generalSettingsItem {
  field_name: string;
  field_type: string;
  field_value: unknown;
  field_description: string;
  stored_in_db: boolean | null;
  field_options?: string[] | null;
  field_tab?: string | null;
  field_default_value?: unknown;
}

const NUMERIC_INPUT_WIDTH = "w-36";

const toNumericValue = (raw: string): number | null => (raw === "" ? null : Number(raw));

const toListValue = (raw: string): string[] | null => {
  const items = raw
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "");
  return items.length === 0 ? null : items;
};

const fromListValue = (value: unknown): string => (Array.isArray(value) ? value.join(", ") : "");

const SettingValueEditor: React.FC<{
  setting: generalSettingsItem;
  onChange: (fieldName: string, newValue: unknown) => void;
  inputLabel?: string;
}> = ({ setting, onChange, inputLabel }) => {
  if (setting.field_type === "Integer") {
    return (
      <Input
        type="number"
        aria-label={inputLabel ?? setting.field_name}
        step={1}
        className={NUMERIC_INPUT_WIDTH}
        value={typeof setting.field_value === "number" ? setting.field_value : ""}
        onChange={(event) => onChange(setting.field_name, toNumericValue(event.target.value))}
      />
    );
  }
  if (setting.field_type === "Boolean") {
    return (
      <Switch
        checked={setting.field_value === true || setting.field_value === "true"}
        aria-label={inputLabel ?? setting.field_name}
        onCheckedChange={(checked) => onChange(setting.field_name, checked)}
      />
    );
  }
  if (setting.field_type === "Float") {
    return (
      <Input
        type="number"
        aria-label={inputLabel ?? setting.field_name}
        min={0}
        max={1}
        step={0.05}
        className={NUMERIC_INPUT_WIDTH}
        value={typeof setting.field_value === "number" ? setting.field_value : ""}
        onChange={(event) => onChange(setting.field_name, toNumericValue(event.target.value))}
      />
    );
  }
  if (setting.field_type === "Dollar") {
    return (
      <InputGroup className={NUMERIC_INPUT_WIDTH}>
        <InputGroupAddon>$</InputGroupAddon>
        <InputGroupInput
          type="number"
          aria-label={inputLabel ?? setting.field_name}
          min={0.01}
          step={0.25}
          value={typeof setting.field_value === "number" ? setting.field_value : ""}
          onChange={(event) => onChange(setting.field_name, toNumericValue(event.target.value))}
        />
      </InputGroup>
    );
  }
  if (setting.field_type === "List") {
    return (
      <Input
        key={String(setting.stored_in_db)}
        aria-label={inputLabel ?? setting.field_name}
        placeholder="Comma-separated values"
        defaultValue={fromListValue(setting.field_value)}
        onChange={(event) => onChange(setting.field_name, toListValue(event.target.value))}
      />
    );
  }
  if (setting.field_type === "Select") {
    return (
      <Select value={setting.field_value ?? null} onValueChange={(newValue) => onChange(setting.field_name, newValue)}>
        <SelectTrigger className="min-w-32">
          <SelectValue placeholder="Default" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={null}>Default</SelectItem>
          {(setting.field_options ?? []).map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  return null;
};

export const PromptCachingPanel: React.FC<{
  accessToken: string;
  settings: generalSettingsItem[];
  onChange: (fieldName: string, newValue: unknown) => void;
}> = ({ accessToken, settings, onChange }) => {
  const enableSetting = settings.find((s) => s.field_name === ENABLE_ANTHROPIC_PROMPT_CACHING);
  const ttlSetting = settings.find((s) => s.field_name === ANTHROPIC_PROMPT_CACHING_TTL);
  const systemFirstSetting = settings.find((s) => s.field_name === OPENAI_SYSTEM_MESSAGES_FIRST);

  // The rows come from the same registry the General tab reads; if they
  // are not loaded yet there is nothing to render.
  if (!enableSetting) {
    return null;
  }

  const enabled = isOn(enableSetting.field_value);

  // Apply immediately: a toggle and a dropdown are direct controls, so there is
  // no separate Update button. Clearing the ttl resets it to the provider default.
  const persist = (fieldName: string, value: unknown) => {
    onChange(fieldName, value);
    if (value === "" || value === null || value === undefined) {
      deleteConfigFieldSetting(accessToken, fieldName);
    } else {
      updateConfigFieldSetting(accessToken, fieldName, value);
    }
  };

  return (
    <Card>
      <CardContent>
        <CardTitle>Prompt Caching</CardTitle>

        <div className="mt-6 flex items-start justify-between gap-8">
          <div className="min-w-0 max-w-2xl">
            <p className="font-medium">Automatic Anthropic prompt caching</p>
            <p className="mt-1 break-words text-xs text-muted-foreground">{enableSetting.field_description}</p>
          </div>
          <Switch checked={enabled} onCheckedChange={(checked) => persist(ENABLE_ANTHROPIC_PROMPT_CACHING, checked)} />
        </div>

        {ttlSetting && (
          <div className="mt-6 flex items-start justify-between gap-8">
            <div className="min-w-0 max-w-2xl">
              <p className={`font-medium ${enabled ? "" : "text-muted-foreground"}`}>Cache lifetime (TTL)</p>
              <p className="mt-1 break-words text-xs text-muted-foreground">{ttlSetting.field_description}</p>
            </div>
            <Select
              disabled={!enabled}
              value={ttlSetting.field_value ?? null}
              onValueChange={(newValue) => persist(ANTHROPIC_PROMPT_CACHING_TTL, newValue)}
            >
              <SelectTrigger className="min-w-40">
                <SelectValue placeholder="5m (default)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={null}>5m (default)</SelectItem>
                {(ttlSetting.field_options ?? []).map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {systemFirstSetting && (
          <div className="mt-6 flex items-start justify-between gap-8">
            <div className="min-w-0 max-w-2xl">
              <p className="font-medium">System messages first for OpenAI</p>
              <p className="mt-1 break-words text-xs text-muted-foreground">{systemFirstSetting.field_description}</p>
            </div>
            <Switch
              aria-label="System messages first for OpenAI"
              checked={isOn(systemFirstSetting.field_value)}
              onCheckedChange={(checked) => persist(OPENAI_SYSTEM_MESSAGES_FIRST, checked)}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const healthCheckFieldLabels: Record<string, string> = {
  [BACKGROUND_HEALTH_CHECKS]: "Enable background health checks",
  [HEALTH_CHECK_INTERVAL]: "Health check interval (seconds)",
  [HEALTH_CHECK_CONCURRENCY]: "Health check concurrency",
  [BACKGROUND_HEALTH_CHECK_MODEL_GROUPS]: "Model groups to test",
};

export const BackgroundHealthChecksPanel: React.FC<{
  settings: generalSettingsItem[];
  onChange: (fieldName: string, newValue: unknown) => void;
  onUpdate: (fieldName: string) => void;
  onReset: (fieldName: string) => void;
}> = ({ settings, onChange, onUpdate, onReset }) => {
  const healthCheckSettings = settings.filter((setting) => HEALTH_CHECK_FIELD_NAMES.has(setting.field_name));

  if (healthCheckSettings.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardContent>
        <CardTitle>Background Health Checks</CardTitle>
        <p className="mt-2 text-sm text-muted-foreground">
          Schedule availability checks for configured model endpoints. Leave model groups empty to check every
          configured model.
        </p>
        <div className="mt-6 space-y-6">
          {healthCheckSettings.map((setting) => (
            <div key={setting.field_name} className="flex items-start justify-between gap-8">
              <div className="min-w-0 max-w-2xl">
                <p className="font-medium">{healthCheckFieldLabels[setting.field_name]}</p>
                <p className="mt-1 break-words text-xs text-muted-foreground">{setting.field_description}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <SettingValueEditor
                  setting={setting}
                  onChange={onChange}
                  inputLabel={healthCheckFieldLabels[setting.field_name]}
                />
                <Button
                  aria-label={`Save ${healthCheckFieldLabels[setting.field_name]}`}
                  onClick={() => onUpdate(setting.field_name)}
                >
                  Save
                </Button>
                <Button
                  aria-label={`Reset ${healthCheckFieldLabels[setting.field_name]}`}
                  variant="outline"
                  onClick={() => onReset(setting.field_name)}
                >
                  Reset
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

const GeneralSettings: React.FC<GeneralSettingsPageProps> = ({ accessToken, userRole, userID }) => {
  const [generalSettings, setGeneralSettings] = useState<generalSettingsItem[]>([]);

  useEffect(() => {
    if (!accessToken) {
      return;
    }
    getGeneralSettingsCall(accessToken).then((data) => {
      let general_settings = data;
      setGeneralSettings(general_settings);
    });
  }, [accessToken]);

  const handleInputChange = (fieldName: string, newValue: unknown) => {
    // Update the value in the state
    const updatedSettings = generalSettings.map((setting) =>
      setting.field_name === fieldName ? { ...setting, field_value: newValue } : setting,
    );
    setGeneralSettings(updatedSettings);
  };

  const handleUpdateField = (fieldName: string) => {
    if (!accessToken) {
      return;
    }

    const setting = generalSettings.find((setting) => setting.field_name === fieldName);
    const fieldValue = setting?.field_value;

    if (fieldValue == null) {
      handleResetField(fieldName);
      return;
    }
    try {
      updateConfigFieldSetting(accessToken, fieldName, fieldValue);
      // update value in state

      const updatedSettings = generalSettings.map((setting) =>
        setting.field_name === fieldName ? { ...setting, stored_in_db: true } : setting,
      );
      setGeneralSettings(updatedSettings);
    } catch (error) {
      // do something
    }
  };

  const handleResetField = (fieldName: string) => {
    if (!accessToken) {
      return;
    }

    try {
      deleteConfigFieldSetting(accessToken, fieldName);
      // update value in state

      const updatedSettings = generalSettings.map((setting) =>
        setting.field_name === fieldName
          ? { ...setting, stored_in_db: null, field_value: setting.field_default_value ?? null }
          : setting,
      );
      setGeneralSettings(updatedSettings);
    } catch (error) {
      // do something
    }
  };

  if (!accessToken) {
    return null;
  }

  return (
    <div className="w-full">
      <Tabs defaultValue="loadbalancing" className="h-[75vh] w-full">
        <TabsList variant="line" className="mx-8 mt-4">
          <TabsTrigger value="loadbalancing">Loadbalancing</TabsTrigger>
          <TabsTrigger value="routing-groups">Routing Groups</TabsTrigger>
          <TabsTrigger value="fallbacks">Fallbacks</TabsTrigger>
          <TabsTrigger value="prompt-caching">Prompt Caching</TabsTrigger>
          <TabsTrigger value="health-checks">Health Checks</TabsTrigger>
          <TabsTrigger value="general">General</TabsTrigger>
        </TabsList>
        <TabsContent value="loadbalancing" className="px-8 py-6" keepMounted>
          <RouterSettings accessToken={accessToken} userRole={userRole} userID={userID} />
        </TabsContent>
        <TabsContent value="routing-groups" className="px-8 py-6" keepMounted>
          <RoutingGroups />
        </TabsContent>
        <TabsContent value="fallbacks" className="px-8 py-6" keepMounted>
          <Fallbacks accessToken={accessToken} userRole={userRole} userID={userID} />
        </TabsContent>
        <TabsContent value="prompt-caching" className="px-8 py-6" keepMounted>
          <PromptCachingPanel accessToken={accessToken} settings={generalSettings} onChange={handleInputChange} />
        </TabsContent>
        <TabsContent value="health-checks" className="px-8 py-6" keepMounted>
          <BackgroundHealthChecksPanel
            settings={generalSettings}
            onChange={handleInputChange}
            onUpdate={handleUpdateField}
            onReset={handleResetField}
          />
        </TabsContent>
        <TabsContent value="general" className="px-8 py-6" keepMounted>
          <Card>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Setting</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {generalSettings
                    .filter(
                      (value) =>
                        value.field_type !== "TypedDictionary" &&
                        value.field_tab !== PROMPT_CACHING_TAB &&
                        !HEALTH_CHECK_FIELD_NAMES.has(value.field_name),
                    )
                    .map((value, index) => (
                      <TableRow key={index}>
                        <TableCell className="whitespace-normal">
                          <p className="break-words">{value.field_name}</p>
                          <p
                            style={{
                              fontSize: "0.65rem",
                              color: "#808080",
                              fontStyle: "italic",
                            }}
                            className="mt-1 break-words"
                          >
                            {value.field_description}
                          </p>
                        </TableCell>
                        <TableCell>
                          <SettingValueEditor setting={value} onChange={handleInputChange} />
                        </TableCell>
                        <TableCell>
                          {value.stored_in_db == true ? (
                            <StatusBadge tone="success" label="In DB" />
                          ) : value.stored_in_db == false ? (
                            <StatusBadge tone="neutral" label="In Config" />
                          ) : (
                            <StatusBadge tone="neutral" label="Not Set" />
                          )}
                        </TableCell>
                        <TableCell>
                          <Button onClick={() => handleUpdateField(value.field_name)}>Update</Button>
                          <span
                            onClick={() => handleResetField(value.field_name)}
                            className="inline-flex shrink-0 cursor-pointer items-center justify-center px-1.5 py-1.5 text-destructive"
                          >
                            <Trash2 className="h-5 w-5 shrink-0" />
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default GeneralSettings;
