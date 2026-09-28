#!/usr/bin/env node

/**
 * CLI entry point for AbstractEntity — serves the built entity app
 * (bin/server.js) on 127.0.0.1; the gateway serves it at /apps/entity/.
 *
 * Launch flags are the shared AbstractFramework app flags
 * (@abstractframework/app-server parseAppFlagsOrExit): --gateway-url
 * (aliases --gateway, --url), --port, --host, --help. PORT, HOST,
 * ABSTRACTENTITY_GATEWAY_URL and ABSTRACTGATEWAY_URL are legacy aliases
 * below the flags. With no flag and no environment the gateway is the one
 * installed on this computer (~/.abstractframework/gateway.json), else
 * http://127.0.0.1:8080.
 */

import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createGatewayUrlResolver, parseAppFlagsOrExit } from '@abstractframework/app-server';
import { createEntityServer } from './server.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 3007 = the summoned-entity app's port across the workspace launchers
// (scripts/lib/apps_common.sh ENTITY_PORT default). The default bind is
// loopback (SSRF belt, entity c1768; and the gateway serves the app at
// /apps/entity/): a wider --host is an explicit opt-in.
const flags = parseAppFlagsOrExit(process.argv.slice(2), {
  appName: 'AbstractEntity — create, watch and talk with summoned entities',
  command: 'abstractentity',
  envPrefix: 'ABSTRACTENTITY',
  defaultPort: 3007,
});

// A gateway URL nobody chose (the pointer, or the built-in default) follows
// the pointer while the server runs; a flag or environment choice never moves.
const chosen = flags.gatewayUrlSource === 'flag' || flags.gatewayUrlSource.startsWith('env:');
const server = createEntityServer({
  distDir: join(__dirname, '..', 'dist'),
  gatewayUrl: chosen ? flags.gatewayUrl : createGatewayUrlResolver({}),
});

server.listen(flags.port, flags.host, () => {
  console.log(`
AbstractEntity is running.
  Local:    http://localhost:${flags.port}
  Bind:     ${flags.host}
  Gateway:  ${flags.gatewayUrl} (${flags.gatewayUrlSource})

  Press Ctrl+C to stop
`);
});

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
