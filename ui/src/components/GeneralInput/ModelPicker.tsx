import { CheckIcon, ChevronDownIcon } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { LlmModelGroup } from "@/services/llmModelAdmin";
import { providerDisplayName, providerMark } from "@/utils/llmProviders";

type Props = {
  /** 按供应商分组的启用模型；备用模型已由调用方过滤 */
  groups: LlmModelGroup[];
  value: string;
  onChange: (modelId: string) => void;
  disabled?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerClassName?: (active?: boolean, disabled?: boolean) => string;
};

/**
 * 模型选择器：展示为「供应商 → 该供应商下的模型」两级，
 * 让同一个供应商的多个模型聚合在一起，而不是平铺成一长条。
 */
const ModelPicker: ResearchType.FC<Props> = ({
  groups,
  value,
  onChange,
  disabled,
  open,
  onOpenChange,
  triggerClassName,
}) => {
  const items = groups.flatMap((group) => group.models);
  if (!items.length) return null;

  const current =
    items.find((m) => m.modelId === value || m.modelName === value) ?? items[0];
  const currentGroup =
    groups.find((group) =>
      group.models.some((m) => m.modelId === current?.modelId),
    ) ?? groups[0];
  const currentMark = providerMark(currentGroup?.baseUrl);

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={
            triggerClassName
              ? triggerClassName(Boolean(value), disabled)
              : undefined
          }
          title={`${providerDisplayName(currentGroup?.baseUrl)} · ${current?.modelName ?? ""}`}
          aria-label="选择本轮模型"
        >
          <span
            className="flex size-4 shrink-0 items-center justify-center rounded-[5px] text-[9px] font-bold text-white"
            style={{ background: currentMark.color }}
            aria-hidden="true"
          >
            {currentMark.letter}
          </span>
          <span className="max-w-[120px] truncate">
            {current?.modelName || "模型"}
          </span>
          <ChevronDownIcon className="size-3.5 shrink-0 opacity-50" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="bottom"
        sideOffset={10}
        className="research-composer-menu max-h-[60vh] w-[268px] overflow-y-auto rounded-[18px] border border-black/[0.04] bg-white p-1 shadow-[0_12px_40px_-16px_rgba(15,23,42,0.28)]"
      >
        {groups.map((group, groupIndex) => {
          const mark = providerMark(group.baseUrl);
          return (
            <div key={group.apiId}>
              <div
                className={cn(
                  "flex items-center gap-2 px-2.5 pb-1",
                  groupIndex === 0 ? "pt-1.5" : "pt-3",
                )}
              >
                <span
                  className="flex size-4 shrink-0 items-center justify-center rounded-[5px] text-[9px] font-bold text-white"
                  style={{ background: mark.color }}
                  aria-hidden="true"
                >
                  {mark.letter}
                </span>
                <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-[#86868b]">
                  {providerDisplayName(group.baseUrl)}
                </span>
                <span className="shrink-0 text-[10.5px] text-[#a1a1a6]">
                  {group.models.length}
                </span>
              </div>
              <div className="space-y-0.5">
                {group.models.map((m) => {
                  const active = m.modelId === value || m.modelName === value;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      className={cn(
                        "flex w-full items-center gap-2 rounded-[12px] px-2 py-2 text-left transition-colors",
                        active ? "bg-[#f5f5f7]" : "hover:bg-[#f5f5f7]/80",
                      )}
                      onClick={() => {
                        onChange(m.modelId);
                        onOpenChange(false);
                      }}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13.5px] font-medium text-[#1d1d1f]">
                          {m.modelName}
                        </span>
                        <span className="mt-0.5 block text-[11px] leading-4 text-[#86868b]">
                          {m.modelId}
                          {m.supportsThinking ? " · 思考" : ""}
                          {m.contextWindow
                            ? ` · ${(m.contextWindow / 1000).toFixed(0)}k`
                            : ""}
                        </span>
                      </span>
                      {active ? (
                        <CheckIcon className="size-3.5 shrink-0 text-[#1d1d1f]" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ModelPicker;
