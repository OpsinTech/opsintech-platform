"use client";

import { SparklesIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Item,
  ItemActions,
  ItemTitle,
  ItemContent,
  ItemDescription,
} from "@/components/ui/item";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useI18n } from "@/core/i18n/hooks";
import { canManageScopedResource, scopeLabel } from "@/core/permissions/scope";
import { useAvailableSkills, useUpdateTenantSkill } from "@/core/skills/hooks";
import type { AvailableSkillResponse } from "@/core/skills/type";
import { useCurrentTenant } from "@/core/tenants/hooks";
import { env } from "@/env";

import { SettingsSection } from "./settings-section";

export function SkillSettingsPage(
  { onClose, readOnly = false }: { onClose?: () => void; readOnly?: boolean } = {},
) {
  const { t } = useI18n();
  const { skills, isLoading, error } = useAvailableSkills();
  return (
    <SettingsSection
      title={t.settings.skills.title}
      description={t.settings.skills.description}
    >
      {isLoading ? (
        <div className="text-muted-foreground text-sm">{t.common.loading}</div>
      ) : error ? (
        <div>Error: {error.message}</div>
      ) : (
        <SkillSettingsList skills={skills} onClose={onClose} readOnly={readOnly} />
      )}
    </SettingsSection>
  );
}

function SkillSettingsList({
  skills,
  readOnly = false,
}: {
  skills: AvailableSkillResponse[];
  onClose?: () => void;
  readOnly?: boolean;
}) {
  const { t } = useI18n();
  const { data: currentTenant } = useCurrentTenant();
  const [filter, setFilter] = useState<string>("public");
  const { mutate: updateTenantSkill } = useUpdateTenantSkill();

  // 去重：根据 skill.name 去重
  const uniqueSkills = useMemo(() => {
    const seen = new Set<string>();
    return skills.filter((skill) => {
      if (seen.has(skill.name)) {
        return false;
      }
      seen.add(skill.name);
      return true;
    });
  }, [skills]);

  const filteredSkills = useMemo(
    () => uniqueSkills.filter((skill) => skill.category === filter),
    [uniqueSkills, filter],
  );
  const isTenantAdmin = currentTenant?.role === "tenant_admin";

  return (
    <div className="flex w-full flex-col gap-4">
      <header className="flex justify-between">
        <div className="flex gap-2">
          <Tabs defaultValue="public" onValueChange={setFilter}>
            <TabsList variant="line">
              <TabsTrigger value="public">{t.common.public}</TabsTrigger>
              <TabsTrigger value="custom">{t.common.custom}</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <div className="text-xs text-muted-foreground">
          {readOnly ? t.settings.skills.readOnlyViewHint : t.settings.skills.createDisabledHint}
        </div>
      </header>
      {filteredSkills.length === 0 && (
        <EmptySkill />
      )}
      {filteredSkills.length > 0 &&
        filteredSkills.map((skill, index) => {
          const scopeBadgeStyle = {
            global: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
            tenant: "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20",
            user: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20",
          }[skill.scope] ?? "bg-muted text-muted-foreground";

          const canManage =
            !readOnly &&
            isTenantAdmin &&
            canManageScopedResource(skill.scope, skill.managed_by_current_user);

          // 使用组合 key 避免重复
          const uniqueKey = `${skill.name}-${index}`;

          return (
            <Item className="w-full" variant="outline" key={uniqueKey}>
              <ItemContent>
                <ItemTitle>
                  <div className="flex items-center gap-2 min-w-0">
                    {skill.name}
                    {skill.scope && (
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${scopeBadgeStyle} hidden sm:inline-block shrink-0 whitespace-nowrap`}>
                        {scopeLabel(skill.scope)}
                      </span>
                    )}
                  </div>
                </ItemTitle>
                <ItemDescription className="line-clamp-4">
                  {skill.description}
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                <Switch
                  checked={skill.enabled}
                  disabled={env.NEXT_PUBLIC_STATIC_WEBSITE_ONLY === "true" || !canManage}
                  onCheckedChange={(checked) => {
                    if (skill.scope === "global" || skill.scope === "tenant") {
                      updateTenantSkill({ skillName: skill.name, enabled: checked });
                    }
                  }}
                />
              </ItemActions>
            </Item>
          );
        })}
    </div>
  );
}

function EmptySkill() {
  const { t } = useI18n();
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <SparklesIcon />
        </EmptyMedia>
        <EmptyTitle>{t.settings.skills.emptyTitle}</EmptyTitle>
        <EmptyDescription>
          {t.settings.skills.emptyDescription}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button disabled>{t.settings.skills.emptyButton}</Button>
      </EmptyContent>
    </Empty>
  );
}
