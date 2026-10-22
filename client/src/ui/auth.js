import { request } from '../services/api.js';

export function createAuthController({
  onAuthenticated,
  onBeforeSignOut = async () => {},
  onSignedOut,
  onSignOutError,
}) {
  const authPanel = document.querySelector('#auth-panel');
  const authForm = document.querySelector('#auth-form');
  const authTitle = document.querySelector('#auth-title');
  const authSubmit = document.querySelector('#auth-submit');
  const authSwitch = document.querySelector('#auth-switch');
  const authError = document.querySelector('#auth-error');
  const loginFields = document.querySelector('#login-fields');
  const signupFields = document.querySelector('#signup-fields');
  const authIdentifier = document.querySelector('#auth-identifier');
  const authUsername = document.querySelector('#auth-username');
  const authEmail = document.querySelector('#auth-email');
  const authPassword = document.querySelector('#auth-password');
  const gamePanel = document.querySelector('#game-panel');
  const signoutButton = document.querySelector('#signout-button');

  let authMode = 'login';

  function showAuth(mode = 'login') {
    authMode = mode;
    const signingUp = mode === 'signup';
    authTitle.textContent = signingUp ? 'Create your account' : 'Sign in to play';
    authSubmit.textContent = signingUp ? 'Create account' : 'Sign in';
    authSwitch.textContent = signingUp ? 'Already have an account? Sign in' : 'Need an account? Sign up';
    loginFields.hidden = signingUp;
    signupFields.hidden = !signingUp;
    authIdentifier.required = !signingUp;
    authUsername.required = signingUp;
    authEmail.required = signingUp;
    authPassword.autocomplete = signingUp ? 'new-password' : 'current-password';
    authError.textContent = '';
    authPanel.hidden = false;
    gamePanel.hidden = true;
  }

  authSwitch.addEventListener('click', () => {
    showAuth(authMode === 'login' ? 'signup' : 'login');
  });

  authForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    authSubmit.disabled = true;
    authError.textContent = '';
    try {
      const path = authMode === 'signup' ? '/api/auth/signup' : '/api/auth/login';
      const credentials = authMode === 'signup'
        ? { username: authUsername.value, email: authEmail.value, password: authPassword.value }
        : { identifier: authIdentifier.value, password: authPassword.value };
      const account = await request(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      });
      authForm.reset();
      authPanel.hidden = true;
      gamePanel.hidden = false;
      await onAuthenticated(account);
    } catch (error) {
      console.error(error);
      authError.textContent = error.message;
    } finally {
      authSubmit.disabled = false;
    }
  });

  signoutButton.addEventListener('click', async () => {
    signoutButton.disabled = true;
    try {
      await onBeforeSignOut();
      await request('/api/auth/logout', { method: 'POST' });
      onSignedOut();
      showAuth();
    } catch (error) {
      console.error(error);
      onSignOutError(error);
    } finally {
      signoutButton.disabled = false;
    }
  });

  async function checkSession() {
    try {
      const account = await request('/api/auth/me');
      authPanel.hidden = true;
      gamePanel.hidden = false;
      await onAuthenticated(account);
    } catch (error) {
      if (error.status === 401) {
        showAuth();
        return;
      }
      console.error(error);
      authError.textContent = `Could not check your session: ${error.message}`;
    }
  }

  return { showAuth, checkSession };
}
