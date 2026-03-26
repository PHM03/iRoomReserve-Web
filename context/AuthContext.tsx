'use client';

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { getUserProfile, logout as firebaseLogout } from '@/lib/auth';
import { type AssignedBuildingReference } from '@/lib/assignedBuildings';

interface UserProfile {
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  status: string;
  assignedBuilding?: string;
  assignedBuildingId?: string;
  assignedBuildings?: AssignedBuildingReference[];
  assignedBuildingIds?: string[];
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
            assignedBuilding: (data as Record<string, unknown>).assignedBuilding as string | undefined,
            assignedBuildingId: (data as Record<string, unknown>).assignedBuildingId as string | undefined,
            assignedBuildings: (data as Record<string, unknown>).assignedBuildings as AssignedBuildingReference[] | undefined,
            assignedBuildingIds: (data as Record<string, unknown>).assignedBuildingIds as string[] | undefined,
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
