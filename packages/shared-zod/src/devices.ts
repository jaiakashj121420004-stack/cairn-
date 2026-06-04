import { z } from 'zod'

/**
 * Device registry schemas (CLAUDE.md §18.5). Devices are the trust anchors for
 * vault sync — only registered, non-revoked devices may push or pull ops.
 */

export const registerDeviceSchema = z.object({
  /** Human-readable label shown in the device list (e.g. "MacBook Pro"). */
  name: z.string().trim().min(1).max(100),
  /** Optional OS platform string for display purposes. Non-security-bearing. */
  platform: z.string().trim().max(50).optional(),
})
export type RegisterDeviceInput = z.infer<typeof registerDeviceSchema>

export const deviceRecordSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  platform: z.string().nullable(),
  registered_at: z.string().datetime(),
  last_seen_at: z.string().datetime().nullable(),
  revoked_at: z.string().datetime().nullable(),
})
export type DeviceRecord = z.infer<typeof deviceRecordSchema>

export const listDevicesOutputSchema = z.object({
  devices: z.array(deviceRecordSchema),
})
export type ListDevicesOutput = z.infer<typeof listDevicesOutputSchema>

/** POST /devices response — the newly created device record. */
export const registerDeviceOutputSchema = z.object({
  device: deviceRecordSchema,
})
export type RegisterDeviceOutput = z.infer<typeof registerDeviceOutputSchema>

/** DELETE /devices/:id response — soft-revocation acknowledgement. */
export const revokeDeviceOutputSchema = z.object({
  revoked: z.literal(true),
})
export type RevokeDeviceOutput = z.infer<typeof revokeDeviceOutputSchema>
