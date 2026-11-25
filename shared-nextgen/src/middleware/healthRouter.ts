import { Router } from 'express';
import { asyncHandler } from './asyncHandler';

export type HealthStatus = 'ok' | 'degraded' | 'unhealthy';

export interface HealthCheck {
  /**
   * Extra fields merged into the response body (after `status` and `service`).
   * A thrown error propagates to the service's error middleware, exactly like
   * a hand-rolled async handler would.
   */
  fields?: () => Record<string, unknown> | Promise<Record<string, unknown>>;
  /** Compute liveness; defaults to 'ok'. Anything else responds 503. */
  status?: () => HealthStatus | Promise<HealthStatus>;
}

export interface HealthRouterOptions {
  /** Service name reported in the response body's `service` field. */
  service: string;
  check?: HealthCheck;
}

/**
 * One shared implementation of the per-service `GET /health` endpoint,
 * replacing the ten hand-rolled handlers. Every service answers with
 * `{ status, service, ...fields }`; the gateway registry classifies a service
 * by `status` ('ok' | 'degraded'), so the shape is a contract, not a convention.
 */
export const healthRouter = ({ service, check = {} }: HealthRouterOptions): Router => {
  const router = Router();
  router.get(
    '/health',
    asyncHandler(async (_req, res) => {
      const fields = (await check.fields?.()) ?? {};
      const status = (await check.status?.()) ?? 'ok';
      res.status(status === 'ok' ? 200 : 503).json({ status, service, ...fields });
    }),
  );
  return router;
};
