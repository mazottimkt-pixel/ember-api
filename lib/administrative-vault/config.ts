const boundedInteger = (value: string | undefined, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
};
export function administrativeVaultLimits() {
  return {
    maxFileBytes: boundedInteger(process.env.LUME_FILE_MAX_SIZE_MB, 10, 1, 25) * 1024 * 1024,
    organizationBytes: boundedInteger(process.env.LUME_ORGANIZATION_STORAGE_LIMIT_MB, 500, 10, 10240) * 1024 * 1024,
    retentionDays: boundedInteger(process.env.LUME_FILE_RETENTION_DAYS, 365, 1, 3650),
  };
}
