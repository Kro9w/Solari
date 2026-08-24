import { useState } from "react";
import { supabase } from "./lib/supabase";
import { useNavigate, Link } from "react-router-dom";

export default function Signup() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const normalizedSurname = lastName.trim().toLowerCase();

    // 1. Check if the surname is allowed
    const { data: allowedData, error: allowedError } = await supabase
      .from("allowed_surnames")
      .select("*")
      .eq("surname", normalizedSurname)
      .single();

    if (allowedError) {
      if (allowedError.code === "PGRST116") {
        setError("Your surname is not on the allowed list.");
      } else {
        setError("Error validating surname. Please try again.");
      }
      setLoading(false);
      return;
    }

    // 2. Check if the surname is already claimed
    if (allowedData.is_claimed) {
      setError("This surname has already been registered.");
      setLoading(false);
      return;
    }

    // 3. Proceed with signup
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: firstName,
          last_name: lastName,
        },
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
    } else {
      // 4. Mark surname as claimed
      await supabase
        .from("allowed_surnames")
        .update({ is_claimed: true })
        .eq("id", allowedData.id);

      navigate("/");
    }
  };

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        justifyContent: "center",
        alignItems: "center",
        background: "var(--cream)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "400px",
          padding: "24px",
          background: "var(--cream-dark)",
          borderRadius: "10px",
          border: "1px solid var(--cream-border)",
        }}
      >
        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "24px",
            marginBottom: "16px",
            color: "var(--ink)",
          }}
        >
          Sign up
        </h2>

        {error && (
          <div
            style={{
              padding: "12px",
              background: "var(--red-bg)",
              color: "var(--red)",
              borderRadius: "6px",
              marginBottom: "16px",
              fontSize: "14px",
            }}
          >
            {error}
          </div>
        )}

        <form
          onSubmit={handleSignup}
          style={{ display: "flex", flexDirection: "column", gap: "16px" }}
        >
          <div style={{ display: "flex", gap: "16px" }}>
            <div style={{ flex: 1 }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "4px",
                  fontSize: "14px",
                  color: "var(--ink-muted)",
                }}
              >
                First Name
              </label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "6px",
                  border: "1px solid var(--cream-border)",
                  background: "var(--cream)",
                  color: "var(--ink)",
                  fontSize: "16px",
                  boxSizing: "border-box",
                }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "4px",
                  fontSize: "14px",
                  color: "var(--ink-muted)",
                }}
              >
                Last Name
              </label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "6px",
                  border: "1px solid var(--cream-border)",
                  background: "var(--cream)",
                  color: "var(--ink)",
                  fontSize: "16px",
                  boxSizing: "border-box",
                }}
              />
            </div>
          </div>
          <div>
            <label
              style={{
                display: "block",
                marginBottom: "4px",
                fontSize: "14px",
                color: "var(--ink-muted)",
              }}
            >
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: "6px",
                border: "1px solid var(--cream-border)",
                background: "var(--cream)",
                color: "var(--ink)",
                fontSize: "16px",
              }}
            />
          </div>
          <div>
            <label
              style={{
                display: "block",
                marginBottom: "4px",
                fontSize: "14px",
                color: "var(--ink-muted)",
              }}
            >
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: "6px",
                border: "1px solid var(--cream-border)",
                background: "var(--cream)",
                color: "var(--ink)",
                fontSize: "16px",
              }}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: "12px",
              background: "var(--accent)",
              color: "var(--cream)",
              border: "none",
              borderRadius: "6px",
              fontWeight: 500,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Creating account..." : "Sign up"}
          </button>
        </form>

        <div
          style={{
            marginTop: "24px",
            textAlign: "center",
            fontSize: "14px",
            color: "var(--ink-muted)",
          }}
        >
          Already have an account?{" "}
          <Link
            to="/login"
            style={{
              color: "var(--accent)",
              textDecoration: "none",
              fontWeight: 500,
            }}
          >
            Log in
          </Link>
        </div>
      </div>
    </div>
  );
}
