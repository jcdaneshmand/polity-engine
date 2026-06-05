import { useState } from "react";
import type { AccountPublicView } from "../../accountSession";

type AccountPanelProps = {
  account?: AccountPublicView;
  statusMessage: string;
  onRegister: (input: { email: string; username: string; password: string }) => void | Promise<void>;
  onSignIn: (input: { login: string; password: string }) => void | Promise<void>;
  onRequestPasswordReset: (input: { email: string }) => void | Promise<void>;
  onCompletePasswordReset: (input: { token: string; password: string; passwordConfirmation: string }) => void | Promise<void>;
  onChangePassword: (input: { currentPassword: string; password: string }) => void | Promise<void>;
  onSignOut: () => void | Promise<void>;
};

function titleWords(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statRecord(label: string, stats: { gamesPlayed: number; wins: number; losses: number; unfinished: number }) {
  return (
    <div key={label}>
      <span>{label}</span>
      <strong>{stats.wins}-{stats.losses}</strong>
      <small>{stats.gamesPlayed} played{stats.unfinished ? ` / ${stats.unfinished} unfinished` : ""}</small>
    </div>
  );
}

export default function AccountPanel({ account, statusMessage, onRegister, onSignIn, onRequestPasswordReset, onCompletePasswordReset, onChangePassword, onSignOut }: AccountPanelProps) {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [login, setLogin] = useState("");
  const [signInPassword, setSignInPassword] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resetPasswordConfirmation, setResetPasswordConfirmation] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [changedPassword, setChangedPassword] = useState("");

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
        <div className="online-games-actions">
          <label className="setup-field">
            <span>Current Password</span>
            <input type="password" value={currentPassword} onChange={(event: { target: HTMLInputElement }) => setCurrentPassword(event.target.value)} />
          </label>
          <label className="setup-field">
            <span>New Password</span>
            <input type="password" value={changedPassword} onChange={(event: { target: HTMLInputElement }) => setChangedPassword(event.target.value)} />
          </label>
          <button type="button" disabled={!currentPassword || changedPassword.length < 4} onClick={() => void onChangePassword({ currentPassword, password: changedPassword })}>Change Password</button>
        </div>
        <div className="summary-stats">
          {statRecord("Solo Standard", account.stats.solo.standard)}
          {statRecord("Campaign", account.stats.solo.campaign)}
          {statRecord("Practice", account.stats.solo.practice)}
          {statRecord("Online", account.stats.online)}
          {Object.entries(account.stats.byNation).map(([nationID, stats]) => statRecord(titleWords(nationID), stats))}
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
        <button type="button" disabled={!email.trim() || !username.trim() || password.length < 4} onClick={() => void onRegister({ email, username, password })}>Create Account</button>
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
      <div className="online-games-actions">
        <label className="setup-field">
          <span>Forgot Password Email</span>
          <input value={resetEmail} onChange={(event: { target: HTMLInputElement }) => setResetEmail(event.target.value)} />
        </label>
        <button type="button" disabled={!resetEmail.trim()} onClick={() => void onRequestPasswordReset({ email: resetEmail })}>Forgot Password</button>
      </div>
      <div className="online-games-actions">
        <label className="setup-field">
          <span>Reset Token or Link</span>
          <input value={resetToken} onChange={(event: { target: HTMLInputElement }) => setResetToken(event.target.value)} />
        </label>
        <label className="setup-field">
          <span>New Password</span>
          <input type="password" value={resetPassword} onChange={(event: { target: HTMLInputElement }) => setResetPassword(event.target.value)} />
        </label>
        <label className="setup-field">
          <span>Confirm New Password</span>
          <input type="password" value={resetPasswordConfirmation} onChange={(event: { target: HTMLInputElement }) => setResetPasswordConfirmation(event.target.value)} />
        </label>
        <button type="button" disabled={!resetToken.trim() || resetPassword.length < 4 || resetPassword !== resetPasswordConfirmation} onClick={() => void onCompletePasswordReset({ token: resetToken, password: resetPassword, passwordConfirmation: resetPasswordConfirmation })}>Reset Password</button>
      </div>
      {statusMessage ? <p className="setup-help">{statusMessage}</p> : null}
    </section>
  );
}
