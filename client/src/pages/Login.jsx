import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { BarangaySealSvg } from '../components/Layout';

export default function Login() {
  const { login, loading } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();

  const [roleTab, setRoleTab] = useState('staff'); // 'staff' | 'resident'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!username.trim() || !password) {
      setErrorMsg('Please enter your account ID/username and password.');
      return;
    }

    const res = await login(username.trim(), password);
    if (!res.success) {
      setErrorMsg(res.error || 'Invalid credentials');
      addToast(res.error || 'Invalid credentials', 'error');
      return;
    }

    addToast(`Welcome back, ${res.user.full_name || res.user.username}!`, 'success');
    if (res.user.role === 'resident') {
      navigate('/portal');
    } else {
      navigate('/');
    }
  };

  const fillDemo = (demoRole) => {
    setErrorMsg('');
    if (demoRole === 'admin') {
      setRoleTab('staff');
      setUsername('admin');
      setPassword('admin123');
    } else if (demoRole === 'staff') {
      setRoleTab('staff');
      setUsername('staff1');
      setPassword('staff123');
    } else {
      setRoleTab('resident');
      setUsername('resident1');
      setPassword('resident123');
    }
  };

  return (
    <div className="min-h-screen w-full bg-surface flex flex-col justify-between">
      {/* Barangay Barretto Official Header */}
      <header className="w-full bg-primary text-on-primary px-6 py-4 flex flex-wrap items-center justify-between gap-gutter-sm border-b border-outline-variant">
        <div className="flex items-center gap-gutter-sm">
          <div
            className="w-10 h-10 rounded-md bg-on-primary/15 border border-on-primary/25 flex items-center justify-center shrink-0"
            aria-hidden="true"
          >
            <BarangaySealSvg />
          </div>
          <div>
            <p className="font-headline text-title-md text-on-primary">
              Republic of the Philippines • Barangay Barretto
            </p>
            <p className="font-body text-body-sm text-on-primary/80">
              Olongapo City, Zambales • BDRRMC ReliefOps Portal
            </p>
          </div>
        </div>

        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-on-primary/15 text-on-primary font-body text-label-sm">
          <span className="w-2 h-2 rounded-full bg-emerald-verified" />
          <span>System Operational</span>
        </span>
      </header>

      {/* Centered Auth Card */}
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-surface-container-lowest border border-outline-variant rounded-md shadow-sm p-6 flex flex-col gap-gutter-lg">
          <div className="flex flex-col gap-gutter-xs text-center">
            <h1 className="font-headline text-headline-lg text-on-surface">
              Sign in to ReliefOps
            </h1>
            <p className="font-body text-body-sm text-on-surface-variant">
              Select your access role to continue to Barangay Barretto operations or resident aid self-service.
            </p>
          </div>

          {/* Role Switcher Tabs */}
          <div
            className="grid grid-cols-2 p-1 rounded bg-surface-container-low border border-outline-variant"
            role="tablist"
            aria-label="Portal Role"
          >
            <button
              type="button"
              role="tab"
              aria-selected={roleTab === 'staff'}
              onClick={() => setRoleTab('staff')}
              className={`px-3 py-2 rounded-sm font-body text-label-md transition-colors duration-state-change ${
                roleTab === 'staff'
                  ? 'bg-primary text-on-primary'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Barangay Staff / Admin
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={roleTab === 'resident'}
              onClick={() => setRoleTab('resident')}
              className={`px-3 py-2 rounded-sm font-body text-label-md transition-colors duration-state-change ${
                roleTab === 'resident'
                  ? 'bg-primary text-on-primary'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Resident Portal
            </button>
          </div>

          {errorMsg && (
            <div
              role="alert"
              className="px-3.5 py-2.5 rounded bg-error-container border border-error/20 flex items-center gap-2 text-on-error-container font-body text-body-sm"
            >
              <span className="material-symbols-outlined text-title-sm shrink-0" aria-hidden="true">
                error
              </span>
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Login Form */}
          <form className="flex flex-col gap-gutter-md" onSubmit={handleSubmit}>
            <div className="flex flex-col gap-1">
              <label htmlFor="login-id" className="font-body text-label-md text-on-surface">
                {roleTab === 'resident'
                  ? 'Resident Username or Household ID'
                  : 'Staff Username or Official ID'}
              </label>
              <input
                id="login-id"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={roleTab === 'resident' ? 'resident1' : 'admin or staff1'}
                autoComplete="username"
                className="w-full rounded border-outline-variant bg-surface text-body-md text-on-surface focus:border-primary focus:ring-primary"
              />
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <label htmlFor="login-password" className="font-body text-label-md text-on-surface">
                  Password / PIN
                </label>
                <span className="font-body text-label-sm text-on-surface-variant">
                  BDRRMC Auth
                </span>
              </div>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                autoComplete="current-password"
                className="w-full rounded border-outline-variant bg-surface text-body-md text-on-surface focus:border-primary focus:ring-primary"
              />
            </div>

            <label className="inline-flex items-center gap-gutter-sm cursor-pointer">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="rounded border-outline-variant text-primary focus:ring-primary"
              />
              <span className="font-body text-body-sm text-on-surface-variant">
                Keep me signed in on this terminal
              </span>
            </label>

            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-gutter-sm px-4 py-2.5 rounded bg-primary text-on-primary font-body text-label-lg transition-colors duration-state-change ease-state-change hover:opacity-95 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <span>
                {loading
                  ? 'Signing in...'
                  : roleTab === 'resident'
                  ? 'Enter Resident Aid Portal'
                  : 'Sign In as Staff / Admin'}
              </span>
            </button>
          </form>

          {/* Quick Demo Account Switcher */}
          <div className="pt-3 border-t border-outline-variant flex flex-col gap-2">
            <p className="font-body text-label-sm text-on-surface-variant text-center">
              Quick Demo Credentials (click to autofill)
            </p>
            <div className="grid grid-cols-3 gap-gutter-xs">
              <button
                type="button"
                onClick={() => fillDemo('admin')}
                className="px-2 py-1.5 rounded border border-outline-variant bg-surface text-on-surface font-mono text-mono-sm hover:bg-primary-container hover:text-primary transition-colors duration-state-change"
              >
                admin
              </button>
              <button
                type="button"
                onClick={() => fillDemo('staff')}
                className="px-2 py-1.5 rounded border border-outline-variant bg-surface text-on-surface font-mono text-mono-sm hover:bg-primary-container hover:text-primary transition-colors duration-state-change"
              >
                staff1
              </button>
              <button
                type="button"
                onClick={() => fillDemo('resident')}
                className="px-2 py-1.5 rounded border border-outline-variant bg-surface text-on-surface font-mono text-mono-sm hover:bg-primary-container hover:text-primary transition-colors duration-state-change"
              >
                resident1
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="px-6 py-4 text-center border-t border-outline-variant bg-surface-container-lowest">
        <p className="font-body text-body-sm text-on-surface-variant">
          Barangay Barretto Hall, National Highway, Olongapo City • BDRRMC Emergency Hotline: (047) 222-4190
        </p>
      </footer>
    </div>
  );
}
