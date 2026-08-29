"use client";

import { useActionState, useState } from "react";
import { ArrowRightIcon, LockClosedIcon } from "@radix-ui/react-icons";
import { loginAction, type LoginState } from "./actions";

const initialState: LoginState = {};

type DemoMode = "owner" | "operator";

const demoCredentials: Record<DemoMode, { email: string; password: string }> = {
  owner: { email: "demo@rentflow.kr", password: "demo1234!" },
  operator: { email: "growth@rentflow.kr", password: "demo1234!" },
};

export function LoginForm({ nextPath, demoEnabled, initialMode = "owner" }: { nextPath: string; demoEnabled: boolean; initialMode?: DemoMode }) {
  const [state, formAction, pending] = useActionState(loginAction, initialState);
  const [mode, setMode] = useState<DemoMode>(initialMode);
  const [credentials, setCredentials] = useState(() => demoEnabled ? demoCredentials[initialMode] : { email: "", password: "" });
  const selectMode = (nextMode: DemoMode) => {
    setMode(nextMode);
    setCredentials(demoCredentials[nextMode]);
  };
  return (
    <form action={formAction} className="login-form">
      <input type="hidden" name="next" value={nextPath} />
      {demoEnabled ? <div className="demo-role-switch" role="group" aria-label="데모 계정 선택">
        <button type="button" aria-pressed={mode === "owner"} onClick={() => selectMode("owner")}>임대인 데모</button>
        <button type="button" aria-pressed={mode === "operator"} onClick={() => selectMode("operator")}>운영자 데모</button>
      </div> : null}
      <label className="field-label" htmlFor="email">이메일</label>
      <input
        className="text-input"
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        value={credentials.email}
        onChange={(event) => setCredentials((current) => ({ ...current, email: event.target.value }))}
        required
      />
      <label className="field-label" htmlFor="password">비밀번호</label>
      <input
        className="text-input"
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        value={credentials.password}
        onChange={(event) => setCredentials((current) => ({ ...current, password: event.target.value }))}
        minLength={8}
        required
      />
      {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
      <button className="button button-primary button-wide" type="submit" disabled={pending}>
        {pending ? "로그인하는 중…" : "운영 화면 열기"}
        {!pending ? <ArrowRightIcon width={18} height={18} aria-hidden="true" /> : null}
      </button>
      <p className="login-security"><LockClosedIcon width={14} height={14} aria-hidden="true" /> 로그인 상태는 12시간 동안 유지돼요</p>
    </form>
  );
}
