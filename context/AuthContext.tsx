'use client';

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '@/lib/configs/firebase';
import { getUserProfile, logout as firebaseLogout } from '@/lib/auth';
import { type CampusName } from '@/lib/campusAssignments';
import { type ReservationCampus } from '@/lib/campuses';

interface UserProfile {
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  status: string;
  campus?: ReservationCampus | null;
  campusName?: CampusName | null;
}

interface AuthContextType {
  firebaseUser: User | null;
  profile: UserProfile | null;
  loading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  firebaseUser: null,
  profile: null,
  loading: true,
  logout: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const prevUidRef = useRef<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);

      if (user) {
        // Skip re-fetching if the UID hasn't changed (e.g. hot reload, token refresh)
        if (prevUidRef.current === user.uid) {
          setLoading(false);
          return;
        }
        prevUidRef.current = user.uid;
        const data = await getUserProfile(user.uid);
        if (data) {
          setProfile({
            firstName: data.firstName,
            lastName: data.lastName,
            email: data.email,
            role: data.role || 'Student',
            status: data.status || 'approved',
            campus: (data as Record<string, unknown>).campus as ReservationCampus | null | undefined,
            campusName: (data as Record<string, unknown>).campusName as CampusName | null | undefined,
          });
        } else {
          setProfile(null);
        }
      } else {
        prevUidRef.current = null;
        setProfile(null);
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    await firebaseLogout();
    setFirebaseUser(null);
    setProfile(null);
  };

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        profile,
        loading,
        logout: handleLogout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
