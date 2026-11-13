UPDATE "brands" SET "enabled_models" = array_replace("enabled_models", 'copilot', 'bing-ai-mode') WHERE 'copilot' = ANY("enabled_models");
