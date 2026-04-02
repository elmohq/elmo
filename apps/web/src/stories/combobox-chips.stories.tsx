import type { Meta } from "@storybook/react";
import { useState } from "react";
import { Label } from "@workspace/ui/components/label";
import { ComboboxChips } from "@workspace/ui/components/combobox-chips";
import { TagsInput } from "@workspace/ui/components/tags-input";
import { cleanAndValidateDomain } from "@/lib/domain-categories";

export default {
  title: "Components/ComboboxChips",
} satisfies Meta;

export const After_MultiSelectWithCustomCreate = () => {
  const [values, setValues] = useState<string[]>(["example.com", "blog.example.com"]);

  return (
    <div className="p-8 max-w-xl space-y-6">
      <div className="space-y-2">
        <Label>Domains</Label>
        <ComboboxChips
          value={values}
          onValueChange={setValues}
          placeholder="Add domain..."
          searchPlaceholder="Add domain..."
          maxItems={10}
          normalizeValue={(raw) => cleanAndValidateDomain(raw) ?? raw.trim()}
          options={[
            { value: "example.com" },
            { value: "blog.example.com" },
            { value: "shop.example.com" },
            { value: "docs.example.com" },
          ]}
        />
        <p className="text-xs text-muted-foreground">
          Try typing a new domain and pressing Enter, or paste a comma/newline-separated list.
        </p>
      </div>
    </div>
  );
};

export const Before_TagsInput = () => {
  const [values, setValues] = useState<string[]>(["example.com", "blog.example.com"]);

  return (
    <div className="p-8 max-w-xl space-y-6">
      <div className="space-y-2">
        <Label>Domains</Label>
        <TagsInput value={values} onValueChange={setValues} placeholder="Add domain..." maxItems={10} />
        <p className="text-xs text-muted-foreground">
          Baseline: current TagsInput behavior (Enter to add, paste splitting).
        </p>
      </div>
    </div>
  );
};

