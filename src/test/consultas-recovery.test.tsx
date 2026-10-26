import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Consultas from "@/pages/Consultas";
import { cargarCuentas, clearSession, enviarOtp, verificarOtp } from "@/lib/celesol";

vi.mock("@/lib/celesol", () => ({
  cargarCuentas: vi.fn(), clearSession: vi.fn(), enviarOtp: vi.fn(), verificarOtp: vi.fn(),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/components/LoginStep", () => ({ default: ({ onSubmit }: any) =>
  <button onClick={() => onSubmit("99999999", "qa@example.invalid")}>login-test</button> }));
vi.mock("@/components/OtpStep", () => ({ default: ({ onVerify }: any) =>
  <button onClick={() => onVerify("123456")}>verify-test</button> }));
const results = vi.fn();
vi.mock("@/components/ResultsStep", () => ({ default: (props: any) => { results(props); return null; } }));
vi.mock("@/components/TasasComparativa", () => ({ default: () => null }));

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(enviarOtp).mockResolvedValue({ success: true, nombre: "QA", id: "qa-id", message: "" });
  vi.mocked(verificarOtp).mockResolvedValue({ valid: true, sessionToken: "synthetic", expiresAt: "", nombre: "QA", id: "qa-id", isAdmin: false });
});
afterEach(cleanup);

async function enterAndFail() {
  vi.mocked(cargarCuentas).mockRejectedValueOnce(new Error("Account request failed"));
  render(<Consultas />);
  fireEvent.click(screen.getByText("login-test"));
  fireEvent.click(await screen.findByText("verify-test"));
  await screen.findByRole("alert");
}

describe("Account loading recovery after OTP verification", () => {
  it("retries only the accounts request and delivers recovered account data", async () => {
    await enterAndFail();
    const data = { cuentas: [["438503"]], mapaDueños: { "438503": ["QA"] } };
    vi.mocked(cargarCuentas).mockResolvedValueOnce(data);
    fireEvent.click(screen.getByRole("button", { name: "Reintentar consulta" }));
    await waitFor(() => expect(results).toHaveBeenCalled());
    expect(results.mock.calls[0][0].cuentas).toEqual(data.cuentas);
    expect(cargarCuentas).toHaveBeenCalledTimes(2);
    expect(cargarCuentas).toHaveBeenLastCalledWith("99999999", "qa-id");
    expect(verificarOtp).toHaveBeenCalledTimes(1);
  });

  it("clears the session and permits starting over after an accounts failure", async () => {
    await enterAndFail();
    fireEvent.click(screen.getByRole("button", { name: "Volver" }));
    expect(clearSession).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText("login-test"));
    await waitFor(() => expect(enviarOtp).toHaveBeenCalledTimes(2));
  });

  it("does not request accounts when OTP verification fails", async () => {
    vi.mocked(verificarOtp).mockRejectedValueOnce(new Error("Invalid OTP"));
    render(<Consultas />);
    fireEvent.click(screen.getByText("login-test"));
    fireEvent.click(await screen.findByText("verify-test"));
    await waitFor(() => expect(verificarOtp).toHaveBeenCalledTimes(1));
    expect(cargarCuentas).not.toHaveBeenCalled();
  });
});