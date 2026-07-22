import type { MonthlySupportStatus } from "./onlineSession";

type AboutPageProps = {
  onBack: () => void;
  supportUrl?: string;
  monthlySupportStatus?: MonthlySupportStatus;
  monthlySupportMessage?: string;
  onMarkMonthlySupportCovered?: () => void;
};

function formatSupportMonth(month: string): string {
  const [year, monthNumber] = month.split("-");
  const date = new Date(Date.UTC(Number(year), Number(monthNumber) - 1, 1));
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}

export default function AboutPage({
  onBack,
  supportUrl,
  monthlySupportStatus,
  monthlySupportMessage,
  onMarkMonthlySupportCovered
}: AboutPageProps) {
  const supportMonth = monthlySupportStatus ? formatSupportMonth(monthlySupportStatus.month) : "this month";

  return (
    <main className="about-screen">
      <section className="about-panel" aria-labelledby="about-title">
        <p className="setup-kicker">About</p>
        <h1 id="about-title">Polity Engine</h1>
        <p>Game system designed by Nigel Buckle and D&aacute;vid Turczi.</p>
        <p>Implemented by Jonah Daneshmand, Ph.D.</p>
        <p>
          This fan-made companion is a love letter to the physical game: a way to make setup, learning, and table
          bookkeeping easier while encouraging players to support the official release.
        </p>
        <p>
          It adds value for the original makers by requiring players to use physical content they own. Polity Engine does
          not include official card text, artwork, logos, scans, or component data.
        </p>
        <p>
          Polity Engine is open source. View the project on{" "}
          <a href="https://github.com/jcdaneshmand/polity-engine" target="_blank" rel="noreferrer">
            GitHub
          </a>
          .
        </p>
        <p>
          Contact: <a href="mailto:jcdaneshmand@gmail.com">jcdaneshmand@gmail.com</a>
        </p>
        <p>
          This service is still in active development, and bugs may be encountered. If you find one, please submit a{" "}
          <a href="https://github.com/jcdaneshmand/polity-engine/issues/new" target="_blank" rel="noreferrer">
            GitHub issue
          </a>{" "}
          or email <a href="mailto:jcdaneshmand@gmail.com">jcdaneshmand@gmail.com</a> with the exported playtest
          diagnostics file and a bug description.
        </p>
        {supportUrl ? (
          <div className="about-support-status">
            {monthlySupportStatus?.isCovered ? (
              <p>
                Hosting is covered for {supportMonth}. Thank you; no one else needs to donate this month. Please support
                the official release instead.
              </p>
            ) : (
              <>
                <p>
                  Hosting costs $7.25/month. If one person covers it, the ask disappears for everyone else until next
                  month.
                </p>
                <p>
                  After donating, mark this month covered so other players know they can put their support toward the
                  physical game.
                </p>
              </>
            )}
            {monthlySupportMessage ? <p>{monthlySupportMessage}</p> : null}
          </div>
        ) : null}
        <div className="about-actions">
          {supportUrl && !monthlySupportStatus?.isCovered ? (
            <a className="about-support-link" href={supportUrl} target="_blank" rel="noreferrer">
              Help cover hosting costs only: $7.25/month
            </a>
          ) : null}
          {supportUrl && !monthlySupportStatus?.isCovered && onMarkMonthlySupportCovered ? (
            <button type="button" onClick={onMarkMonthlySupportCovered}>
              Mark This Month Covered
            </button>
          ) : null}
          <button type="button" onClick={onBack}>
            Back
          </button>
        </div>
      </section>
    </main>
  );
}
