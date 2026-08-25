'use client';

import { useEffect, useState, type FormEvent } from 'react';

import { useAuth } from '@/context/AuthContext';
import {
  changeCurrentUserPassword,
  normalizeAccountType,
  updateAccountSettings,
  type AccountType,
} from '@/lib/auth/auth';
import { validatePassword } from '@/lib/auth/password';
import { normalizeRole, USER_ROLES } from '@/lib/auth/roles';
import {
  USER_GENDER_LABELS,
  USER_GENDER_VALUES,
  type UserGender,
} from '@/lib/auth/profile-types';

interface AccountSettingsModalProps {
  open: boolean;
  onClose: () => void;
}

interface EyeIconProps {
  open: boolean;
}

function EyeIcon({ open }: Readonly<EyeIconProps>) {
  return open ? (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-5 0-9.27-3.11-11-7.5a11.72 11.72 0 013.168-4.477M6.343 6.343A9.97 9.97 0 0112 5c5 0 9.27 3.11 11 7.5a11.72 11.72 0 01-4.168 4.477M6.343 6.343L3 3m3.343 3.343l2.829 2.829m4.243 4.243L17.657 17.657M17.657 17.657L21 21m-3.343-3.343l-2.829-2.829a3 3 0 00-4.243-4.243" />
    </svg>
  ) : (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  );
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
  const [gender, setGender] = useState<UserGender | ''>('');
  const [accountType, setAccountType] = useState<AccountType>('individual');
  const [organizationName, setOrganizationName] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [showPasswordFields, setShowPasswordFields] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordErrorMessage, setPasswordErrorMessage] = useState('');
  const [passwordSuccessMessage, setPasswordSuccessMessage] = useState('');
  const isStudentAccount = normalizeRole(profile?.role) === USER_ROLES.STUDENT;
  const hasPasswordProvider =
    firebaseUser?.providerData.some((provider) => provider.providerId === 'password') ?? false;

  useEffect(() => {
    if (!open) {
      return;
    }

    setFirstName(profile?.firstName ?? '');
    setLastName(profile?.lastName ?? '');
    setGender(profile?.gender ?? '');
    setAccountType(normalizeAccountType(profile?.accountType));
    setOrganizationName(profile?.organizationName ?? '');
    setErrorMessage('');
    setSuccessMessage('');
    setShowPasswordFields(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmNewPassword('');
    setShowCurrentPassword(false);
    setShowNewPassword(false);
    setShowConfirmNewPassword(false);
    setPasswordErrorMessage('');
    setPasswordSuccessMessage('');
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

    if (isStudentAccount && accountType === 'organization' && !normalizedOrganizationName) {
      setErrorMessage('Organization name is required for organization accounts.');
      return;
    }

    setSaving(true);

    try {
      await updateAccountSettings(firebaseUser.uid, {
        firstName: normalizedFirstName,
        lastName: normalizedLastName,
        gender: gender || null,
        ...(isStudentAccount
          ? {
              accountType,
              organizationName:
                accountType === 'organization' ? normalizedOrganizationName : null,
            }
          : {}),
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

  const getPasswordUpdateErrorMessage = (code?: string) => {
    switch (code) {
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        return 'Current password is incorrect.';
      case 'auth/weak-password':
        return validatePassword(newPassword) ?? 'Password does not meet the requirements.';
      case 'auth/requires-recent-login':
        return 'Please sign in again before changing your password.';
      case 'auth/user-not-found':
        return 'You must be signed in to update your password.';
      default:
        return 'Unable to update password. Please try again.';
    }
  };

  const handlePasswordSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPasswordErrorMessage('');
    setPasswordSuccessMessage('');

    if (!currentPassword || !newPassword || !confirmNewPassword) {
      setPasswordErrorMessage('Please fill in all password fields.');
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setPasswordErrorMessage('New password and confirmation do not match.');
      return;
    }

    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      setPasswordErrorMessage(passwordError);
      return;
    }

    setPasswordSaving(true);

    try {
      await changeCurrentUserPassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setPasswordSuccessMessage('Password updated successfully.');
    } catch (error) {
      const firebaseError = error as { code?: string };
      console.warn('Failed to update password:', error);
      setPasswordErrorMessage(getPasswordUpdateErrorMessage(firebaseError.code));
    } finally {
      setPasswordSaving(false);
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

        <div className="space-y-4">
          <form id="accountSettingsForm" onSubmit={handleSubmit} className="space-y-4">
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
              <label htmlFor="accountGender" className="mb-1.5 block text-sm font-bold text-black">
                Gender <span className="font-normal text-black/50">(optional)</span>
              </label>
              <select
                id="accountGender"
                value={gender}
                onChange={(event) => setGender(event.target.value as UserGender | '')}
                className="glass-input w-full px-4 py-3"
              >
                <option value="">Not specified</option>
                {USER_GENDER_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {USER_GENDER_LABELS[value]}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-xs text-black/55">
                This is optional and is used only for aggregated sentiment analytics.
              </p>
            </div>

            {isStudentAccount ? (
              <>
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
              </>
            ) : null}
          </form>

          <div className="rounded-xl border border-dark/10 bg-dark/5 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-black">Change Password</h3>
              </div>
              {hasPasswordProvider ? (
                <button
                  type="button"
                  onClick={() => {
                    setShowPasswordFields((current) => {
                      if (current) {
                        setCurrentPassword('');
                        setNewPassword('');
                        setConfirmNewPassword('');
                      }
                      return !current;
                    });
                    setPasswordErrorMessage('');
                    setPasswordSuccessMessage('');
                  }}
                  className="rounded-xl border border-dark/10 bg-white/70 px-3 py-2 text-sm font-bold text-black transition-all hover:bg-primary/10 hover:text-primary"
                >
                  {showPasswordFields ? 'Cancel' : 'Change Password'}
                </button>
              ) : null}
            </div>

            {!hasPasswordProvider ? (
              <p className="mt-3 text-sm text-black/70">
                You sign in with Google, so there&apos;s no password to change here.
              </p>
            ) : showPasswordFields ? (
              <form onSubmit={handlePasswordSubmit} className="mt-4 space-y-3">
                <div>
                  <label htmlFor="currentPassword" className="mb-1.5 block text-sm font-bold text-black">
                    Current Password
                  </label>
                  <div className="relative">
                    <input
                      id="currentPassword"
                      type={showCurrentPassword ? 'text' : 'password'}
                      value={currentPassword}
                      onChange={(event) => setCurrentPassword(event.target.value)}
                      className="glass-input w-full px-4 py-3 pr-12"
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword((current) => !current)}
                      className="absolute inset-y-0 right-0 flex items-center pr-4 text-black transition-colors hover:text-primary"
                      aria-label={showCurrentPassword ? 'Hide current password' : 'Show current password'}
                    >
                      <EyeIcon open={showCurrentPassword} />
                    </button>
                  </div>
                </div>
                <div>
                  <label htmlFor="newPassword" className="mb-1.5 block text-sm font-bold text-black">
                    New Password
                  </label>
                  <div className="relative">
                    <input
                      id="newPassword"
                      type={showNewPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      className="glass-input w-full px-4 py-3 pr-12"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword((current) => !current)}
                      className="absolute inset-y-0 right-0 flex items-center pr-4 text-black transition-colors hover:text-primary"
                      aria-label={showNewPassword ? 'Hide new password' : 'Show new password'}
                    >
                      <EyeIcon open={showNewPassword} />
                    </button>
                  </div>
                  <p className="mt-1.5 text-xs text-black">(Min 8 chars, 1 uppercase, 1 number)</p>
                </div>
                <div>
                  <label htmlFor="confirmNewPassword" className="mb-1.5 block text-sm font-bold text-black">
                    Confirm New Password
                  </label>
                  <div className="relative">
                    <input
                      id="confirmNewPassword"
                      type={showConfirmNewPassword ? 'text' : 'password'}
                      value={confirmNewPassword}
                      onChange={(event) => setConfirmNewPassword(event.target.value)}
                      className="glass-input w-full px-4 py-3 pr-12"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmNewPassword((current) => !current)}
                      className="absolute inset-y-0 right-0 flex items-center pr-4 text-black transition-colors hover:text-primary"
                      aria-label={showConfirmNewPassword ? 'Hide confirmed password' : 'Show confirmed password'}
                    >
                      <EyeIcon open={showConfirmNewPassword} />
                    </button>
                  </div>
                </div>

                {passwordErrorMessage ? <p className="text-sm font-bold ui-text-red">{passwordErrorMessage}</p> : null}
                {passwordSuccessMessage ? <p className="text-sm font-bold text-primary">{passwordSuccessMessage}</p> : null}

                <button
                  type="submit"
                  disabled={passwordSaving}
                  className="btn-primary flex w-full items-center justify-center px-4 py-2.5 text-sm"
                >
                  {passwordSaving ? 'Updating...' : 'Update Password'}
                </button>
              </form>
            ) : passwordSuccessMessage ? (
              <p className="mt-3 text-sm font-bold text-primary">{passwordSuccessMessage}</p>
            ) : null}
          </div>

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
              form="accountSettingsForm"
              disabled={saving}
              className="btn-primary flex items-center justify-center px-4 py-2.5 text-sm"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
