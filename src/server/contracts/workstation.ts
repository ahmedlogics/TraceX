import type { RfidStationCode, ScanOutcome, NormalizedTagUid } from "./rfid";

/**
 * Event broadcast to the workstation frontend over Server-Sent Events (SSE) or WebSocket
 * when a physical RFID card is detected and evaluated.
 */
export interface StationScanEvent {
  readonly scanId: string;
  readonly stationCode: RfidStationCode;
  readonly readerIndex: number;
  readonly tagUid: NormalizedTagUid;
  readonly outcome: ScanOutcome;
  readonly outcomeCode: string;
  readonly outcomeMessage?: string;
  readonly subjectKind?: "garment" | "material_lot";
  readonly subjectId?: string;
  readonly subjectCode?: string;
  readonly productName?: string;
  readonly nextExpectedStation?: RfidStationCode;
  readonly timestamp: string;
}

/**
 * Transport interface used by the frontend to stream real-time workstation updates.
 */
export interface IStationTransport {
  /**
   * Subscribes to live scan events for a specific station code.
   * Returns an unsubscribe function.
   */
  subscribe(
    stationCode: RfidStationCode,
    listener: (event: StationScanEvent) => void,
  ): () => void;

  /**
   * Publishes an event to all subscribers listening to the station.
   */
  publish(stationCode: RfidStationCode, event: StationScanEvent): void;
}

/**
 * Station panel state interface used by Member 2 (Receiving, Issue, Cutting, Routine)
 * and Member 3 (QA, Logistics).
 */
export interface StationPanelState<TData = unknown> {
  readonly stationCode: RfidStationCode;
  readonly readerIndex: number;
  readonly isConnected: boolean;
  readonly activeOperatorId?: string;
  readonly activeActionContextId?: string;
  readonly lastScanEvent?: StationScanEvent;
  readonly panelData?: TData;
}

/**
 * Standard props contract for workstation panels created by Members 2 and 3.
 */
export interface StationPanelProps<TData = unknown> {
  readonly stationCode: RfidStationCode;
  readonly state: StationPanelState<TData>;
  readonly onActionInitiated: (actionCode: string, payload?: unknown) => Promise<string>;
  readonly onActionConfirmed: (actionContextId: string) => Promise<void>;
  readonly onActionCancelled: (actionContextId: string) => Promise<void>;
}
