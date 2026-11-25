import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { mobileApi, MobileApiError } from "@/api/client";
import type { SpaceUser } from "@/api/contracts";
import { getSession, setSession } from "@/api/session";
import type { AuthRequestOptions } from "@/api/authChallenge";
import { useHumanCheck } from "@/features/human-check/HumanCheckProvider";

type AuthStatus = "initializing" | "authenticated" | "anonymous";

interface AuthContextValue {
  status: AuthStatus;
  user: SpaceUser | null;
  login: (email: string, password: string, options?: AuthRequestOptions) => Promise<void>;
  register: (
    email: string,
    password: string,
    username: string,
    displayName: string,
    options?: AuthRequestOptions,
  ) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const humanCheck = useHumanCheck();
  const [status, setStatus] = useState<AuthStatus>("initializing");
  const [user, setUser] = useState<SpaceUser | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      let stored;
      try { stored = await getSession(); }
      catch {
        if (active) setStatus("anonymous");
        return;
      }
      if (!active) return;
      if (!stored) {
        setStatus("anonymous");
        return;
      }
      setUser(stored.user);
      setStatus("authenticated");
      try {
        const fresh = await mobileApi.getMe();
        if (!active) return;
        const current = await getSession();
        if (active && current && current.user.id === stored.user.id) {
          await setSession({ ...current, user: fresh });
          if (active) setUser(fresh);
        }
      } catch (error) {
        if (
          active &&
          error instanceof MobileApiError &&
          (error.status === 401 || error.status === 403) &&
          !(await getSession())
        ) {
          setUser(null);
          setStatus("anonymous");
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (email: string, password: string, options?: AuthRequestOptions) => {
    const session = await mobileApi.login(email.trim().toLowerCase(), password, { ...options, humanCheck });
    setUser(session.user);
    setStatus("authenticated");
  }, [humanCheck]);

  const register = useCallback(
    async (
      email: string,
      password: string,
      username: string,
      displayName: string,
      options?: AuthRequestOptions,
    ) => {
      const session = await mobileApi.register(
        email.trim().toLowerCase(),
        password,
        username.trim().toLowerCase(),
        displayName.trim(),
        { ...options, humanCheck },
      );
      setUser(session.user);
      setStatus("authenticated");
    },
    [humanCheck],
  );

  const logout = useCallback(async () => {
    await mobileApi.logout();
    setUser(null);
    setStatus("anonymous");
  }, []);

  const value = useMemo(
    () => ({ status, user, login, register, logout }),
    [login, logout, register, status, user],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
