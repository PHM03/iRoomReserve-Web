'use client';

import { useEffect, useState, type FormEvent } from 'react';

import { useAuth } from '@/context/AuthContext';
import {
  normalizeAccountType,
  updateAccountSettings,
  type AccountType,
} from '@/lib/auth/auth';

interface AccountSettingsModalProps {
  open: boolean;
  onClose: () => void;
}

const accountTypes: Array<{ label: string; value: AccountType }> = [
  { label: 'Individual', value: 'individual' },
  { label: 'Organization', value: 'organization' },
];

export default function AccountSettingsModal({
  open,
  onClose,
}: Readonly<AccountSettingsModalProps>) {
  const { firebaseUser, profile, reloadProfile } = useAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [accountType, setAccountType] = useState<AccountType>('individual');
  const [organizationName, setOrganizationName] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    if (!open) {
      return;
    }

    setFirstName(profile?.firstName ?? '');
    setLastName(profile?.lastName ?? '');
    setAccountType(normalizeAccountType(profile?.accountType));
    setOrganizationName(profile?.organizationName ?? '');
    setErrorMessage('');
    setSuccessMessage('');
  }, [open, profile]);

  if (!open) {
    return null;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    const normalizedFirstName = firstName.trim();
    const normalizedLastName = lastName.trim();
    const normalizedOrganizationName = organizationName.trim();

    if (!firebaseUser) {
      setErrorMessage('You must be signed in to update account settings.');
      return;
    }

    if (!normalizedFirstName || !normalizedLastName) {
      setErrorMessage('First name and last name are required.');
      return;
    }

    if (accountType === 'organization' && !normalizedOrganizationName) {
      setErrorMessage('Organization name is required for organization accounts.');
      return;
    }

    setSaving(true);

    try {
      await updateAccountSettings(firebaseUser.uid, {
        firstName: normalizedFirstName,
        lastName: normalizedLastName,
        accountType,
        organizationName:
          accountType === 'organization' ? normalizedOrganizationName : null,
      });
      await reloadProfile();
      setSuccessMessage('Account settings saved.');
    } catch (error) {
      console.warn('Failed to update account settings:', error);
      setErrorMessage('Unable to save account settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-white/40 bg-white/95 p-6 shadow-2xl backdrop-blur-xl">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-black">Account Settings</h2>
            <p className="mt-1 text-sm text-black/70">Manage your profile and account type.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-black transition-colors hover:bg-primary/10 hover:text-primary"
            aria-label="Close account settings"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="accountFirstName" className="mb-1.5 block text-sm font-bold text-black">
                First Name
              </label>
              <input
                id="accountFirstName"
                type="text"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                className="glass-input w-full px-4 py-3"
                autoComplete="given-name"
              />
            </div>
            <div>
              <label htmlFor="accountLastName" className="mb-1.5 block text-sm font-bold text-black">
                Last Name
              </label>
              <input
                id="accountLastName"
                type="text"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                className="glass-input w-full px-4 py-3"
                autoComplete="family-name"
              />
            </div>
          </div>

          <div>
            <span className="mb-1.5 block text-sm font-bold text-black">Account Type</span>
            <div className="grid grid-cols-2 gap-2 rounded-xl border border-dark/10 bg-dark/5 p-1">
              {accountTypes.map((type) => (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => setAccountType(type.value)}
                  className={`rounded-lg px-3 py-2.5 text-sm font-bold transition-all ${
                    accountType === type.value
                      ? 'bg-primary text-white shadow-lg shadow-primary/25'
                      : 'text-black hover:bg-primary/10 hover:text-primary'
                  }`}
                >
                  {type.label}
                </button>
              ))}
            </div>
          </div>

          {accountType === 'organization' ? (
            <div>
              <label htmlFor="accountOrganizationName" className="mb-1.5 block text-sm font-bold text-black">
                Organization Name
              </label>
              <input
                id="accountOrganizationName"
                type="text"
                value={organizationName}
                onChange={(event) => setOrganizationName(event.target.value)}
                className="glass-input w-full px-4 py-3"
                placeholder="Enter organization name"
                autoComplete="organization"
              />
            </div>
          ) : null}

          {errorMessage ? <p className="text-sm font-bold ui-text-red">{errorMessage}</p> : null}
          {successMessage ? <p className="text-sm font-bold text-primary">{successMessage}</p> : null}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-dark/10 bg-dark/5 px-4 py-2.5 text-sm font-bold text-black transition-all hover:bg-primary/10 hover:text-primary"
            >
              Close
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn-primary flex items-center justify-center px-4 py-2.5 text-sm"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}