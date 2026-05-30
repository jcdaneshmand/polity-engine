type AboutPageProps = {
  onBack: () => void;
};

export default function AboutPage({ onBack }: AboutPageProps) {
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
        <button type="button" onClick={onBack}>
          Back
        </button>
      </section>
    </main>
  );
}
