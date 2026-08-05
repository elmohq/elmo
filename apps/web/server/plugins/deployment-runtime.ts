import { initializeWebDeploymentRuntime } from "../../src/lib/deployment-runtime-bootstrap.server";

// Nitro statically imports server plugins before its Node preset calls serve().
// Top-level await makes the runtime fence an actual pre-listen boundary even
// though TanStack's SSR service is otherwise loaded lazily on the first request.
await initializeWebDeploymentRuntime().participant;

export default function deploymentRuntimePlugin(): void {}
