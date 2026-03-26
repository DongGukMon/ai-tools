export interface PipBroadcastDecisionInput {
  isTerminal: boolean;
  wasTerminal: boolean;
  focusedPtyId: string | null;
  hasActivePip: boolean;
  isFocusedPtyMirroring: boolean;
}

export function shouldAttachPrimaryRuntime(isBroadcasting: boolean): boolean {
  return !isBroadcasting;
}

export function shouldStartPipBroadcast({
  isTerminal,
  wasTerminal,
  focusedPtyId,
  hasActivePip,
  isFocusedPtyMirroring,
}: PipBroadcastDecisionInput): boolean {
  return (
    !isTerminal &&
    wasTerminal &&
    Boolean(focusedPtyId) &&
    !hasActivePip &&
    !isFocusedPtyMirroring
  );
}
