// The login screen. The site is public, so the repo holds only salted hashes:
// no username or password in plain text. This keeps visitors out of the app, but
// it doesn't encrypt it: the code and study content can still be read on GitHub.
import { load } from './store.js';

const SESSION = 'jp-trainer.session';
const ACCOUNTS = {
  iter: 600000,
  users: [{
    id: '078165d8e05919bdfe84b581e0b692a3de21fe579003f6abe584a44eef65f809',
    salt: 'gINQE9+Yq0FxlvqNSdra7g==',
    hash: '7K4gdzu6nxErji2Ff29HFZI6Wbkxy/l9PNse3iFlqqE=',
  }],
};

const encode = (text) => new TextEncoder().encode(text);
const fromBase64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const toBase64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const cleanUser = (user) => String(user || '').trim().toLowerCase();

export async function userId(user) {
  const digest = await crypto.subtle.digest('SHA-256', encode(`jp-user:${cleanUser(user)}`));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hashPassword(password, salt, iter) {
  const key = await crypto.subtle.importKey('raw', encode(String(password)), 'PBKDF2', false, ['deriveBits']);
  return toBase64(await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromBase64(salt), iterations: iter }, key, 256,
  ));
}

export async function checkLogin(accounts, user, password) {
  const id = await userId(user);
  const entry = accounts.users.find((u) => u.id === id);
  return Boolean(entry) && await hashPassword(password, entry.salt, accounts.iter) === entry.hash;
}

export function currentUser() {
  try {
    return JSON.parse(localStorage.getItem(SESSION))?.user || null;
  } catch {
    return null;
  }
}

function remember(user) {
  try {
    localStorage.setItem(SESSION, JSON.stringify({ user: cleanUser(user) }));
  } catch { /* Storage is blocked: sign in again next time. */ }
}

// Study progress is stored separately, so logging out leaves it on the device.
export function logOut() {
  try {
    localStorage.removeItem(SESSION);
  } catch { /* Nothing to remove. */ }
  location.reload();
}

function applySavedTheme() {
  const { theme } = load().settings;
  if (theme !== 'system') document.documentElement.dataset.theme = theme;
}

// Resolves once someone is signed in. index.html loads the app after that.
export function gate() {
  if (currentUser()) return Promise.resolve();
  applySavedTheme();
  document.getElementById('top').innerHTML = '<div class="top-in"><span class="mark" aria-hidden="true">学</span><h1>JP Trainer</h1></div>';
  const view = document.getElementById('view');
  view.innerHTML = `<div class="login">
      <div class="login-mark" aria-hidden="true">学</div>
      <form class="card" id="login" autocomplete="on">
        <h2>Log in</h2>
        <label>Username<input id="user" name="username" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" required></label>
        <label>Password<input id="pass" name="password" type="password" autocomplete="current-password" required></label>
        <p class="login-err" id="err" role="alert"></p>
        <button class="btn" id="go" type="submit">Log in</button>
      </form>
      <p class="small muted center">Private. Ask the owner for an account.</p>
    </div>`;
  const form = view.querySelector('#login');
  const err = view.querySelector('#err');
  const go = view.querySelector('#go');
  const pass = view.querySelector('#pass');
  if (!globalThis.crypto?.subtle) {
    err.textContent = "This browser can't check logins. Open the app in Safari over https.";
    go.disabled = true;
  }
  view.querySelector('#user').focus();
  return new Promise((resolve) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      err.textContent = '';
      go.disabled = true;
      go.textContent = 'Checking…';
      const user = view.querySelector('#user').value;
      if (await checkLogin(ACCOUNTS, user, pass.value).catch(() => false)) {
        remember(user);
        view.innerHTML = '<p class="muted center pad">Loading…</p>';
        resolve();
        return;
      }
      err.textContent = 'Wrong username or password.';
      go.disabled = false;
      go.textContent = 'Log in';
      pass.select();
    });
  });
}
