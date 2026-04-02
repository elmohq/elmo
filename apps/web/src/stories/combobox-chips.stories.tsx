import type { Meta } from "@storybook/react";
import { useState } from "react";
import { Label } from "@workspace/ui/components/label";
import { TagsInput } from "@workspace/ui/components/tags-input";

export default {
  title: "Components/TagsInput",
} satisfies Meta;

export const FreeformEntries = () => {
  const [values, setValues] = useState<string[]>(["example.com", "blog.example.com"]);

  return (
    <div className="p-8 max-w-xl space-y-6">
      <div className="space-y-2">
        <Label>Domains</Label>
        <TagsInput
          value={values}
          onValueChange={setValues}
          placeholder="Add domain..."
          searchPlaceholder="Add domain..."
          maxItems={10}
        />
        <p className="text-xs text-muted-foreground">
          Type a domain and press Enter, or paste a comma/newline-separated list.
        </p>
      </div>
    </div>
  );
};

export const WithPredefinedOptions = () => {
  const [values, setValues] = useState<string[]>(["react"]);

  return (
    <div className="p-8 max-w-xl space-y-6">
      <div className="space-y-2">
        <Label>Technologies</Label>
        <TagsInput
          value={values}
          onValueChange={setValues}
          placeholder="Select technologies..."
          searchPlaceholder="Search or add..."
          maxItems={5}
          options={[
            { value: "react", label: "React" },
            { value: "vue", label: "Vue" },
            { value: "svelte", label: "Svelte" },
            { value: "angular", label: "Angular" },
            { value: "solid", label: "SolidJS" },
            { value: "htmx", label: "htmx" },
          ]}
        />
        <p className="text-xs text-muted-foreground">
          Pick from suggestions or type your own. Max 5.
        </p>
      </div>
    </div>
  );
};

export const Empty = () => {
  const [values, setValues] = useState<string[]>([]);

  return (
    <div className="p-8 max-w-xl space-y-6">
      <div className="space-y-2">
        <Label>Brand Aliases</Label>
        <TagsInput
          value={values}
          onValueChange={setValues}
          placeholder="Add alias..."
          searchPlaceholder="Add alias..."
        />
      </div>
    </div>
  );
};

export const Disabled = () => {
  return (
    <div className="p-8 max-w-xl space-y-6">
      <div className="space-y-2">
        <Label>Domains (disabled)</Label>
        <TagsInput
          value={["example.com", "blog.example.com"]}
          onValueChange={() => {}}
          placeholder="Add domain..."
          disabled
        />
      </div>
    </div>
  );
};
