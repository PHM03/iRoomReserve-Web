'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { USER_ROLES } from '@/lib/domain/roles';
import { isAllowedEmail, saveUserProfile, logout } from '@/lib/auth';
import Toast from '@/components/Toast';

export default function RoleSelectionPage() {
    const { firebaseUser, profile } = useAuth();
    const router = useRouter();
    const [selectedRole, setSelectedRole] = useState<
      typeof USER_ROLES.STUDENT | typeof USER_ROLES.FACULTY | typeof USER_ROLES.UTILITY
    >(USER_ROLES.STUDENT);
    const [loading, setLoading] = useState(false);
    const [showToast, setShowToast] = useState(false);
    const handleToastClose = useCallback(() => setShowToast(false), []);
    const email = firebaseUser?.email ?? profile?.email ?? '';
    const isSchoolEmail = isAllowedEmail(email);

    const roles = isSchoolEmail
      ? [
          {
            key: USER_ROLES.STUDENT,
            label: USER_ROLES.STUDENT,
            description: 'Browse and reserve rooms for study or group work'
          },
          {
            key: USER_ROLES.FACULTY,
            label: USER_ROLES.FACULTY,
            description: 'Reserve rooms for classes or faculty meetings'
          },
          {
            key: USER_ROLES.UTILITY,
            label: USER_ROLES.UTILITY,
            description: 'Manage room equipment and facilities'
          },
        ]
      : [
          {
            key: USER_ROLES.UTILITY,
            label: USER_ROLES.UTILITY,
            description: 'Manage room equipment and facilities'
          },
        ];

    useEffect(() => {
        if (!isSchoolEmail && selectedRole !== USER_ROLES.UTILITY) {
            setSelectedRole(USER_ROLES.UTILITY);
        }
    }, [isSchoolEmail, selectedRole]);

    const handleConfirm = async () => {
        if (!firebaseUser) return;
        setLoading(true);
        try {
        if (!isSchoolEmail && selectedRole !== USER_ROLES.UTILITY) {
            return;
        }

        const status = selectedRole === USER_ROLES.STUDENT ? 'approved' : 'pending';

        await saveUserProfile(firebaseUser.uid, {
            firstName: profile?.firstName || firebaseUser.displayName?.split(' ')[0] || '',
            lastName: profile?.lastName || firebaseUser.displayName?.split(' ').slice(1).join(' ') || '',
            email: firebaseUser.email || '',
            role: selectedRole,
            status,
        });

        if (selectedRole === 'Student') {
            setShowToast(true);
            setTimeout(() => {
                router.push('/dashboard');
            }, 1500);  
        } else {
            setShowToast(true);
            setTimeout(async () => {
                await logout();
                router.push('/?pending=true');
            }, 3000)
        }
        } finally {
        setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex flex-col relative overflow-hidden">
            <Toast
                message={
                    selectedRole === USER_ROLES.STUDENT
                    ? 'Account created! Welcome to iRoomReserve.'
                    : selectedRole === USER_ROLES.FACULTY
                        ? 'Account created as Faculty Professor! Your registration is pending for Admin approval.'
                        : selectedRole === USER_ROLES.UTILITY
                        ? 'Account created as Utility Staff! Your registration is pending for Admin approval.'
                        : 'Account created! Your registration is pending for Admin approval.'
                }
                type="success"
                show={showToast}
                onClose={handleToastClose}
            />
      {/* Decorative background orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-secondary/10 blur-3xl" />
      </div>

      {/* Header */}
      <div className="glass-nav py-4 px-4 relative z-10">
        <div className="max-w-md mx-auto">
          <h1 className="text-xl font-bold text-black">iRoomReserve</h1>
          <p className="text-sm text-black">St. Dominic College of Asia</p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center px-4 py-8 relative z-10">
        <div className="glass-card p-8 w-full max-w-md">
          <h2 className="text-2xl font-bold text-black mb-2 text-center">Select Your Role</h2>
          <p className="text-sm text-black text-center mb-6">Choose the role that best describes you</p>

          {!isSchoolEmail ? (
            <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Personal Google accounts can only register as Utility Staff. Student and Faculty accounts are required to register using an SDCA email.
            </div>
          ) : null}

          <div className="space-y-3 mb-6">
            {roles.map((role) => (
              <button
                key={role.key}
                type="button"
                onClick={() => setSelectedRole(role.key)}
                className={`w-full p-4 rounded-xl border text-left transition-all ${
                  selectedRole === role.key
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-dark/10 bg-dark/5 text-black hover:border-primary/30 hover:text-primary'
                }`}
              >
                <p className="font-bold text-sm">{role.label}</p>
                <p className="text-xs mt-0.5 opacity-70">{role.description}</p>
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            className="btn-primary w-full flex items-center justify-center py-3 px-4"
          >
            {loading ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-black" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Saving...
              </>
            ) : (
              'Confirm Role'
            )}
          </button>
        </div>
      </div>

      {/* Footer */}
      <div className="glass-nav py-4 relative z-10">
        <div className="max-w-md mx-auto text-center text-xs text-black font-bold">
          iRoomReserve v1.0 — SDCA Capstone Project
        </div>
      </div>
    </div>
  );
}
