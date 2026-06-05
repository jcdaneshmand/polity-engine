import { useState } from "react";
import type { AccountPublicView } from "../../accountSession";

type AccountPanelProps = {
  account?: AccountPublicView;
  statusMessage: string;
  onRegister: (input: { email: string; username: string; password: string }) => void | Promise<void>;
  onSignIn: (input: { login: string; password: string }) => void | Promise<void>;
  onSignOut: () => void | Promise<void>;
};

export default function AccountPanel({ account, statusMessage, onRegister, onSignIn, onSignOut }: AccountPanelProps) {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [login, setLogin] = useState("");
  const [signInPassword, setSignInPassword] = useState("");

  if (account) {
    return (
      <section className="setup-stage" aria-labelledby="account-panel">
        <h2 id="account-panel">Account</h2>
        <div className="online-games-actions">
          <div className="online-card">
            <strong>{account.username}</strong>
            <span>{account.role}</span>
            <small>{account.email}</small>
          </div>
          <button type="button" onClick={() => void onSignOut()}>Sign Out</button>
        </div>
        {statusMessage ? <p className="setup-help">{statusMessage}</p> : null}
      </section>
    );
  }

  return (
    <section className="setup-stage" aria-labelledby="account-panel">
      <h2 id="account-panel">Account</h2>
      <div className="online-games-actions">
        <label className="setup-field">
          <span>Email</span>
          <input value={email} onChange={(event: { target: HTMLInputElement }) => setEmail(event.target.value)} />
        </label>
        <label className="setup-field">
          <span>Username</span>
          <input value={username} onChange={(event: { target: HTMLInputElement }) => setUsername(event.target.value)} />
        </label>
        <label className="setup-field">
          <span>Password</span>
          <input type="password" value={password} onChange={(event: { target: HTMLInputElement }) => setPassword(event.target.value)} />
        </label>
        <button type="button" disabled={!email.trim() || !username.trim() || password.length < 8} onClick={() => void onRegister({ email, username, password })}>Create Account</button>
      </div>
      <div className="online-games-actions">
        <label className="setup-field">
          <span>Username or Email</span>
          <input value={login} onChange={(event: { target: HTMLInputElement }) => setLogin(event.target.value)} />
        </label>
        <label className="setup-field">
          <span>Password</span>
          <input type="password" value={signInPassword} onChange={(event: { target: HTMLInputElement }) => setSignInPassword(event.target.value)} />
        </label>
        <button type="button" disabled={!login.trim() || !signInPassword} onClick={() => void onSignIn({ login, password: signInPassword })}>Sign In</button>
      </div>
      {statusMessage ? <p className="setup-help">{statusMessage}</p> : null}
    </section>
  );
}
