import { loadConfig } from './config';
import { createApp } from './app';
import { createLiveFetchers } from './linkedin/liveFetchers';

function main(): void {
  const config = loadConfig();
  const app = createApp(config, createLiveFetchers(config));

  app.listen(config.port, () => {
    console.log(`LinkedIn Profile API listening on :${config.port}`);
    console.log(
      `cache TTL ${config.cacheTtlMs / 3_600_000}h · inbound ${config.rateLimitPerMinute}/min · ` +
        `upstream min interval ${config.upstreamMinIntervalMs}ms`,
    );
  });
}

main();
