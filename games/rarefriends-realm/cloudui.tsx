/**
 * Cloud saves, as the player sees them: where the adventure is saved, the one-time wallet sign-in, bringing an
 * existing adventure up to the cloud, and choosing between two versions when the cloud and this browser disagree.
 * The host page does the work (host/cloud.ts); these only show its state and send the player's choices.
 */
import type { CloudAction, CloudState } from "./roster.ts";
import { Modal } from "./panels.tsx";

/** A save's headline numbers, for comparing two (the game works them out with its own rules). */
export type SaveSummary = { name: string; total: number; combat: number; qp: number; where: string; hours: number } | null;

function ago(at: number | undefined) {
  if (!at) return "";
  const minutes = Math.floor((Date.now() - at) / 60_000);
  return minutes < 1 ? "just now" : minutes < 60 ? `${minutes} min ago` : minutes < 48 * 60 ? `${Math.floor(minutes / 60)} h ago` : `${Math.floor(minutes / 1440)} days ago`;
}
/** One line: where your adventure is saved right now. */
export function cloudLine(cloud: CloudState | null): string {
  if (!cloud || cloud.status === "off") return "";
  switch (cloud.status) {
    case "unverified":
      return cloud.error === "cancelled" ? "You cancelled the signature. Your adventure is still saved in this browser."
        : cloud.error === "expired" ? "Your cloud sign-in has expired: verify your wallet again to keep saving online."
        : cloud.error === "failed" ? "Couldn't sign in just now. Your adventure is still saved in this browser."
        : cloud.error === "no-wallet" ? "Connect your wallet to turn on cloud saves."
        : "Cloud saves are off for this wallet. Verify your wallet once and your adventure saves online automatically, on any device.";
    case "signing": return "Check your wallet: sign the message to turn on cloud saves. It isn't a transaction and costs nothing.";
    case "loading": return "Checking the cloud for your adventure…";
    case "saving": return "☁ Saving to the cloud…";
    case "saved":
      return cloud.imported ? "☁ Your existing adventure is now in the cloud."
        : cloud.savedAt ? `☁ Saved to the cloud ${ago(cloud.savedAt)}.` : "☁ Cloud saves are on: your adventure saves online automatically.";
    case "offline": return "Can't reach the cloud right now. Your adventure is saved in this browser and uploads when the cloud is back.";
    case "conflict": return "The cloud and this browser have different saves for this Friend: choose which to keep.";
    case "import": case "local-only": return "This adventure is only in this browser. Import it to the cloud to keep it safe on any device.";
    case "not-owner": return "This wallet doesn't own this Friend now, so its adventure can't be saved online. Your progress so far is kept, and you can still copy a save code.";
    case "error": return "The cloud refused this save. Your adventure is still saved in this browser.";
  }
  return "";
}
const short = (address?: string) => address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "";

/** The cloud section: status, and the buttons that make sense for it. */
export function CloudControls({ cloud, onAction, compact }: { cloud: CloudState | null; onAction: (action: CloudAction, extra?: Record<string, unknown>) => void; compact?: boolean }) {
  if (!cloud || cloud.status === "off") return null;
  const signedIn = !["unverified", "signing"].includes(cloud.status);
  return (
    <div className={`realm-cloud${compact ? " compact" : ""}`} data-cloud={cloud.status}>
      <p className="realm-cloud-line" role="status">{cloudLine(cloud)}</p>
      <div className="realm-buttons">
        {cloud.status === "unverified" && <button type="button" className="realm-primary" onClick={() => onAction("verify")}>☁ Verify wallet</button>}
        {(cloud.status === "import" || cloud.status === "local-only") && <button type="button" className="realm-primary" onClick={() => onAction("import")}>☁ Import to the cloud</button>}
        {(cloud.status === "offline" || cloud.status === "error") && <button type="button" onClick={() => onAction("retry")}>Try again</button>}
        {!compact && signedIn && cloud.status !== "loading" && <button type="button" className="realm-dark" onClick={() => onAction("sign-out")}>Sign out of cloud saves</button>}
      </div>
      {!compact && signedIn && cloud.address && <p className="realm-muted">Signed in with wallet <code>{short(cloud.address)}</code></p>}
      {!compact && !signedIn && <p className="realm-muted">Verifying asks your wallet to sign a message. It only proves the wallet is yours: it's never a transaction and costs nothing.</p>}
    </div>
  );
}

function SummaryCard({ heading, when, summary }: { heading: string; when: string; summary: SaveSummary }) {
  return (
    <div className="realm-cloud-card">
      <h4>{heading}</h4>
      {when && <p className="realm-muted">{when}</p>}
      {summary ? <ul>
        {summary.name && <li><b>{summary.name}</b></li>}
        <li>{`Total level ${summary.total}`}</li>
        <li>{`Combat level ${summary.combat}`}</li>
        <li>{`Quest points ${summary.qp}`}</li>
        <li>{`In ${summary.where}`}</li>
        <li>{`Played ${summary.hours} h`}</li>
      </ul> : <p>A new adventure</p>}
    </div>
  );
}

/** The two questions the cloud can ask: bring this browser's adventure up, or which of two versions to keep. */
export function CloudDialogs({ cloud, friendId, summarize, onAction }: { cloud: CloudState | null; friendId: number; summarize: (save: Record<string, unknown> | null) => SaveSummary; onAction: (action: CloudAction, extra?: Record<string, unknown>) => void }) {
  if (cloud?.status === "import" && cloud.importable) {
    return (
      <Modal title="Bring your adventure to the cloud" onClose={() => onAction("skip-import")} kind="cloud">
        <p>{cloud.lost ? `The cloud has no save for Friend #${friendId}, but this browser has one. Put it back in the cloud?` : `This browser has an adventure for Friend #${friendId} from before cloud saves:`}</p>
        <SummaryCard heading="In this browser" when="" summary={summarize(cloud.importable)} />
        <p className="realm-muted">Import it and it saves online from now on, on any device. This browser keeps a copy until the cloud confirms it has it.</p>
        <div className="realm-buttons center">
          <button type="button" className="realm-primary" onClick={() => onAction("import")}>☁ Import to the cloud</button>
          <button type="button" onClick={() => onAction("skip-import")}>Not now</button>
        </div>
      </Modal>
    );
  }
  if (cloud?.status === "conflict" && cloud.conflict) {
    const conflict = cloud.conflict;
    return (
      <Modal title="Two versions of this adventure" onClose={() => undefined} kind="cloud" wide>
        <p>{`The cloud and this browser each have a different save for Friend #${friendId}. Choose which one to keep playing.`}</p>
        <div className="realm-cloud-cards">
          <SummaryCard heading="In the cloud" when={`Saved ${ago(conflict.cloudAt)}`} summary={summarize(conflict.cloud)} />
          <SummaryCard heading="In this browser" when={conflict.localAt ? `Last synced ${ago(conflict.localAt)}` : "Never synced to the cloud"} summary={summarize(conflict.local)} />
        </div>
        <p className="realm-muted">The other one isn't thrown away: the cloud keeps its earlier versions, and this browser keeps a backup copy.</p>
        {conflict.where === "play" && <p className="realm-muted">Keeping the cloud's reloads the game.</p>}
        <div className="realm-buttons center">
          <button type="button" className="realm-primary" onClick={() => onAction("keep-cloud")}>Keep the cloud's</button>
          <button type="button" className="realm-primary" onClick={() => onAction("keep-local")}>Keep this browser's</button>
        </div>
      </Modal>
    );
  }
  return null;
}
