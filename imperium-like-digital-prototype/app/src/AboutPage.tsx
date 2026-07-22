type AboutPageProps = {
  onBack: () => void;
  supportUrl?: string;
};

export default function AboutPage({ onBack, supportUrl }: AboutPageProps) {
  return (
    <main className="about-screen">
      <section className="about-panel" aria-labelledby="about-title">
        <p className="setup-kicker">About</p>
        <h1 id="about-title">Polity Engine</h1>
        <p>Game system designed by Nigel Buckle and Dávid Turczi.</p>
        <p>Implemented by Jonah Daneshmand, Ph.D.</p>
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
        <div className="about-actions">
          {supportUrl ? (
            <a className="about-support-link" href={supportUrl} target="_blank" rel="noreferrer">
              Support hosting: $7.25/month
            </a>
          ) : null}
          <button type="button" onClick={onBack}>
            Back
          </button>
        </div>
      </section>
    </main>
  );
}
